import { Router, Response, Request } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import * as db from '../db/queries';

export const googleRouter = Router();

// ── OAuth scopes ─────────────────────────────────────────────────────────────
// drive.file  → create/update files this app creates (needed for export)
// documents.readonly  → read Google Docs
// spreadsheets.readonly  → read Sheets
// userinfo.email  → identify the user
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

// ── In-memory fallback ───────────────────────────────────────────────────────
interface GoogleTokenEntry {
  accessToken: string;
  refreshToken?: string;
  email?: string;
  expiresAt?: number;   // epoch ms
}
const tokenFallback = new Map<string, GoogleTokenEntry>();

/** Persist to DB with in-memory fallback */
async function saveToken(userId: string, entry: GoogleTokenEntry) {
  try {
    await db.upsertOAuthToken(userId, 'google', {
      accessToken: entry.accessToken,
      refreshToken: entry.refreshToken,
      expiresAt: entry.expiresAt ? new Date(entry.expiresAt) : null,
      scopes: SCOPES.split(' '),
      rawResponse: { email: entry.email },
    });
  } catch (err) {
    console.warn('[Google] DB unavailable, using in-memory fallback:', (err as Error).message);
    tokenFallback.set(`google:${userId}`, entry);
  }
}

/** Load from DB with in-memory fallback */
async function loadToken(userId: string): Promise<GoogleTokenEntry | null> {
  try {
    const row = await db.getOAuthToken(userId, 'google');
    if (row) {
      return {
        accessToken: row.access_token,
        refreshToken: row.refresh_token ?? undefined,
        email: row.raw_response?.email,
        expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : undefined,
      };
    }
  } catch { /* fall through */ }
  return tokenFallback.get(`google:${userId}`) ?? null;
}

/** Delete from DB and in-memory */
async function removeToken(userId: string) {
  try { await db.deleteOAuthToken(userId, 'google'); } catch { /* ignore */ }
  tokenFallback.delete(`google:${userId}`);
}

/**
 * Get a valid access token, refreshing it if within 5 min of expiry.
 * Returns null if the user is not connected.
 */
async function getValidAccessToken(userId: string): Promise<string | null> {
  const entry = await loadToken(userId);
  if (!entry) return null;

  const fiveMin = 5 * 60 * 1000;
  const needsRefresh = entry.expiresAt && entry.expiresAt - Date.now() < fiveMin;

  if (needsRefresh && entry.refreshToken) {
    try {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: entry.refreshToken,
          grant_type: 'refresh_token',
        }),
      });
      const data = await refreshRes.json() as {
        access_token?: string; expires_in?: number; error?: string;
      };

      if (data.access_token) {
        const refreshed: GoogleTokenEntry = {
          ...entry,
          accessToken: data.access_token,
          expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
        };
        await saveToken(userId, refreshed);
        return refreshed.accessToken;
      }
      console.warn('[Google] Token refresh failed:', data.error);
    } catch (err) {
      console.warn('[Google] Token refresh error:', (err as Error).message);
    }
  }

  return entry.accessToken;
}

// ── OAuth routes (callback has NO requireAuth — browser redirect has no Bearer token)

// GET /api/google/auth — generate the Google OAuth URL
googleRouter.get('/auth', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(500).json({ error: 'GOOGLE_CLIENT_ID not configured' });

    const callbackUrl = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/google/callback';
    const url =
      'https://accounts.google.com/o/oauth2/v2/auth' +
      `?client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(SCOPES)}` +
      `&access_type=offline` +
      `&prompt=consent` +         // force consent so we always get refresh_token
      `&state=${req.clerkId}`;

    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/google/callback — Google redirects here; NO requireAuth
googleRouter.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
    if (error) return res.status(400).send(`<p>Google auth error: ${error}</p>`);
    if (!code) return res.status(400).send('<p>Missing code parameter.</p>');

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
      return res.status(400).send(`<p>Token exchange failed: ${tokenData.error || 'unknown'}</p>`);
    }

    // Fetch user email
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json() as { email?: string };

    const clerkId = state || '';
    const dbUser = await db.getUserByClerkId(clerkId).catch(() => null);
    const userId = dbUser?.id || clerkId;

    await saveToken(userId, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      email: userData.email,
      expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
    });

    res.send(`<html><body>
      <script>window.opener?.postMessage({ type: 'google-connected', email: '${userData.email || ''}' }, '*'); window.close();</script>
      <p>Google connected as <strong>${userData.email || 'unknown'}</strong>. You can close this window.</p>
    </body></html>`);
  } catch (err: any) {
    console.error('[Google] callback error:', err.message);
    res.status(500).send(`<p>Error: ${err.message}</p>`);
  }
});

// All routes below require auth
googleRouter.use(requireAuth as any);

// ── GET /api/google/status ───────────────────────────────────────────────────
googleRouter.get('/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.getUserByClerkId(req.clerkId!);
    const userId = user?.id || req.clerkId!;
    const entry = await loadToken(userId);
    res.json({ connected: !!entry, email: entry?.email ?? null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/google/disconnect ────────────────────────────────────────────
googleRouter.delete('/disconnect', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.getUserByClerkId(req.clerkId!);
    const userId = user?.id || req.clerkId!;
    await removeToken(userId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/google/docs ─────────────────────────────────────────────────────
googleRouter.get('/docs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.getUserByClerkId(req.clerkId!);
    const userId = user?.id || req.clerkId!;
    const token = await getValidAccessToken(userId);
    if (!token) return res.status(401).json({ error: 'Google not connected' });

    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files` +
      `?q=mimeType%3D'application%2Fvnd.google-apps.document'` +
      `&fields=files(id,name,mimeType,modifiedTime)` +
      `&orderBy=modifiedTime+desc&pageSize=20`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = await resp.json() as { files?: any[] };
    res.json({ docs: data.files || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/google/sheets ───────────────────────────────────────────────────
googleRouter.get('/sheets', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.getUserByClerkId(req.clerkId!);
    const userId = user?.id || req.clerkId!;
    const token = await getValidAccessToken(userId);
    if (!token) return res.status(401).json({ error: 'Google not connected' });

    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files` +
      `?q=mimeType%3D'application%2Fvnd.google-apps.spreadsheet'` +
      `&fields=files(id,name,mimeType,modifiedTime)` +
      `&orderBy=modifiedTime+desc&pageSize=20`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = await resp.json() as { files?: any[] };
    res.json({ sheets: data.files || [] });
  } catch (err: any) {
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
    const token = await getValidAccessToken(userId);
    if (!token) return res.status(401).json({ error: 'Google not connected' });

    const [exportRes, metaRes] = await Promise.all([
      fetch(
        `https://www.googleapis.com/drive/v3/files/${docId}/export?mimeType=text%2Fplain`,
        { headers: { Authorization: `Bearer ${token}` } },
      ),
      fetch(
        `https://www.googleapis.com/drive/v3/files/${docId}?fields=name`,
        { headers: { Authorization: `Bearer ${token}` } },
      ),
    ]);

    const content = await exportRes.text();
    const meta = await metaRes.json() as { name?: string };

    res.json({ title: meta.name || 'Untitled', content });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/google/import-sheet ────────────────────────────────────────────
googleRouter.post('/import-sheet', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sheetId } = req.body as { sheetId: string };
    if (!sheetId) return res.status(400).json({ error: 'sheetId is required' });

    const user = await db.getUserByClerkId(req.clerkId!);
    const userId = user?.id || req.clerkId!;
    const token = await getValidAccessToken(userId);
    if (!token) return res.status(401).json({ error: 'Google not connected' });

    // Export as CSV (first sheet)
    const exportRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${sheetId}/export?mimeType=text%2Fcsv`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const csv = await exportRes.text();

    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${sheetId}?fields=name`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const meta = await metaRes.json() as { name?: string };

    res.json({ title: meta.name || 'Untitled', csv });
  } catch (err: any) {
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
    const token = await getValidAccessToken(userId);
    if (!token) return res.status(401).json({ error: 'Google not connected' });

    const boundary = 'vibe_boundary_001';
    const metadata = JSON.stringify({ name, mimeType });
    const body =
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: text/plain\r\n\r\n${content}\r\n` +
      `--${boundary}--`;

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    );
    const data = await uploadRes.json() as { id?: string; webViewLink?: string; error?: any };
    if (!data.id) {
      return res.status(400).json({ error: data.error?.message || 'Upload failed' });
    }

    res.json({ fileId: data.id, url: data.webViewLink });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
