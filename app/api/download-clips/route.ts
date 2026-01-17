import { NextRequest, NextResponse } from 'next/server';
import { listObjectsWithPrefix, downloadFromWasabi } from '@/lib/services/wasabi-client';
import archiver from 'archiver';
import path from 'path';

export const runtime = 'nodejs';

/**
 * Download all clips for a video as a zip file
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

    // Extract video name without extension (same logic as process-video.ts)
    const videoName = path.basename(wasabiKey, path.extname(wasabiKey));
    const clipsBasePath = `clips/${videoName}`;
    
    console.log(`Downloading clips for video: ${videoName}`);
    console.log(`Looking for clips with prefix: ${clipsBasePath}/`);

    // List all clips for this video
    let clipFiles = await listObjectsWithPrefix(`${clipsBasePath}/`);
    
    // If nothing found, try without trailing slash
    if (clipFiles.length === 0) {
      console.log(`No files found with trailing slash, trying without...`);
      clipFiles = await listObjectsWithPrefix(clipsBasePath);
    }

    // Filter to only include clip files (horizontal and vertical)
    const clipKeys = clipFiles.filter(file => 
      file.includes('-horizontal.mp4') || file.includes('-vertical.mp4')
    );

    if (clipKeys.length === 0) {
      return NextResponse.json(
        { error: 'No clips found for this video' },
        { status: 404 }
      );
    }

    console.log(`Found ${clipKeys.length} clip(s) to download`);

    // Create a zip archive
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    // Set up the response stream
    const chunks: Buffer[] = [];
    
    archive.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    archive.on('error', (err) => {
      console.error('Archive error:', err);
    });

    // Download and add each clip to the archive
    for (const clipKey of clipKeys) {
      try {
        console.log(`Downloading clip: ${clipKey}`);
        const clipBuffer = await downloadFromWasabi(clipKey);
        
        // Extract just the filename from the full key
        const fileName = path.basename(clipKey);
        
        // Add file to archive
        archive.append(clipBuffer, { name: fileName });
        console.log(`Added ${fileName} to archive`);
      } catch (error) {
        console.error(`Failed to download clip ${clipKey}:`, error);
        // Continue with other clips even if one fails
      }
    }

    // Finalize the archive
    archive.finalize();

    // Wait for archive to finish
    await new Promise<void>((resolve, reject) => {
      archive.on('end', () => {
        console.log(`Archive created: ${archive.pointer()} bytes`);
        resolve();
      });
      archive.on('error', reject);
    });

    // Combine all chunks into a single buffer
    const zipBuffer = Buffer.concat(chunks);

    // Generate a safe filename
    const zipFileName = `${videoName}-clips.zip`;

    // Return the zip file
    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFileName}"`,
        'Content-Length': zipBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Error downloading clips:', error);
    return NextResponse.json(
      { error: 'Failed to download clips', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
