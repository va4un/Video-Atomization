import { route, type Router } from '@better-upload/server';
import { toRouteHandler } from '@better-upload/server/adapters/next';
import { wasabi } from '@better-upload/server/clients';
import { processVideo } from '@/lib/services/process-video';
import { fileExists } from '@/lib/services/wasabi-client';

const s3 = wasabi({
  region: 'ap-southeast-1',
  accessKeyId: '4ETNB2AGZVGLTGE4NKF6',
  secretAccessKey: 'O66a1nWDtL7F2oskC7VWCAbBzrf6woJc8QbXVeOS',
});

const router: Router = {
  client: s3,
  bucketName: 'atom', 
  routes: {
    video: route({
      fileTypes: ['video/*'],
      multipleFiles: false,
      maxFileSize: 10 * 1024 * 1024 * 1024, // 10GB in bytes
      multipart: true,
      onAfterSignedUrl: async ({ file }) => {
        try {
          console.log('Signed URL created, will start video processing after upload completes...');
          
          // Get the file key from objectInfo
          const fileKey = file.objectInfo?.key;
          if (!fileKey) {
            console.error('Could not determine file key from objectInfo.key, aborting processing.');
            return;
          }

          console.log('File key for processing:', fileKey);
          console.log('File name:', file.name);
          
          // Poll for file existence in the background (fire-and-forget)
          const pollForFile = async () => {
            // Give upload some time to start (initial delay)
            console.log('Waiting 10 seconds for upload to start...');
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            console.log('Starting to poll for file existence...');
            let attempts = 0;
            const maxAttempts = 120; // 10 minutes max wait (120 * 5s = 600s)
            const pollInterval = 5000; // Check every 5 seconds
            
            while (attempts < maxAttempts) {
              try {
                const exists = await fileExists(fileKey);
                if (exists) {
                  console.log(`✓ Upload completed after ${attempts * (pollInterval / 1000)}s, starting video processing...`);
                  
                  // Start processing in the background
                  processVideo(fileKey, file.name || 'video.mp4')
                    .then((result) => {
                      console.log('✓ Video processing completed successfully');
                      console.log(`  - Transcript: ${result.transcript.segments.length} segments`);
                      console.log(`  - Key moments: ${result.keyMoments.length}`);
                      console.log(`  - Clips created: ${result.clips.length * 2} (${result.clips.length} horizontal + ${result.clips.length} vertical)`);
                    })
                    .catch((error) => {
                      console.error('✗ Video processing failed:', error);
                      console.error('  Error details:', error instanceof Error ? error.message : String(error));
                    });
                  return; // Exit polling loop
                }
              } catch (error) {
                // Log error but continue polling (might be transient)
                if (attempts % 12 === 0) { // Log every minute
                  console.log(`  Polling error (attempt ${attempts + 1}):`, error instanceof Error ? error.message : String(error));
                }
              }
              
              // Wait before next check
              if (attempts < maxAttempts - 1) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));
              }
              attempts++;
              
              // Log progress every 12 attempts (1 minute)
              if (attempts % 12 === 0) {
                console.log(`  Still waiting for upload... (${(attempts * pollInterval / 1000)}s elapsed)`);
              }
            }
            
            // If we get here, upload timed out
            console.warn(`⚠️  Upload timeout after ${maxAttempts * (pollInterval / 1000)}s - file may still be uploading`);
            console.warn(`   File key: ${fileKey}`);
            console.warn(`   Processing may not start automatically. Use retry endpoint if needed.`);
          };
          
          // Start polling in background (don't await)
          pollForFile().catch((error) => {
            console.error('Error in polling function:', error);
          });
        } catch (error) {
          console.error('Error in onAfterSignedUrl callback:', error);
        }
      },
    }),
  },
};
export const { POST } = toRouteHandler(router);