import { NextRequest, NextResponse } from 'next/server';
import { processVideo } from '@/lib/services/process-video';

export const runtime = 'nodejs';

/**
 * Retry video processing
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { wasabiKey, fileName } = body;

    if (!wasabiKey || !fileName) {
      return NextResponse.json(
        { error: 'Missing wasabiKey or fileName' },
        { status: 400 }
      );
    }

    console.log(`Retrying processing for: ${wasabiKey}`);

    // Process the video
    const result = await processVideo(wasabiKey, fileName);

    return NextResponse.json({
      success: true,
      message: 'Processing completed successfully',
      result: {
        keyMoments: result.keyMoments.length,
        clips: result.clips.length,
        status: result.status,
      },
    });
  } catch (error) {
    console.error('Error retrying processing:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retry processing',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
