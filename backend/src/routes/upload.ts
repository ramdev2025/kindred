import { Router, Response } from 'express';
import multer from 'multer';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { uploadToBlob, readBlobContent } from '../services/blobStorage';
import { findOrCreateUser, saveProjectFile, getUserStorageUsage } from '../db/queries';

export const uploadRouter = Router();
uploadRouter.use(requireAuth as any);

// Max storage per user: 100MB
const MAX_USER_STORAGE_BYTES = 100 * 1024 * 1024;

// Use multer memory storage so we get buffers for blob upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/csv', 'text/plain', 'application/json'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});

// In-memory index for fast lookup during the session (maps fileId → blob metadata)
interface FileEntry {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  blobUrl: string;
}

const fileIndex = new Map<string, FileEntry>();

// Also keep legacy disk-based index for backwards compat (existing uploads)
const UPLOADS_DIR = path.join(__dirname, '../../uploads');
try {
  if (fs.existsSync(UPLOADS_DIR)) {
    const files = fs.readdirSync(UPLOADS_DIR);
    for (const file of files) {
      if (file === '.gitkeep') continue;
      const filePath = path.join(UPLOADS_DIR, file);
      const stat = fs.statSync(filePath);
      const fileId = path.basename(file, path.extname(file));
      fileIndex.set(fileId, {
        fileId,
        filename: file,
        mimeType: 'application/octet-stream',
        size: stat.size,
        blobUrl: `local://${file}`,
      });
    }
  }
} catch {}

/**
 * POST /api/upload
 * Upload files (multipart form data)
 * Optional query param: ?projectId=xxx to associate with a project
 */
uploadRouter.post('/', upload.array('files', 10), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const user = await findOrCreateUser(req.clerkId!, req.clerkId + '@user.clerk', undefined);
    const projectId = req.body.projectId || req.query.projectId;

    // Check quota
    const currentUsage = await getUserStorageUsage(user.id);
    const uploadSize = files.reduce((sum, f) => sum + f.size, 0);
    if (currentUsage + uploadSize > MAX_USER_STORAGE_BYTES) {
      const remainingMB = ((MAX_USER_STORAGE_BYTES - currentUsage) / (1024 * 1024)).toFixed(1);
      return res.status(413).json({
        error: 'Storage quota exceeded',
        details: `You have ${remainingMB}MB remaining of your 100MB quota.`,
        currentUsageMB: (currentUsage / (1024 * 1024)).toFixed(1),
        maxMB: 100,
      });
    }

    const results = [];

    for (const file of files) {
      const fileId = uuidv4();
      const blob = await uploadToBlob(file.buffer, file.originalname, file.mimetype);

      const entry: FileEntry = {
        fileId,
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        blobUrl: blob.url,
      };
      fileIndex.set(fileId, entry);

      // Persist to DB if we have a project context
      if (projectId) {
        await saveProjectFile(projectId, user.id, file.originalname, file.mimetype, file.size, blob.url);
      }

      results.push({
        fileId,
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url: blob.url,
      });
    }

    const newUsage = currentUsage + uploadSize;
    res.json({
      files: results,
      quota: {
        usedMB: (newUsage / (1024 * 1024)).toFixed(1),
        maxMB: 100,
        remainingMB: ((MAX_USER_STORAGE_BYTES - newUsage) / (1024 * 1024)).toFixed(1),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Upload failed', details: error.message });
  }
});

/**
 * Get stored file data for AI consumption (base64)
 */
export function getStoredFile(fileId: string): { base64: string; mimeType: string; filename: string } | null {
  const meta = fileIndex.get(fileId);
  if (!meta) return null;

  // For local files, read from disk synchronously
  if (meta.blobUrl.startsWith('local://')) {
    const diskFilename = meta.blobUrl.replace('local://', '');
    const diskPath = path.join(UPLOADS_DIR, diskFilename);
    if (!fs.existsSync(diskPath)) return null;
    const buffer = fs.readFileSync(diskPath);
    return { base64: buffer.toString('base64'), mimeType: meta.mimeType, filename: meta.filename };
  }

  // For blob files, we need async — return null here and use getStoredFileAsync instead
  return null;
}

/**
 * Get stored file data asynchronously (works with both local and blob storage)
 */
export async function getStoredFileAsync(fileId: string): Promise<{ base64: string; mimeType: string; filename: string } | null> {
  const meta = fileIndex.get(fileId);
  if (!meta) return null;

  const buffer = await readBlobContent(meta.blobUrl);
  if (!buffer) return null;

  return { base64: buffer.toString('base64'), mimeType: meta.mimeType, filename: meta.filename };
}

/**
 * GET /api/upload/:fileId
 * Get file metadata
 */
uploadRouter.get('/:fileId', async (req: AuthenticatedRequest, res: Response) => {
  const meta = fileIndex.get(req.params.fileId as string);
  if (!meta) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.json({
    file: {
      fileId: meta.fileId,
      filename: meta.filename,
      mimeType: meta.mimeType,
      size: meta.size,
      url: meta.blobUrl.startsWith('local://') ? undefined : meta.blobUrl,
    },
  });
});
