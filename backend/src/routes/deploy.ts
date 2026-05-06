import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import * as db from '../db/queries';
import crypto from 'crypto';

export const deployRouter = Router();
deployRouter.use(requireAuth as any);

// In-memory store for deployments
interface DeploymentRecord {
  id: string;
  project_id: string;
  user_id: string;
  provider: string;
  url: string | null;
  status: string;
  config: Record<string, any>;
  logs: string | null;
  created_at: string;
  completed_at: string | null;
}
const deploymentsStore = new Map<string, DeploymentRecord>();

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

    const deployId = crypto.randomUUID();
    const deployment: DeploymentRecord = {
      id: deployId,
      project_id: projectId,
      user_id: user.id,
      provider: 'vercel',
      url: null,
      status: 'pending',
      config: { name, envVars },
      logs: null,
      created_at: new Date().toISOString(),
      completed_at: null,
    };
    deploymentsStore.set(deployId, deployment);

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

    const deployId = crypto.randomUUID();
    const deployment: DeploymentRecord = {
      id: deployId,
      project_id: projectId,
      user_id: user.id,
      provider: 'netlify',
      url: null,
      status: 'pending',
      config: { name, envVars },
      logs: null,
      created_at: new Date().toISOString(),
      completed_at: null,
    };
    deploymentsStore.set(deployId, deployment);

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

    const deployId = crypto.randomUUID();
    const deployment: DeploymentRecord = {
      id: deployId,
      project_id: projectId,
      user_id: user.id,
      provider: 'cloudrun',
      url: null,
      status: 'pending',
      config: { name, envVars, dockerfile: generateDockerfile(files) },
      logs: 'Cloud Run deployment requires gcloud CLI. Dockerfile generated.',
      created_at: new Date().toISOString(),
      completed_at: null,
    };
    deploymentsStore.set(deployId, deployment);

    // Cloud Run deployments require gcloud CLI setup
    // For now, mark as pending with instructions
    deployment.status = 'pending';
    deployment.logs = 'Deployment queued. Cloud Run requires GCP service account configuration.';

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
    const deployment = deploymentsStore.get(deployId);
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
    const projectId = req.params.projectId;
    const deployments = Array.from(deploymentsStore.values())
      .filter((d) => d.project_id === projectId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

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
