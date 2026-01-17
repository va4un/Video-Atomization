import { ffmpeg } from './ffmpeg'; 
import { KeyMoment } from './transcript-openai';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';


export type ClipOrientation = 'horizontal' | 'vertical';

export interface ClipResult {
  moment: KeyMoment;
  filePath: string;
  fileName: string;
  orientation: ClipOrientation;
  aspectRatio: string; // '16:9' or '9:16'
}

/**
 * Clips video segments for each key moment using ffmpeg
 */
export async function clipVideoMoments(
  inputVideoPath: string,
  moments: KeyMoment[],
  outputDir?: string
): Promise<ClipResult[]> {
  const clips: ClipResult[] = [];
  const outputDirectory = outputDir || path.join(os.tmpdir(), 'video-clips');

  // Ensure output directory exists
  await fs.mkdir(outputDirectory, { recursive: true });

  for (let i = 0; i < moments.length; i++) {
    const moment = moments[i];
    const fileName = `${sanitizeFileName(moment.title)}.mp4`;
    const outputPath = path.join(outputDirectory, fileName);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputVideoPath)
        .setStartTime(moment.start)
        .setDuration(moment.end - moment.start)
        .output(outputPath)
        .on('end', () => {
          console.log(`Clip ${i + 1} created: ${fileName}`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`Error creating clip ${i + 1}:`, err);
          reject(err);
        })
        .run();
    });

    clips.push({
      moment,
      filePath: outputPath,
      fileName,
      orientation: 'horizontal' as ClipOrientation,
      aspectRatio: '16:9',
    });
  }

  return clips;
}

/**
 * Creates clips in both horizontal (16:9) and vertical (9:16) formats
 */
export async function clipVideoFromBufferMultiFormat(
  videoBuffer: Buffer,
  moment: KeyMoment,
  baseOutputPath: string
): Promise<{ horizontal: string; vertical: string }> {
  // Use a single temp input file for both clips to avoid multiple file locks
  const tempInputPath = path.join(os.tmpdir(), `temp-input-${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`);
  await fs.writeFile(tempInputPath, videoBuffer);

  const baseName = path.basename(baseOutputPath, path.extname(baseOutputPath));
  const dir = path.dirname(baseOutputPath);
  
  const horizontalPath = path.join(dir, `${baseName}-horizontal.mp4`);
  const verticalPath = path.join(dir, `${baseName}-vertical.mp4`);

  try {
    // Create both formats in parallel using the same temp input file
    await Promise.all([
      clipVideoFromFile(tempInputPath, moment, horizontalPath, 'horizontal'),
      clipVideoFromFile(tempInputPath, moment, verticalPath, 'vertical'),
    ]);

    return {
      horizontal: horizontalPath,
      vertical: verticalPath,
    };
  } finally {
    // Clean up temp input file with retry
    let retries = 3;
    while (retries > 0) {
      try {
        await fs.unlink(tempInputPath);
        break;
      } catch (err) {
        retries--;
        if (retries === 0) {
          console.warn('Failed to delete temp input file after retries:', tempInputPath);
        } else {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
  }
}

/**
 * Clips a single moment from a file path (reused temp file)
 */
async function clipVideoFromFile(
  inputPath: string,
  moment: KeyMoment,
  outputPath: string,
  orientation: ClipOrientation = 'horizontal'
): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    const ffmpegCommand = ffmpeg(inputPath)
      .setStartTime(moment.start)
      .setDuration(moment.end - moment.start);

    if (orientation === 'vertical') {
      // Vertical format (9:16)
      ffmpegCommand
        .outputOptions([
          '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', 'faststart'
        ]);
    } else {
      // Horizontal format (16:9)
      ffmpegCommand
        .outputOptions([
          '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', 'faststart'
        ]);
    }

    ffmpegCommand
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });

  return outputPath;
}

function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[^a-z0-9]/gi, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
    .substring(0, 50);
}
