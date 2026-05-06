import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import * as db from '../db/queries';

export const googleRouter = Router();
googleRouter.use(requireAuth as any);

// In-memory fallback for OAuth tokens
const googleTokens = new Map<string, { accessToken: string; refreshToken?: string; email?: string; expiresAt?: number }>();

function getGoogleToken(userId: string): string | null {
  const entry = googleTokens.get(`google:${userId}`);
  if (!entry) return null;
  return entry.accessToken;
}

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
].join(' ');

// ── GET /api/google/auth ─────────────────────────────────────────────────────
googleRouter.get('/auth', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const callbackUrl = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/google/callback';
    const state = req.clerkId;

    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=${encodeURIComponent(SCOPES)}&access_type=offline&state=${state}`;
    res.json({ url });
  } catch (err: any) {
    console.error('[Google] auth error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/google/callback ─────────────────────────────────────────────────
googleRouter.get('/callback', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code, state } = req.query as { code: string; state: string };
    if (!code) return res.status(400).json({ error: 'Missing code parameter' });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code,
        redirect_uri: process.env.GOOGLE_CALLBACK_URL,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json() as {
      access_token?: string; refresh_token?: string; expires_in?: number; error?: string;
    };
    if (!tokenData.access_token) {
      return res.status(400).json({ error: tokenData.error || 'Failed to exchange code' });
    }

    // Fetch user info
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json() as { email?: string };

    const clerkId = state || req.clerkId!;
    const user = await db.getUserByClerkId(clerkId);
    const userId = user?.id || clerkId;

    googleTokens.set(`google:${userId}`, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      email: userData.email,
      expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
    });

    res.send('<html><body><script>window.close();</script><p>Connected! You can close this window.</p></body></html>');
  } catch (err: any) {
    console.error('[Google] callback error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/google/status ───────────────────────────────────────────────────
googleRouter.get('/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.getUserByClerkId(req.clerkId!);
    const userId = user?.id || req.clerkId!;
    const entry = googleTokens.get(`google:${userId}`);
    res.json({ connected: !!entry?.accessToken, email: entry?.email || undefined });
  } catch (err: any) {
    console.error('[Google] status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/google/docs ─────────────────────────────────────────────────────
googleRouter.get('/docs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.getUserByClerkId(req.clerkId!);
    const userId = user?.id || req.clerkId!;
    const token = getGoogleToken(userId);
    if (!token) return res.status(401).json({ error: 'Google not connected' });

    const docsRes = await fetch(
      "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.document'&fields=files(id,name,mimeType,modifiedTime)&orderBy=modifiedTime desc&pageSize=20",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const docsData = await docsRes.json() as { files?: any[] };
    res.json({ docs: docsData.files || [] });
  } catch (err: any) {
    console.error('[Google] docs error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/google/sheets ───────────────────────────────────────────────────
googleRouter.get('/sheets', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.getUserByClerkId(req.clerkId!);
    const userId = user?.id || req.clerkId!;
    const token = getGoogleToken(userId);
    if (!token) return res.status(401).json({ error: 'Google not connected' });

    const sheetsRes = await fetch(
      "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet'&fields=files(id,name,mimeType,modifiedTime)&orderBy=modifiedTime desc&pageSize=20",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const sheetsData = await sheetsRes.json() as { files?: any[] };
    res.json({ sheets: sheetsData.files || [] });
  } catch (err: any) {
    console.error('[Google] sheets error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/google/import-doc ──────────────────────────────────────────────
googleRouter.post('/import-doc', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { docId } = req.body as { docId: string };
    if (!docId) return res.status(400).json({ error: 'docId is required' });

    const user = await db.getUserByClerkId(req.clerkId!);
    const userId = user?.id || req.clerkId!;
    const token = getGoogleToken(userId);
    if (!token) return res.status(401).json({ error: 'Google not connected' });

    // Export as plain text
    const exportRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${docId}/export?mimeType=text/plain`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const content = await exportRes.text();

    // Get doc metadata
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${docId}?fields=name`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const meta = await metaRes.json() as { name?: string };

    res.json({ title: meta.name || 'Untitled', content });
  } catch (err: any) {
    console.error('[Google] import-doc error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/google/export ──────────────────────────────────────────────────
googleRouter.post('/export', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, content, mimeType = 'application/vnd.google-apps.document' } = req.body as {
      name: string; content: string; mimeType?: string;
    };
    if (!name || !content) return res.status(400).json({ error: 'name and content are required' });

    const user = await db.getUserByClerkId(req.clerkId!);
    const userId = user?.id || req.clerkId!;
    const token = getGoogleToken(userId);
    if (!token) return res.status(401).json({ error: 'Google not connected' });

    // Create file via multipart upload
    const boundary = 'boundary_vibe_coding';
    const metadata = JSON.stringify({ name, mimeType });
    const body = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: text/plain\r\n\r\n${content}\r\n--${boundary}--`;

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );
    const uploadData = await uploadRes.json() as { id?: string; webViewLink?: string };

    res.json({ fileId: uploadData.id, url: uploadData.webViewLink });
  } catch (err: any) {
    console.error('[Google] export error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
