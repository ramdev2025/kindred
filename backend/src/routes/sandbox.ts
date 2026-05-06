import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import * as e2b from '../services/e2b';
import * as db from '../db/queries';

export const sandboxRouter = Router();

sandboxRouter.use(requireAuth as any);

/**
 * POST /api/sandbox/create
 * Create a new E2B sandbox for a project
 */
sandboxRouter.post('/create', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { projectId } = req.body;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    const result = await e2b.createSandbox(projectId);

    // Update project with sandbox info
    await db.updateProject(projectId, {
      e2b_sandbox_id: result.sandboxId,
      preview_url: result.url,
    });

    res.json({ sandboxId: result.sandboxId, url: result.url });
  } catch (error: any) {
    console.error('[Sandbox] Create error:', error.message);
    res.status(500).json({ error: 'Failed to create sandbox', details: error.message });
  }
});

/**
 * POST /api/sandbox/execute
 * Execute code in a sandbox
 */
sandboxRouter.post('/execute', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sandboxId, code } = req.body;
    if (!sandboxId || !code) {
      return res.status(400).json({ error: 'sandboxId and code are required' });
    }

    const result = await e2b.executeInSandbox(sandboxId, code);
    res.json(result);
  } catch (error: any) {
    console.error('[Sandbox] Execute error:', error.message);
    res.status(500).json({ error: 'Failed to execute code', details: error.message });
  }
});

/**
 * POST /api/sandbox/command
 * Run a terminal command in the sandbox
 */
sandboxRouter.post('/command', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sandboxId, command } = req.body;
    if (!sandboxId || !command) {
      return res.status(400).json({ error: 'sandboxId and command are required' });
    }

    const result = await e2b.runCommand(sandboxId, command);
    res.json(result);
  } catch (error: any) {
    console.error('[Sandbox] Command error:', error.message);
    res.status(500).json({ error: 'Failed to run command', details: error.message });
  }
});

/**
 * POST /api/sandbox/write-file
 * Write a file to the sandbox
 */
sandboxRouter.post('/write-file', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sandboxId, path, content } = req.body;
    if (!sandboxId || !path || content === undefined) {
      return res.status(400).json({ error: 'sandboxId, path, and content are required' });
    }

    await e2b.writeFile(sandboxId, path, content);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to write file', details: error.message });
  }
});

/**
 * POST /api/sandbox/read-file
 * Read a file from the sandbox
 */
sandboxRouter.post('/read-file', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sandboxId, path } = req.body;
    if (!sandboxId || !path) {
      return res.status(400).json({ error: 'sandboxId and path are required' });
    }

    const content = await e2b.readFile(sandboxId, path);
    res.json({ content });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to read file', details: error.message });
  }
});

/**
 * DELETE /api/sandbox/:sandboxId
 * Destroy a sandbox
 */
sandboxRouter.delete('/:sandboxId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await e2b.destroySandbox(req.params.sandboxId as string);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to destroy sandbox', details: error.message });
  }
});

/**
 * GET /api/sandbox/status/:sandboxId
 * Get sandbox status
 */
sandboxRouter.get('/status/:sandboxId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = e2b.getSandboxStatus(req.params.sandboxId as string);
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get status', details: error.message });
  }
});

/**
 * GET /api/sandbox/files/:sandboxId
 * List files in a sandbox directory
 */
sandboxRouter.get('/files/:sandboxId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sandboxId = req.params.sandboxId as string;
    const path = (req.query.path as string) || '/home/user';

    const { listFiles } = await import('../services/e2b');
    const files = await listFiles(sandboxId, path);
    res.json({ files });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to list files', details: error.message });
  }
});

/**
 * GET /api/sandbox/preview-url/:sandboxId/:port
 * Get the public URL for a port running in the sandbox
 */
sandboxRouter.get('/preview-url/:sandboxId/:port', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sandboxId = req.params.sandboxId as string;
    const port = req.params.port as string;
    const { getPreviewUrl } = await import('../services/e2b');
    const url = getPreviewUrl(sandboxId, parseInt(port));
    res.json({ url });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get preview URL', details: error.message });
  }
});

/**
 * POST /api/sandbox/deploy
 * Write AI-generated files to sandbox, install deps, start server.
 * Streams deploy log lines via SSE, then emits a final { type:'done' } event.
 * Body: { sandboxId: string; files: Array<{ path: string; content: string; language?: string }> }
 */
sandboxRouter.post('/deploy', async (req: AuthenticatedRequest, res: Response) => {
  const { sandboxId, files } = req.body as {
    sandboxId: string;
    files: Array<{ path: string; content: string; language?: string }>;
  };

  if (!sandboxId || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'sandboxId and a non-empty files array are required' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (payload: object) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    const { deployToSandbox } = await import('../services/deployPipeline');

    const result = await deployToSandbox(sandboxId, files, (line) =>
      send({ type: 'log', content: line }),
    );

    send({ type: 'done', ...result });
    res.end();
  } catch (err: any) {
    send({ type: 'error', content: err.message });
    res.end();
  }
});
