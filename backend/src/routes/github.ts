import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import * as db from '../db/queries';

export const githubRouter = Router();
githubRouter.use(requireAuth as any);

// In-memory fallback for OAuth tokens
const oauthTokens = new Map<string, { accessToken: string; username?: string }>();

function getGitHubToken(userId: string): string | null {
  return oauthTokens.get(`github:${userId}`)?.accessToken || null;
}

function getGitHubUsername(userId: string): string | null {
  return oauthTokens.get(`github:${userId}`)?.username || null;
}

// ── GET /api/github/auth ─────────────────────────────────────────────────────
githubRouter.get('/auth', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const callbackUrl = process.env.GITHUB_CALLBACK_URL || 'http://localhost:3001/api/github/callback';
    const state = req.clerkId; // Use clerkId as state for callback matching

    const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo,read:user&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${state}`;
    res.json({ url });
  } catch (err: any) {
    console.error('[GitHub] auth error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/github/callback ─────────────────────────────────────────────────
githubRouter.get('/callback', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code, state } = req.query as { code: string; state: string };
    if (!code) return res.status(400).json({ error: 'Missing code parameter' });

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
      return res.status(400).json({ error: tokenData.error || 'Failed to exchange code' });
    }

    // Fetch user info
    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'VibeCoding' },
    });
    const userData = await userRes.json() as { login?: string };

    // Store token (keyed by state which is clerkId)
    const clerkId = state || req.clerkId!;
    const user = await db.getUserByClerkId(clerkId);
    const userId = user?.id || clerkId;
    oauthTokens.set(`github:${userId}`, { accessToken: tokenData.access_token, username: userData.login });

    // Return HTML that closes the popup
    res.send('<html><body><script>window.close();</script><p>Connected! You can close this window.</p></body></html>');
  } catch (err: any) {
    console.error('[GitHub] callback error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/github/status ───────────────────────────────────────────────────
githubRouter.get('/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.getUserByClerkId(req.clerkId!);
    const userId = user?.id || req.clerkId!;
    const token = getGitHubToken(userId);
    const username = getGitHubUsername(userId);
    res.json({ connected: !!token, username: username || undefined });
  } catch (err: any) {
    console.error('[GitHub] status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/github/repos ────────────────────────────────────────────────────
githubRouter.get('/repos', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.getUserByClerkId(req.clerkId!);
    const userId = user?.id || req.clerkId!;
    const token = getGitHubToken(userId);
    if (!token) return res.status(401).json({ error: 'GitHub not connected' });

    const reposRes = await fetch('https://api.github.com/user/repos?sort=updated&per_page=30', {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'VibeCoding' },
    });
    const repos = await reposRes.json();
    res.json({ repos });
  } catch (err: any) {
    console.error('[GitHub] repos error:', err.message);
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
    const token = getGitHubToken(userId);
    if (!token) return res.status(401).json({ error: 'GitHub not connected' });

    // Fetch file tree
    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'VibeCoding' },
    });
    const treeData = await treeRes.json() as { tree?: Array<{ path: string; type: string; sha: string }> };

    if (!treeData.tree) return res.status(400).json({ error: 'Could not fetch repo tree' });

    // Fetch contents for files (limit to reasonable size)
    const fileEntries = treeData.tree.filter((f) => f.type === 'blob').slice(0, 100);
    const files: Array<{ path: string; content: string }> = [];

    for (const entry of fileEntries) {
      try {
        const contentRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${entry.path}`, {
          headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'VibeCoding' },
        });
        const contentData = await contentRes.json() as { content?: string; encoding?: string };
        if (contentData.content && contentData.encoding === 'base64') {
          files.push({ path: entry.path, content: Buffer.from(contentData.content, 'base64').toString('utf-8') });
        }
      } catch {
        // Skip files that can't be fetched
      }
    }

    res.json({ files });
  } catch (err: any) {
    console.error('[GitHub] import error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/github/push ────────────────────────────────────────────────────
githubRouter.post('/push', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { owner, repo, branch, files, message = 'Update from Vibe Coding' } = req.body as {
      owner: string; repo: string; branch: string; files: Array<{ path: string; content: string }>; message?: string;
    };

    const user = await db.getUserByClerkId(req.clerkId!);
    const userId = user?.id || req.clerkId!;
    const token = getGitHubToken(userId);
    if (!token) return res.status(401).json({ error: 'GitHub not connected' });

    const headers = { Authorization: `Bearer ${token}`, 'User-Agent': 'VibeCoding', 'Content-Type': 'application/json' };

    // Get default branch ref
    const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`, { headers });
    let baseSha: string;

    if (refRes.ok) {
      const refData = await refRes.json() as { object: { sha: string } };
      baseSha = refData.object.sha;
    } else {
      // Branch doesn't exist, get main branch
      const mainRef = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/main`, { headers });
      const mainData = await mainRef.json() as { object: { sha: string } };
      baseSha = mainData.object.sha;

      // Create new branch
      await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
      });
    }

    // Create blobs for each file
    const treeEntries = [];
    for (const file of files) {
      const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: file.content, encoding: 'utf-8' }),
      });
      const blobData = await blobRes.json() as { sha: string };
      treeEntries.push({ path: file.path, mode: '100644', type: 'blob', sha: blobData.sha });
    }

    // Create tree
    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ base_tree: baseSha, tree: treeEntries }),
    });
    const treeData = await treeRes.json() as { sha: string };

    // Create commit
    const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, tree: treeData.sha, parents: [baseSha] }),
    });
    const commitData = await commitRes.json() as { sha: string };

    // Update branch ref
    await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ sha: commitData.sha }),
    });

    res.json({ success: true, sha: commitData.sha });
  } catch (err: any) {
    console.error('[GitHub] push error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/github/create-pr ───────────────────────────────────────────────
githubRouter.post('/create-pr', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { owner, repo, title, body: prBody, head, base } = req.body as {
      owner: string; repo: string; title: string; body?: string; head: string; base: string;
    };

    const user = await db.getUserByClerkId(req.clerkId!);
    const userId = user?.id || req.clerkId!;
    const token = getGitHubToken(userId);
    if (!token) return res.status(401).json({ error: 'GitHub not connected' });

    const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'VibeCoding', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body: prBody || '', head, base }),
    });

    const prData = await prRes.json() as { html_url?: string; number?: number; message?: string };
    if (!prData.html_url) {
      return res.status(400).json({ error: prData.message || 'Failed to create PR' });
    }

    res.json({ url: prData.html_url, number: prData.number });
  } catch (err: any) {
    console.error('[GitHub] create-pr error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
