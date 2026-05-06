import { Router, Response } from 'express';
import multer from 'multer';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

export const uploadRouter = Router();
uploadRouter.use(requireAuth as any);

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configure multer for disk storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const fileId = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${fileId}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/csv', 'text/plain', 'application/json'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});

// File metadata store (in-memory index; files persist on disk)
interface StoredFileMeta {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  diskPath: string;
}

const fileIndex = new Map<string, StoredFileMeta>();

// Rebuild index from disk on startup
try {
  const files = fs.readdirSync(UPLOADS_DIR);
  for (const file of files) {
    if (file === '.gitkeep') continue;
    const filePath = path.join(UPLOADS_DIR, file);
    const stat = fs.statSync(filePath);
    const fileId = path.basename(file, path.extname(file));
    fileIndex.set(fileId, {
      fileId,
      filename: file,
      mimeType: 'application/octet-stream', // best guess without metadata DB
      size: stat.size,
      diskPath: filePath,
    });
  }
} catch {}

/**
 * POST /api/upload
 * Upload files (multipart form data)
 */
uploadRouter.post('/', upload.array('files', 10), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const results = files.map((file) => {
      const fileId = path.basename(file.filename, path.extname(file.filename));
      const meta: StoredFileMeta = {
        fileId,
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        diskPath: file.path,
      };
      fileIndex.set(fileId, meta);
      return { fileId, filename: file.originalname, mimeType: file.mimetype, size: file.size };
    });

    res.json({ files: results });
  } catch (error: any) {
    res.status(500).json({ error: 'Upload failed', details: error.message });
  }
});

/**
 * Get stored file data for AI consumption (base64)
 */
export function getStoredFile(fileId: string): { base64: string; mimeType: string; filename: string } | null {
  const meta = fileIndex.get(fileId);
  if (!meta || !fs.existsSync(meta.diskPath)) return null;

  const buffer = fs.readFileSync(meta.diskPath);
  return {
    base64: buffer.toString('base64'),
    mimeType: meta.mimeType,
    filename: meta.filename,
  };
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
  res.json({ file: { fileId: meta.fileId, filename: meta.filename, mimeType: meta.mimeType, size: meta.size } });
});
