import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import * as db from '../db/queries';
import { query } from '../db/index';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export const deployRouter = Router();
deployRouter.use(requireAuth as any);

// ── SQLite-backed deployment helpers ─────────────────────────────────────────
async function saveDeployment(deployment: {
  id: string; project_id: string; user_id: string; provider: string;
  url: string | null; status: string; config: Record<string, any>;
  logs: string | null; created_at: string; completed_at: string | null;
}) {
  await query(
    `INSERT INTO deployments (id, project_id, user_id, provider, url, status, config, logs, created_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [deployment.id, deployment.project_id, deployment.user_id, deployment.provider,
     deployment.url, deployment.status, JSON.stringify(deployment.config),
     deployment.logs, deployment.created_at, deployment.completed_at]
  );
}

async function updateDeployment(id: string, updates: { url?: string | null; status?: string; logs?: string | null; completed_at?: string | null }) {
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 2; // $1 is id
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(value);
      idx++;
    }
  }
  if (fields.length === 0) return;
  await query(`UPDATE deployments SET ${fields.join(', ')} WHERE id = $1`, [id, ...values]);
}

async function getDeploymentById(id: string) {
  const result = await query('SELECT * FROM deployments WHERE id = $1', [id]);
  const row = result.rows[0];
  if (row && typeof row.config === 'string') row.config = JSON.parse(row.config);
  return row || null;
}

async function getDeploymentsByProject(projectId: string) {
  const result = await query(
    'SELECT * FROM deployments WHERE project_id = $1 ORDER BY created_at DESC',
    [projectId]
  );
  return result.rows.map((row: any) => {
    if (typeof row.config === 'string') row.config = JSON.parse(row.config);
    return row;
  });
}

// ── POST /api/deploy/vercel ──────────────────────────────────────────────────
deployRouter.post('/vercel', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { projectId, name, envVars = {}, files } = req.body as {
      projectId: string; name: string; envVars?: Record<string, string>; files: Array<{ path: string; content: string }>;
    };

    if (!projectId || !name) return res.status(400).json({ error: 'projectId and name are required' });

    const user = await db.getUserByClerkId(req.clerkId!);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const vercelToken = process.env.VERCEL_TOKEN;
    if (!vercelToken) return res.status(400).json({ error: 'Vercel token not configured' });

    const deployId = uuidv4();
    const deployment = {
      id: deployId,
      project_id: projectId,
      user_id: user.id,
      provider: 'vercel',
      url: null as string | null,
      status: 'pending',
      config: { name, envVars },
      logs: null as string | null,
      created_at: new Date().toISOString(),
      completed_at: null as string | null,
    };
    await saveDeployment(deployment);

    // Deploy to Vercel
    const vercelFiles = files.map((f) => ({
      file: f.path,
      data: Buffer.from(f.content).toString('base64'),
      encoding: 'base64',
    }));

    const deployRes = await fetch('https://api.vercel.com/v13/deployments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        files: vercelFiles,
        target: 'production',
        env: envVars,
      }),
    });

    const deployData = await deployRes.json() as { url?: string; id?: string; error?: { message?: string } };

    if (deployData.url) {
      deployment.url = `https://${deployData.url}`;
      deployment.status = 'ready';
      deployment.completed_at = new Date().toISOString();
    } else {
      deployment.status = 'error';
      deployment.logs = deployData.error?.message || 'Deployment failed';
      deployment.completed_at = new Date().toISOString();
    }

    await updateDeployment(deployId, { url: deployment.url, status: deployment.status, logs: deployment.logs, completed_at: deployment.completed_at });

    res.json({ deployment });
  } catch (err: any) {
    console.error('[Deploy] vercel error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/deploy/netlify ─────────────────────────────────────────────────
deployRouter.post('/netlify', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { projectId, name, envVars = {}, files } = req.body as {
      projectId: string; name: string; envVars?: Record<string, string>; files: Array<{ path: string; content: string }>;
    };

    if (!projectId || !name) return res.status(400).json({ error: 'projectId and name are required' });

    const user = await db.getUserByClerkId(req.clerkId!);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const netlifyToken = process.env.NETLIFY_TOKEN;
    if (!netlifyToken) return res.status(400).json({ error: 'Netlify token not configured' });

    const deployId = uuidv4();
    const deployment = {
      id: deployId,
      project_id: projectId,
      user_id: user.id,
      provider: 'netlify',
      url: null as string | null,
      status: 'pending',
      config: { name, envVars },
      logs: null as string | null,
      created_at: new Date().toISOString(),
      completed_at: null as string | null,
    };
    await saveDeployment(deployment);

    // Create site
    const siteRes = await fetch('https://api.netlify.com/api/v1/sites', {
      method: 'POST',
      headers: { Authorization: `Bearer ${netlifyToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const siteData = await siteRes.json() as { id?: string; ssl_url?: string; error?: string };

    if (!siteData.id) {
      deployment.status = 'error';
      deployment.logs = siteData.error || 'Failed to create site';
      deployment.completed_at = new Date().toISOString();
      await updateDeployment(deployId, { status: deployment.status, logs: deployment.logs, completed_at: deployment.completed_at });
      return res.json({ deployment });
    }

    // Calculate file SHA1s for deploy
    const fileDigests: Record<string, string> = {};
    const fileContents: Record<string, string> = {};
    for (const file of files) {
      const sha1 = crypto.createHash('sha1').update(file.content).digest('hex');
      const filePath = file.path.startsWith('/') ? file.path : `/${file.path}`;
      fileDigests[filePath] = sha1;
      fileContents[sha1] = file.content;
    }

    // Create deploy
    const deployRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteData.id}/deploys`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${netlifyToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: fileDigests }),
    });
    const deployData = await deployRes.json() as { id?: string; required?: string[]; ssl_url?: string };

    if (deployData.required && deployData.required.length > 0) {
      // Upload required files
      for (const sha of deployData.required) {
        const content = fileContents[sha];
        if (content) {
          await fetch(`https://api.netlify.com/api/v1/deploys/${deployData.id}/files/${sha}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${netlifyToken}`, 'Content-Type': 'application/octet-stream' },
            body: content,
          });
        }
      }
    }

    deployment.url = siteData.ssl_url || `https://${name}.netlify.app`;
    deployment.status = 'ready';
    deployment.completed_at = new Date().toISOString();

    await updateDeployment(deployId, { url: deployment.url, status: deployment.status, completed_at: deployment.completed_at });

    res.json({ deployment });
  } catch (err: any) {
    console.error('[Deploy] netlify error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/deploy/cloudrun ────────────────────────────────────────────────
deployRouter.post('/cloudrun', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { projectId, name, envVars = {}, files } = req.body as {
      projectId: string; name: string; envVars?: Record<string, string>; files: Array<{ path: string; content: string }>;
    };

    if (!projectId || !name) return res.status(400).json({ error: 'projectId and name are required' });

    const user = await db.getUserByClerkId(req.clerkId!);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const deployId = uuidv4();
    const deployment = {
      id: deployId,
      project_id: projectId,
      user_id: user.id,
      provider: 'cloudrun',
      url: null as string | null,
      status: 'pending',
      config: { name, envVars, dockerfile: generateDockerfile(files) },
      logs: 'Deployment queued. Cloud Run requires GCP service account configuration.',
      created_at: new Date().toISOString(),
      completed_at: null as string | null,
    };
    await saveDeployment(deployment);

    res.json({ deployment });
  } catch (err: any) {
    console.error('[Deploy] cloudrun error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/deploy/status/:deployId ─────────────────────────────────────────
deployRouter.get('/status/:deployId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deployId = req.params.deployId as string;
    const deployment = await getDeploymentById(deployId);
    if (!deployment) return res.status(404).json({ error: 'Deployment not found' });

    res.json({ deployment });
  } catch (err: any) {
    console.error('[Deploy] status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/deploy/history/:projectId ───────────────────────────────────────
deployRouter.get('/history/:projectId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = req.params.projectId as string;
    const deployments = await getDeploymentsByProject(projectId);

    res.json({ deployments });
  } catch (err: any) {
    console.error('[Deploy] history error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

function generateDockerfile(files: Array<{ path: string; content: string }>): string {
  const hasPackageJson = files.some((f) => f.path === 'package.json' || f.path === '/package.json');

  if (hasPackageJson) {
    return `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 8080
CMD ["npm", "start"]`;
  }

  return `FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install
EXPOSE 8080
CMD ["node", "index.js"]`;
}
