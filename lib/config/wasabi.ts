/**
 * Shared Wasabi configuration
 * Reused by both better-upload and direct S3 operations
 */
export const WASABI_CONFIG = {
  region: 'ap-southeast-1',
  accessKeyId: '4ETNB2AGZVGLTGE4NKF6',
  secretAccessKey: 'O66a1nWDtL7F2oskC7VWCAbBzrf6woJc8QbXVeOS',
  endpoint: 'https://s3.ap-southeast-1.wasabisys.com',
  bucketName: 'atom',
} as const;
