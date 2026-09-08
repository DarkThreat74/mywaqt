import 'server-only';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '@/lib/env';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

/**
 * Cloudflare R2 client (S3-compatible API).
 * Used for storing self-hosted MP3 talks.
 */

const R2_ENDPOINT = `https://${env.r2AccountId}.r2.cloudflarestorage.com`;

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: env.r2AccessKeyId,
    secretAccessKey: env.r2SecretAccessKey,
  },
});

const BUCKET = env.r2BucketName;

/**
 * Generate a presigned PUT URL for uploading audio to R2.
 * The client uploads directly to R2 — no server-side file handling.
 * URL expires in 1 hour (enough for large batch uploads on slow connections).
 */
export async function getUploadUrl(storageKey: string, contentType: string = 'audio/mpeg'): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}

/**
 * Generate a presigned GET URL for streaming audio from R2.
 * URL expires in 6 hours (enough for long talks + pause/resume).
 */
export async function getStreamUrl(storageKey: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
  });
  return getSignedUrl(s3, command, { expiresIn: 6 * 3600 });
}

/**
 * Delete an object from R2 (used when deleting a talk).
 */
export async function deleteObject(storageKey: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
  });
  await s3.send(command);
}

/**
 * Generate a stable storage key for a talk.
 * Format: talks/{folderName}/{timestamp}-{filename}
 */
export function makeStorageKey(folderName: string, filename: string): string {
  const safeFolder = folderName.replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'uncategorized';
  const safeName = filename.replace(/[^a-z0-9.-]/gi, '-').toLowerCase();
  const ts = Date.now();
  return `talks/${safeFolder}/${ts}-${randomUUID()}-${safeName}`;
}

/**
 * Download an object from R2 as a Buffer (used by the audio processing pipeline).
 * For large files, prefer downloadObjectToFile to avoid loading everything into memory.
 */
export async function downloadObject(storageKey: string): Promise<Buffer> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: storageKey });
  const response = await s3.send(command);
  if (!response.Body) throw new Error('Empty response body from R2');
  const stream = response.Body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Download an object from R2 directly to a file (streaming, low memory).
 * Used by the audio processing pipeline for large files to avoid
 * loading 64MB+ into memory as a Buffer.
 */
export async function downloadObjectToFile(storageKey: string, filePath: string): Promise<void> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: storageKey });
  const response = await s3.send(command);
  if (!response.Body) throw new Error('Empty response body from R2');
  const stream = response.Body as Readable;
  await pipeline(stream, createWriteStream(filePath));
}

/**
 * Upload a Buffer to R2 (used by the audio processing pipeline to store processed audio).
 */
export async function uploadBuffer(storageKey: string, body: Buffer, contentType: string = 'audio/mpeg'): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    Body: body,
    ContentType: contentType,
  });
  await s3.send(command);
}
