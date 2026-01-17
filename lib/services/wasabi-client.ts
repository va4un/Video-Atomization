// lib/services/wasabi-client.ts
import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { WASABI_CONFIG } from '@/lib/config/wasabi';
import { Readable } from 'stream';

const nodeS3 = new S3Client({
  region: WASABI_CONFIG.region,
  endpoint: WASABI_CONFIG.endpoint,
  credentials: {
    accessKeyId: WASABI_CONFIG.accessKeyId,
    secretAccessKey: WASABI_CONFIG.secretAccessKey,
  },
  forcePathStyle: true,
});

// 1) check if object exists (for polling)
export async function fileExists(key: string, silent: boolean = false) {
  try {
    const result = await nodeS3.send(
      new HeadObjectCommand({
        Bucket: WASABI_CONFIG.bucketName,
        Key: key,
      }),
    );
    // Only log if not silent (reduce noise during frequent status checks)
    if (!silent) {
      console.log(`File exists check successful for key: "${key}"`);
      console.log(`File size: ${result.ContentLength} bytes`);
    }
    return true;
  } catch (err: unknown) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    const code = (err as { name?: string; Code?: string })?.name || (err as { Code?: string })?.Code;

    if (status === 404 || code === 'NotFound' || code === 'NoSuchKey') {
      // Don't log 404s during status checks (expected when clips don't exist yet)
      if (!silent) {
        console.log(`File does not exist (404/NotFound) for key: "${key}"`);
      }
      return false;
    }

    // Always log actual errors
    console.error(`Error checking file existence for key: "${key}"`, {
      status,
      code,
      error: err,
    });
    throw err;
  }
}

// 2) download full object into a Buffer (for ffmpeg input)
export async function downloadFromWasabi(key: string): Promise<Buffer> {
  const res = await nodeS3.send(
    new GetObjectCommand({
      Bucket: WASABI_CONFIG.bucketName,
      Key: key,
    }),
  );

  const body = res.Body;
  if (!body) return Buffer.alloc(0);

  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  // For Node 18+ fetch-style streams
  // @ts-ignore
  if (typeof body.arrayBuffer === 'function') {
    // @ts-ignore
    const ab = await body.arrayBuffer();
    return Buffer.from(ab);
  }

  throw new Error('Unsupported Body stream type from Wasabi');
}

// 3) upload Buffer back to Wasabi and return key or URL
export async function uploadToWasabi(
  key: string,
  body: Buffer,
  contentType?: string,
): Promise<{ key: string; url: string }> {
  await nodeS3.send(
    new PutObjectCommand({
      Bucket: WASABI_CONFIG.bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  const url = `${WASABI_CONFIG.endpoint.replace(/\/$/, '')}/${WASABI_CONFIG.bucketName}/${key}`;
  return { key, url };
}

// 4) List objects with a prefix (to check if clips exist)
export async function listObjectsWithPrefix(prefix: string, maxKeys: number = 20, silent: boolean = false): Promise<string[]> {
  try {
    const command = new ListObjectsV2Command({
      Bucket: WASABI_CONFIG.bucketName,
      Prefix: prefix,
      MaxKeys: maxKeys, // Reduced default for faster responses (20 is enough to detect clips)
    });

    const response = await nodeS3.send(command);
    const keys = (response.Contents || []).map(obj => obj.Key || '').filter(Boolean);
    
    // Only log if we find files and not silent (reduce noise in frequent status checks)
    if (keys.length > 0 && !silent) {
      console.log(`Found ${keys.length} object(s) with prefix "${prefix}"`);
    }
    
    return keys;
  } catch (err) {
    const error = err as { $metadata?: { httpStatusCode?: number }; message?: string };
    const status = error.$metadata?.httpStatusCode;
    
    // 404 is okay - means no files with that prefix
    if (status === 404) {
      return [];
    }
    
    // Always log actual errors
    console.error(`Error listing objects with prefix "${prefix}":`, error.message || error);
    return [];
  }
}
