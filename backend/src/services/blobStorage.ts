/**
 * Blob Storage Service
 *
 * Uses Vercel Blob for cloud file storage when BLOB_READ_WRITE_TOKEN is set.
 * Falls back to local disk storage (uploads/ directory) in dev mode.
 */

import { put, del } from '@vercel/blob';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Read token lazily at call time (dotenv may not have loaded at import time)
function getBlobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN;
}

const UPLOADS_DIR = path.join(__dirname, '../../uploads');

export interface BlobResult {
  url: string;
  pathname: string;
  size: number;
}

/**
 * Upload a file to Vercel Blob (or local disk as fallback).
 */
export async function uploadToBlob(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<BlobResult> {
  const token = getBlobToken();
  if (token) {
    // Cloud storage via Vercel Blob
    const pathname = `uploads/${uuidv4()}/${filename}`;
    const blob = await put(pathname, buffer, {
      access: 'public',
      contentType: mimeType,
      token,
    });
    return {
      url: blob.url,
      pathname: blob.pathname,
      size: buffer.length,
    };
  }

  // Local fallback
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  const fileId = uuidv4();
  const ext = path.extname(filename);
  const diskName = `${fileId}${ext}`;
  const diskPath = path.join(UPLOADS_DIR, diskName);
  fs.writeFileSync(diskPath, buffer);

  return {
    url: `local://${diskName}`,
    pathname: diskName,
    size: buffer.length,
  };
}

/**
 * Delete a file from Vercel Blob (or local disk).
 */
export async function deleteFromBlob(url: string): Promise<void> {
  if (url.startsWith('local://')) {
    const filename = url.replace('local://', '');
    const diskPath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
    return;
  }

  const token = getBlobToken();
  if (token) {
    await del(url, { token });
  }
}

/**
 * Get the public URL for a file.
 * For Vercel Blob files, returns the URL directly.
 * For local files, returns a path suitable for the local file-serve endpoint.
 */
export function getFileUrl(url: string): string {
  if (url.startsWith('local://')) {
    const filename = url.replace('local://', '');
    return `/api/upload/file/${filename}`;
  }
  return url;
}

/**
 * Read a file's content as a Buffer (for AI consumption).
 * Works with both Vercel Blob URLs and local paths.
 */
export async function readBlobContent(url: string): Promise<Buffer | null> {
  if (url.startsWith('local://')) {
    const filename = url.replace('local://', '');
    const diskPath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(diskPath)) return null;
    return fs.readFileSync(diskPath);
  }

  // Fetch from Vercel Blob URL
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}
