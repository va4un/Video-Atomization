import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import path from 'path';
import { existsSync } from 'fs';

// Cache for the resolved path
let cachedFfmpegPath: string | null = null;

// Resolve ffmpeg path dynamically and normalize it
function getFfmpegPath(): string {
  // Return cached path if already resolved
  if (cachedFfmpegPath) {
    return cachedFfmpegPath;
  }

  const ffmpegPath = ffmpegStatic as string | undefined;
  
  if (!ffmpegPath) {
    throw new Error('ffmpeg-static did not return a valid path');
  }

  console.log('Raw ffmpeg path from ffmpeg-static:', ffmpegPath);

  // Normalize the path to handle Windows paths correctly
  let normalizedPath = path.normalize(ffmpegPath);
  
  // Handle paths that start with backslash (like \ROOT\...)
  if (normalizedPath.startsWith('\\') && !normalizedPath.startsWith('\\\\')) {
    // If it's a relative path starting with backslash, resolve from cwd
    normalizedPath = path.resolve(process.cwd(), normalizedPath.substring(1));
  }
  
  // Resolve to absolute path if it's relative
  const resolvedPath = path.isAbsolute(normalizedPath) 
    ? normalizedPath 
    : path.resolve(process.cwd(), normalizedPath);

  // Verify the file exists
  if (!existsSync(resolvedPath)) {
    console.error('FFmpeg path does not exist:', resolvedPath);
    console.error('Original path from ffmpeg-static:', ffmpegPath);
    console.error('Normalized path:', normalizedPath);
    console.error('Current working directory:', process.cwd());
    
    // Try alternative resolution: resolve from __dirname or process.cwd()
    const altPath = path.resolve(process.cwd(), 'node_modules', 'ffmpeg-static', 
      process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    
    if (existsSync(altPath)) {
      console.log('Found ffmpeg at alternative path:', altPath);
      cachedFfmpegPath = altPath;
      ffmpeg.setFfmpegPath(altPath);
      return altPath;
    }
    
    throw new Error(`FFmpeg executable not found at: ${resolvedPath}`);
  }

  console.log('FFmpeg path resolved:', resolvedPath);
  cachedFfmpegPath = resolvedPath;
  ffmpeg.setFfmpegPath(resolvedPath);
  return resolvedPath;
}

// Initialize the path on module load
getFfmpegPath();

export { ffmpeg };
