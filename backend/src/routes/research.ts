/**
 * /api/research  — Proxy to the Deep Research ADK Python service
 *
 * Routes:
 *   POST   /api/research/start              Start a research session
 *   GET    /api/research/:id/stream         SSE proxy (streams agent events to frontend)
 *   POST   /api/research/:id/respond        Forward human HITL answer to agent
 *   GET    /api/research/:id/status         Poll session status
 *   GET    /api/research/sessions/:userId   List active sessions for a user
 */

import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

export const researchRouter = Router();
researchRouter.use(requireAuth as any);

const RESEARCH_SERVICE_URL =
  process.env.RESEARCH_SERVICE_URL || 'http://localhost:8000';

// ── Helper: forward JSON requests to the Python service ─────────────────────
async function proxyJSON(
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${RESEARCH_SERVICE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

/**
 * POST /api/research/start
 * Body: { message: string, context?: string }
 * Returns: { session_id, status, message }
 */
researchRouter.post('/start', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { message, context } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });

    const { status, data } = await proxyJSON('/research/start', 'POST', {
      message,
      context: context || null,
      user_id: req.clerkId,
    });

    res.status(status).json(data);
  } catch (err: any) {
    console.error('[Research] start error:', err.message);
    res.status(502).json({ error: 'Research service unavailable', details: err.message });
  }
});

/**
 * GET /api/research/:sessionId/stream
 * SSE proxy — streams agent events directly to the browser.
 * Event types: search_query | search_result | token | need_input |
 *              input_received | error | done
 */
researchRouter.get('/:sessionId/stream', async (req: AuthenticatedRequest, res: Response) => {
  const { sessionId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let upstreamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  try {
    const upstream = await fetch(
      `${RESEARCH_SERVICE_URL}/research/${sessionId}/stream`,
    );

    if (!upstream.ok || !upstream.body) {
      res.write(`data: ${JSON.stringify({ type: 'error', content: 'Research session not found' })}\n\n`);
      return res.end();
    }

    upstreamReader = upstream.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await upstreamReader.read();
      if (done) break;
      if (res.destroyed) break;
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
    }
  } catch (err: any) {
    console.error('[Research] stream proxy error:', err.message);
    if (!res.destroyed) {
      res.write(`data: ${JSON.stringify({ type: 'error', content: err.message })}\n\n`);
    }
  } finally {
    upstreamReader?.cancel();
    res.end();
  }
});

/**
 * POST /api/research/:sessionId/respond
 * Body: { answer: string }
 * Forwards the human's HITL answer to the paused agent.
 */
researchRouter.post('/:sessionId/respond', async (req: AuthenticatedRequest, res: Response) => {
  const { sessionId } = req.params;
  const { answer } = req.body;

  if (!answer) return res.status(400).json({ error: 'answer is required' });

  try {
    const { status, data } = await proxyJSON(
      `/research/${sessionId}/respond`,
      'POST',
      { answer },
    );
    res.status(status).json(data);
  } catch (err: any) {
    console.error('[Research] respond error:', err.message);
    res.status(502).json({ error: 'Research service unavailable', details: err.message });
  }
});

/**
 * GET /api/research/:sessionId/status
 */
researchRouter.get('/:sessionId/status', async (req: AuthenticatedRequest, res: Response) => {
  const { sessionId } = req.params;
  try {
    const { status, data } = await proxyJSON(
      `/research/${sessionId}/status`,
      'GET',
    );
    res.status(status).json(data);
  } catch (err: any) {
    res.status(502).json({ error: 'Research service unavailable', details: err.message });
  }
});

/**
 * GET /api/research/sessions/:userId
 */
researchRouter.get('/sessions/:userId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, data } = await proxyJSON(
      `/research/sessions/${req.params.userId}`,
      'GET',
    );
    res.status(status).json(data);
  } catch (err: any) {
    res.status(502).json({ error: 'Research service unavailable', details: err.message });
  }
});
