// Use AssemblyAI for transcription
import { generateTranscript, type Transcript, type KeyMoment } from './transcript-openai';
import { clipVideoFromBufferMultiFormat } from './video-clipping';
import { downloadFromWasabi, uploadToWasabi, fileExists, listObjectsWithPrefix } from './wasabi-client';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

export interface ProcessingResult {
  transcript: Transcript;
  keyMoments: KeyMoment[];
  clips: Array<{
    moment: KeyMoment;
    horizontal: {
      url: string;
      fileName: string;
    };
    vertical: {
      url: string;
      fileName: string;
    };
  }>;
  status: {
    transcriptGenerated: boolean;
    clipsCreated: boolean;
    errors: string[];
  };
}

export async function processVideo(
  wasabiKey: string,
  originalFileName: string
): Promise<ProcessingResult> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Starting video processing for: ${wasabiKey}`);
  console.log(`Original filename: ${originalFileName}`);
  console.log(`${'='.repeat(60)}\n`);

  // Verify AssemblyAI API key
  if (!process.env.ASSEMBLYAI_API_KEY) {
    throw new Error('ASSEMBLYAI_API_KEY environment variable is not set. Please configure AssemblyAI API key.');
  }
  console.log('✓ AssemblyAI API key found');
  console.log('Starting transcription with AssemblyAI...');

  // Step 1: Download video from Wasabi
  console.log('Step 1: Downloading video from Wasabi...');
  const videoBuffer = await downloadFromWasabi(wasabiKey);
  console.log(`✓ Video downloaded: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  // Step 2: Generate transcript and detect key moments
  console.log('\nStep 2: Generating transcript and detecting key moments...');
  const { transcript, keyMoments } = await generateTranscript(videoBuffer, originalFileName);
  console.log(`✓ Transcript generated with ${transcript.segments.length} segments using AssemblyAI`);
  console.log(`✓ Detected ${keyMoments.length} key moments`);

  if (keyMoments.length === 0) {
    throw new Error('No key moments detected. Cannot create clips.');
  }

  const processingStatus = {
    transcriptGenerated: true,
    clipsCreated: false,
    errors: [] as string[],
  };

  // Step 3: Create clips for each moment in both formats
  console.log('\nStep 3: Creating video clips in multiple formats...');
  const clipsDir = path.join(os.tmpdir(), `clips-${Date.now()}`);
  await fs.mkdir(clipsDir, { recursive: true });

  const clipResults: Array<{
    moment: KeyMoment;
    horizontal: {
      url: string;
      fileName: string;
    };
    vertical: {
      url: string;
      fileName: string;
    };
  }> = [];

  for (let i = 0; i < keyMoments.length; i++) {
    const moment = keyMoments[i];
    const baseFileName = `${sanitizeFileName(moment.title)}`;
    
    console.log(`\nProcessing clip ${i + 1}/${keyMoments.length}: "${moment.title}"`);
    console.log(`  Time range: ${moment.start.toFixed(1)}s - ${moment.end.toFixed(1)}s (duration: ${(moment.end - moment.start).toFixed(1)}s)`);
    
    // Create both horizontal and vertical formats
    console.log(`  Creating clips in both formats...`);
    const { horizontal: horizontalPath, vertical: verticalPath } = 
      await clipVideoFromBufferMultiFormat(videoBuffer, moment, path.join(clipsDir, baseFileName));

    // Verify clip files were created
    const [horizontalExists, verticalExists] = await Promise.all([
      fs.access(horizontalPath).then(() => true).catch(() => false),
      fs.access(verticalPath).then(() => true).catch(() => false),
    ]);
    
    if (!horizontalExists || !verticalExists) {
      throw new Error(`Clip files not created: horizontal=${horizontalExists}, vertical=${verticalExists}`);
    }
    
    // Read both clip files
    console.log(`  Reading clip files...`);
    const [horizontalBuffer, verticalBuffer] = await Promise.all([
      fs.readFile(horizontalPath),
      fs.readFile(verticalPath),
    ]);
    
    console.log(`  Clip file sizes: horizontal=${(horizontalBuffer.length / 1024 / 1024).toFixed(2)} MB, vertical=${(verticalBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    // Upload both formats to Wasabi
    const horizontalFileName = `${baseFileName}-horizontal.mp4`;
    const verticalFileName = `${baseFileName}-vertical.mp4`;
    const baseKey = `clips/${path.basename(wasabiKey, path.extname(wasabiKey))}`;

    // Upload both formats to Wasabi
    const horizontalKey = `${baseKey}/${horizontalFileName}`;
    const verticalKey = `${baseKey}/${verticalFileName}`;

    console.log(`  Uploading clips to Wasabi...`);
    const [horizontalResult, verticalResult] = await Promise.all([
      uploadToWasabi(horizontalKey, horizontalBuffer, 'video/mp4'),
      uploadToWasabi(verticalKey, verticalBuffer, 'video/mp4'),
    ]);

    console.log(`  ✓ Clips uploaded:`);
    console.log(`    Horizontal: ${horizontalResult.key} -> ${horizontalResult.url}`);
    console.log(`    Vertical: ${verticalResult.key} -> ${verticalResult.url}`);
    
    // Verify uploads succeeded (with a small delay to allow S3 propagation)
    await new Promise(resolve => setTimeout(resolve, 500));
    const [horizontalUploaded, verticalUploaded] = await Promise.all([
      fileExists(horizontalKey).catch(() => false),
      fileExists(verticalKey).catch(() => false),
    ]);
    
    if (!horizontalUploaded || !verticalUploaded) {
      console.warn(`  ⚠️  Upload verification failed: horizontal=${horizontalUploaded}, vertical=${verticalUploaded}`);
      processingStatus.errors.push(`Clip ${i + 1} upload verification failed`);
    } else {
      console.log(`  ✓ Upload verified: Both files exist in Wasabi`);
    }

    clipResults.push({
      moment,
      horizontal: {
        url: horizontalResult.url,
        fileName: horizontalFileName,
      },
      vertical: {
        url: verticalResult.url,
        fileName: verticalFileName,
      },
    });
  }

  processingStatus.clipsCreated = true;

  // Step 4: Final verification - list all clips in Wasabi
  console.log(`\nStep 4: Final verification - checking all clips in Wasabi...`);
  const videoName = path.basename(wasabiKey, path.extname(wasabiKey));
  const clipsBasePath = `clips/${videoName}`;
  
  let clipFiles = await listObjectsWithPrefix(`${clipsBasePath}/`);
  if (clipFiles.length === 0) {
    clipFiles = await listObjectsWithPrefix(clipsBasePath);
  }
  
  const clipCount = clipFiles.filter(file => 
    file.includes('-horizontal.mp4') || file.includes('-vertical.mp4')
  ).length;
  
  console.log(`Found ${clipCount} clip file(s) in Wasabi (expected ${clipResults.length * 2})`);
  
  if (clipCount === clipResults.length * 2) {
    console.log(`✓ All clips verified successfully`);
  } else {
    console.warn(`⚠️  Mismatch: Expected ${clipResults.length * 2} clips, found ${clipCount}`);
    console.warn(`   This might indicate some clips failed to upload`);
    processingStatus.errors.push(`Upload verification: Found ${clipCount}/${clipResults.length * 2} clips`);
  }
  
  console.log(`${'='.repeat(60)}\n`);

  return {
    transcript,
    keyMoments,
    clips: clipResults,
    status: processingStatus,
  };
}

function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[^a-z0-9]/gi, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
    .substring(0, 50);
}
