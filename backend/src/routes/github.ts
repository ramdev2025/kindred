import { Router, Response, Request } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import * as db from '../db/queries';

export const githubRouter = Router();

// ── In-memory fallback ───────────────────────────────────────────────────────
// Used when the DB is unavailable (graceful degradation).
// Keyed by "github:{userId}" where userId is the DB UUID.
interface GitHubTokenEntry {
  accessToken: string;
  username?: string;
}
const tokenFallback = new Map<string, GitHubTokenEntry>();

/** Persist to DB; fall back to in-memory if DB is down */
async function saveToken(userId: string, entry: GitHubTokenEntry, rawResponse: Record<string, any>) {
  try {
    await db.upsertOAuthToken(userId, 'github', {
      accessToken: entry.accessToken,
      rawResponse: { ...rawResponse, username: entry.username },
    });
  } catch (err) {
    console.warn('[GitHub] DB unavailable, using in-memory fallback:', (err as Error).message);
    tokenFallback.set(`github:${userId}`, entry);
  }
}

/** Load from DB; fall back to in-memory */
async function loadToken(userId: string): Promise<GitHubTokenEntry | null> {
  try {
    const row = await db.getOAuthToken(userId, 'github');
    if (row) {
      return {
        accessToken: row.access_token,
        username: row.raw_response?.username,
      };
    }
  } catch { /* fall through */ }
  return tokenFallback.get(`github:${userId}`) ?? null;
}

/** Delete from DB; also clear fallback */
async function removeToken(userId: string) {
  try {
    await db.deleteOAuthToken(userId, 'github');
  } catch { /* ignore */ }
  tokenFallback.delete(`github:${userId}`);
}

// ── OAuth routes (no auth middleware — browser redirects have no Bearer token)

// GET /api/github/auth — generate the GitHub OAuth URL
githubRouter.get('/auth', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) return res.status(500).json({ error: 'GITHUB_CLIENT_ID not configured' });

    const callbackUrl = process.env.GITHUB_CALLBACK_URL || 'http://localhost:3001/api/github/callback';
    const url =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${clientId}` +
      `&scope=repo,read:user` +
      `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
      `&state=${req.clerkId}`;

    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/github/callback — GitHub redirects here; NO requireAuth (browser redirect, no token)
githubRouter.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code) return res.status(400).send('<p>Missing code parameter.</p>');

    // Exchange code for access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: process.env.GITHUB_CALLBACK_URL,
      }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
    if (!tokenData.access_token) {
      return res.status(400).send(`<p>GitHub auth error: ${tokenData.error || 'unknown'}</p>`);
    }

    // Fetch GitHub username
    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'VibeCoding' },
    });
    const userData = await userRes.json() as { login?: string; id?: number };

    // Resolve DB user via clerkId (passed as state)
    const clerkId = state || '';
    const dbUser = await db.getUserByClerkId(clerkId).catch(() => null);
    const userId = dbUser?.id || clerkId;   // fall back to clerkId string if DB unavailable

    await saveToken(userId, { accessToken: tokenData.access_token, username: userData.login }, tokenData as any);

    res.send(`<html><body>
      <script>window.opener?.postMessage({ type: 'github-connected', username: '${userData.login || ''}' }, '*'); window.close();</script>
      <p>GitHub connected as <strong>${userData.login || 'unknown'}</strong>. You can close this window.</p>
    </body></html>`);
  } catch (err: any) {
    console.error('[GitHub] callback error:', err.message);
    res.status(500).send(`<p>Error: ${err.message}</p>`);
  }
});

// All routes below require auth
githubRouter.use(requireAuth as any);

// ── GET /api/github/status ───────────────────────────────────────────────────
githubRouter.get('/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.getUserByClerkId(req.clerkId!);
    const userId = user?.id || req.clerkId!;
    const entry = await loadToken(userId);
    res.json({ connected: !!entry, username: entry?.username ?? null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/github/disconnect ────────────────────────────────────────────
githubRouter.delete('/disconnect', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.getUserByClerkId(req.clerkId!);
    const userId = user?.id || req.clerkId!;
    await removeToken(userId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/github/repos ────────────────────────────────────────────────────
githubRouter.get('/repos', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.getUserByClerkId(req.clerkId!);
    const userId = user?.id || req.clerkId!;
    const entry = await loadToken(userId);
    if (!entry) return res.status(401).json({ error: 'GitHub not connected' });

    const reposRes = await fetch('https://api.github.com/user/repos?sort=updated&per_page=30', {
      headers: { Authorization: `Bearer ${entry.accessToken}`, 'User-Agent': 'VibeCoding' },
    });
    const repos = await reposRes.json();
    res.json({ repos });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/github/import ──────────────────────────────────────────────────
githubRouter.post('/import', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { owner, repo } = req.body as { owner: string; repo: string };
    if (!owner || !repo) return res.status(400).json({ error: 'owner and repo are required' });

    const user = await db.getUserByClerkId(req.clerkId!);
    const userId = user?.id || req.clerkId!;
    const entry = await loadToken(userId);
    if (!entry) return res.status(401).json({ error: 'GitHub not connected' });

    const headers = { Authorization: `Bearer ${entry.accessToken}`, 'User-Agent': 'VibeCoding' };

    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
      { headers },
    );
    const treeData = await treeRes.json() as { tree?: Array<{ path: string; type: string }> };
    if (!treeData.tree) return res.status(400).json({ error: 'Could not fetch repo tree' });

    const fileEntries = treeData.tree.filter((f) => f.type === 'blob').slice(0, 100);
    const files: Array<{ path: string; content: string }> = [];

    for (const entry of fileEntries) {
      try {
        const contentRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${entry.path}`,
          { headers },
        );
        const contentData = await contentRes.json() as { content?: string; encoding?: string };
        if (contentData.content && contentData.encoding === 'base64') {
          files.push({
            path: entry.path,
            content: Buffer.from(contentData.content, 'base64').toString('utf-8'),
          });
        }
      } catch { /* skip unreadable files */ }
    }

    res.json({ files });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/github/push ────────────────────────────────────────────────────
githubRouter.post('/push', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { owner, repo, branch, files, message = 'Update from Vibe Coding' } = req.body as {
      owner: string; repo: string; branch: string;
      files: Array<{ path: string; content: string }>;
      message?: string;
    };
    if (!owner || !repo || !branch || !files?.length) {
      return res.status(400).json({ error: 'owner, repo, branch, and files are required' });
    }

    const user = await db.getUserByClerkId(req.clerkId!);
    const userId = user?.id || req.clerkId!;
    const entry = await loadToken(userId);
    if (!entry) return res.status(401).json({ error: 'GitHub not connected' });

    const headers = {
      Authorization: `Bearer ${entry.accessToken}`,
      'User-Agent': 'VibeCoding',
      'Content-Type': 'application/json',
    };

    // Resolve base SHA — try target branch, fall back to main
    let baseSha: string;
    const refRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`,
      { headers },
    );
    if (refRes.ok) {
      const refData = await refRes.json() as { object: { sha: string } };
      baseSha = refData.object.sha;
    } else {
      const mainRef = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/main`,
        { headers },
      );
      const mainData = await mainRef.json() as { object: { sha: string } };
      baseSha = mainData.object.sha;
      // Create the new branch
      await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
      });
    }

    // Create blobs
    const treeEntries = [];
    for (const file of files) {
      const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
        method: 'POST', headers,
        body: JSON.stringify({ content: file.content, encoding: 'utf-8' }),
      });
      const blobData = await blobRes.json() as { sha: string };
      treeEntries.push({ path: file.path, mode: '100644', type: 'blob', sha: blobData.sha });
    }

    // Create tree → commit → update ref
    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
      method: 'POST', headers,
      body: JSON.stringify({ base_tree: baseSha, tree: treeEntries }),
    });
    const treeData = await treeRes.json() as { sha: string };

    const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
      method: 'POST', headers,
      body: JSON.stringify({ message, tree: treeData.sha, parents: [baseSha] }),
    });
    const commitData = await commitRes.json() as { sha: string };

    await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ sha: commitData.sha }),
    });

    res.json({ success: true, sha: commitData.sha });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/github/create-pr ───────────────────────────────────────────────
githubRouter.post('/create-pr', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { owner, repo, title, body: prBody, head, base } = req.body as {
      owner: string; repo: string; title: string; body?: string; head: string; base: string;
    };
    if (!owner || !repo || !title || !head || !base) {
      return res.status(400).json({ error: 'owner, repo, title, head, and base are required' });
    }

    const user = await db.getUserByClerkId(req.clerkId!);
    const userId = user?.id || req.clerkId!;
    const entry = await loadToken(userId);
    if (!entry) return res.status(401).json({ error: 'GitHub not connected' });

    const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${entry.accessToken}`,
        'User-Agent': 'VibeCoding',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, body: prBody || '', head, base }),
    });
    const prData = await prRes.json() as { html_url?: string; number?: number; message?: string };
    if (!prData.html_url) {
      return res.status(400).json({ error: prData.message || 'Failed to create PR' });
    }

    res.json({ url: prData.html_url, number: prData.number });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
