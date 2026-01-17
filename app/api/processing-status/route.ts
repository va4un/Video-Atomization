import { NextRequest, NextResponse } from 'next/server';
import { fileExists, listObjectsWithPrefix } from '@/lib/services/wasabi-client';
import path from 'path';

export const runtime = 'nodejs';

/**
 * Get processing status for a video
 * Checks if clips were created and metadata was stored
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const wasabiKey = searchParams.get('wasabiKey');

    if (!wasabiKey) {
      return NextResponse.json(
        { error: 'Missing wasabiKey parameter' },
        { status: 400 }
      );
    }

    // Check if video file exists (fast check, silent to reduce log noise)
    const videoExists = await fileExists(wasabiKey, true);

    // Check if clips exist (indicates processing completed)
    // Extract video name without extension (EXACT same logic as process-video.ts)
    const videoName = path.basename(wasabiKey, path.extname(wasabiKey));
    const clipsBasePath = `clips/${videoName}`;
    
    // Optimized: Single listObjects call with reduced MaxKeys for faster response
    // We only need to know if ANY clips exist, not count all of them
    // Silent mode to reduce log noise during frequent polling
    const clipFiles = await listObjectsWithPrefix(`${clipsBasePath}/`, 20, true); // Only need first 20 files max, silent logging
    
    const clipsExist = clipFiles.length > 0 && clipFiles.some(file => 
      file.includes('-horizontal.mp4') || file.includes('-vertical.mp4')
    );
    
    const clipCount = clipFiles.filter(f => f.includes('.mp4')).length;

    return NextResponse.json({
      status: {
        videoExists,
        transcriptGenerated: clipsExist || !videoExists, // Assume transcript is generated if clips exist or video doesn't exist
        clipsCreated: clipsExist,
        processing: videoExists && !clipsExist, // Video exists but clips don't = still processing
      },
      clipCount,
    });
  } catch (error) {
    console.error('Error checking processing status:', error);
    return NextResponse.json(
      { 
        error: 'Failed to check processing status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
