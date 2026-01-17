import { AssemblyAI } from 'assemblyai';
import { ffmpeg } from './ffmpeg';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

export interface TimestampedSegment {
  start: number; // in seconds
  end: number; // in seconds
  text: string;
}

export interface Transcript {
  segments: TimestampedSegment[];
  fullText: string;
}

export interface KeyMoment {
  start: number; // in seconds
  end: number; // in seconds
  title: string;
  description: string;
  segmentIndex: number;
}

// Initialize AssemblyAI client
function getAssemblyAIClient(): AssemblyAI {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new Error('ASSEMBLYAI_API_KEY environment variable is not set. Get a free API key at https://www.assemblyai.com/');
  }
  return new AssemblyAI({ apiKey });
}

/**
 * Generates a timestamped transcript from a video file using ffmpeg + AssemblyAI
 * Uses ffmpeg to extract audio, then sends audio to AssemblyAI for transcription
 */
export async function generateTranscript(
  videoBuffer: Buffer,
  filename: string
): Promise<{ transcript: Transcript; keyMoments: KeyMoment[] }> {
  // Step 1: Extract audio from video using ffmpeg
  const tempVideoPath = path.join(os.tmpdir(), `video-${Date.now()}-${filename}`);
  const tempAudioPath = path.join(os.tmpdir(), `audio-${Date.now()}-${path.basename(filename, path.extname(filename))}.mp3`);
  
  try {
    await fs.writeFile(tempVideoPath, videoBuffer);

    console.log('Extracting audio from video using ffmpeg...');
    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempVideoPath)
        .output(tempAudioPath)
        .audioCodec('libmp3lame')
        .audioBitrate(128)
        .on('end', () => {
          console.log('Audio extraction complete');
          resolve();
        })
        .on('error', (err) => {
          console.error('Error extracting audio:', err);
          reject(err);
        })
        .run();
    });

    // Verify audio file was created
    const audioStats = await fs.stat(tempAudioPath);
    console.log(`Audio file created: ${(audioStats.size / 1024 / 1024).toFixed(2)} MB`);
    if (audioStats.size === 0) {
      throw new Error('Audio extraction failed: output file is empty');
    }

    // Step 2: Transcribe audio using AssemblyAI
    console.log('Starting transcription with AssemblyAI...');
    const client = getAssemblyAIClient();
    
    let transcriptResult;
    
    try {
      // According to AssemblyAI docs, we can pass local file path directly
      // The SDK will handle upload and transcription
      // Word timestamps are included by default in the response
      console.log('Uploading audio to AssemblyAI and starting transcription...');
      const transcript = await client.transcripts.transcribe({
        audio: tempAudioPath, // Local file path - SDK handles upload
        // Word timestamps are automatically included in the response
      });
      
      console.log(`Transcription job created. ID: ${transcript.id}, Status: ${transcript.status}`);

      if (transcript.status === 'error') {
        throw new Error(`Transcription failed: ${transcript.error || 'Unknown error'}`);
      }

      console.log(`Transcription started. Status: ${transcript.status}`);

      // Wait for transcription to complete
      transcriptResult = transcript;
      let attempts = 0;
      const maxAttempts = 60; // 3 minutes max wait time
      
      console.log('Waiting for transcription to complete...');
      while (transcriptResult.status !== 'completed' && transcriptResult.status !== 'error' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        transcriptResult = await client.transcripts.get(transcriptResult.id);
        attempts++;
        
        if (transcriptResult.status === 'error') {
          throw new Error(`Transcription failed: ${transcriptResult.error || 'Unknown error'}`);
        }
        
        if (attempts % 10 === 0) {
          console.log(`  Transcription in progress... (${attempts}/${maxAttempts} checks, status: ${transcriptResult.status})`);
        }
      }

      if (transcriptResult.status !== 'completed') {
        throw new Error(`Transcription timed out or failed. Final status: ${transcriptResult.status}`);
      }

      console.log(`✓ Transcription completed successfully`);
      console.log(`  Transcript ID: ${transcriptResult.id}`);
      console.log(`  Word count: ${transcriptResult.words?.length || 0}`);
    } catch (error) {
      console.error('AssemblyAI transcription error:', error);
      throw error;
    }

    // Step 3: Convert AssemblyAI response to our format
    const segments: TimestampedSegment[] = [];
    
    if (transcriptResult.words && transcriptResult.words.length > 0) {
      // Use word-level timestamps for precise segmentation
      let currentSegment: TimestampedSegment | null = null;
      const segmentDuration = 5; // Group words into ~5 second segments
      
      for (const word of transcriptResult.words) {
        const wordStart = word.start / 1000; // Convert from ms to seconds
        const wordEnd = word.end / 1000;
        
        if (!currentSegment || wordStart >= currentSegment.start + segmentDuration) {
          // Start a new segment
          if (currentSegment) {
            segments.push(currentSegment);
          }
          currentSegment = {
            start: wordStart,
            end: wordEnd,
            text: word.text,
          };
        } else {
          // Add to current segment
          currentSegment.end = wordEnd;
          currentSegment.text += ' ' + word.text;
        }
      }
      
      // Add the last segment
      if (currentSegment) {
        segments.push(currentSegment);
      }
    } else if (transcriptResult.utterances && transcriptResult.utterances.length > 0) {
      // Fallback to utterance-level timestamps
      segments.push(...transcriptResult.utterances.map(utt => ({
        start: utt.start / 1000, // Convert from ms to seconds
        end: utt.end / 1000,
        text: utt.text,
      })));
    } else if (transcriptResult.text) {
      // Last resort: create a single segment with the full text
      const duration = transcriptResult.audio_duration ? transcriptResult.audio_duration / 1000 : 0;
      segments.push({
        start: 0,
        end: duration,
        text: transcriptResult.text,
      });
    } else {
      throw new Error('No transcript text or word timestamps available from AssemblyAI');
    }

    const fullText = segments.map(s => s.text).join(' ');

    console.log(`✓ Transcript generated with ${segments.length} segments using AssemblyAI`);

    // Step 4: Detect key moments locally based on topic changes
    console.log('Detecting key moments from transcript...');
    const keyMoments = detectKeyMomentsFromTranscript(segments);
    console.log(`✓ Detected ${keyMoments.length} key moments`);

    return {
      transcript: {
        segments,
        fullText,
      },
      keyMoments,
    };
  } finally {
    // Clean up temp files
    try {
      await fs.unlink(tempVideoPath);
    } catch (err) {
      console.warn('Failed to delete temp video file:', err);
    }
    try {
      await fs.unlink(tempAudioPath);
    } catch (err) {
      console.warn('Failed to delete temp audio file:', err);
    }
  }
}

/**
 * Detects 3-5 key moments based on topic changes in the transcript
 * Uses semantic similarity, transition phrases, and question patterns
 */
function detectKeyMomentsFromTranscript(segments: TimestampedSegment[]): KeyMoment[] {
  if (segments.length === 0) return [];

  const targetCount = Math.min(5, Math.max(3, Math.floor(segments.length / 10)));
  const keyMoments: KeyMoment[] = [];

  // Simple topic change detection based on:
  // 1. Semantic similarity between adjacent segments
  // 2. Transition phrases
  // 3. Question patterns
  
  const transitionPhrases = [
    'now', 'next', 'then', 'also', 'additionally', 'furthermore',
    'however', 'but', 'although', 'meanwhile', 'finally', 'in conclusion',
    'let me', 'i want to', 'we should', 'we need to', 'important',
  ];

  const questionWords = ['what', 'why', 'how', 'when', 'where', 'who', 'which'];

  // Calculate simple text similarity (word overlap)
  function calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    return intersection.size / union.size;
  }

  // Find segments with significant topic changes
  const topicChanges: number[] = [];
  
  for (let i = 1; i < segments.length; i++) {
    const prevText = segments[i - 1].text.toLowerCase();
    const currText = segments[i].text.toLowerCase();
    
    const similarity = calculateSimilarity(segments[i - 1].text, segments[i].text);
    const hasTransition = transitionPhrases.some(phrase => currText.includes(phrase));
    const hasQuestion = questionWords.some(word => currText.startsWith(word) || currText.includes(` ${word} `));
    
    // Topic change score: low similarity + transition/question indicators
    const changeScore = (1 - similarity) * 0.7 + (hasTransition ? 0.2 : 0) + (hasQuestion ? 0.1 : 0);
    
    if (changeScore > 0.4) {
      topicChanges.push(i);
    }
  }

  // Select well-distributed key moments
  if (topicChanges.length >= targetCount) {
    // Use actual topic changes
    const step = Math.floor(topicChanges.length / targetCount);
    for (let i = 0; i < targetCount; i++) {
      const idx = topicChanges[Math.min(i * step, topicChanges.length - 1)];
      const segment = segments[idx];
      const start = Math.max(0, segment.start - 2);
      const end = Math.min(
        segments[segments.length - 1].end,
        segment.end + 3
      );
      
      keyMoments.push({
        start,
        end,
        title: segment.text.substring(0, 50).replace(/\s+/g, ' ').trim() + (segment.text.length > 50 ? '...' : ''),
        description: segment.text.substring(0, 150),
        segmentIndex: idx,
      });
    }
  } else {
    // Fallback: distribute evenly
    const totalDuration = segments[segments.length - 1].end;
    const interval = totalDuration / (targetCount + 1);
    
    for (let i = 1; i <= targetCount; i++) {
      const targetTime = interval * i;
      const segment = segments.find(s => s.start <= targetTime && s.end >= targetTime) || 
                     segments[Math.floor((i / (targetCount + 1)) * segments.length)];
      
      if (segment) {
        const start = Math.max(0, segment.start - 2);
        const end = Math.min(totalDuration, segment.end + 3);
        
        keyMoments.push({
          start,
          end,
          title: segment.text.substring(0, 50).replace(/\s+/g, ' ').trim() + (segment.text.length > 50 ? '...' : ''),
          description: segment.text.substring(0, 150),
          segmentIndex: segments.indexOf(segment),
        });
      }
    }
  }

  // Log detected moments
  keyMoments.forEach((moment, idx) => {
    console.log(`  Moment ${idx + 1}: "${moment.title}" (${moment.start.toFixed(1)}s - ${moment.end.toFixed(1)}s)`);
  });

  return keyMoments;
}
