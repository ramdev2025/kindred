import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { processChat, processChatStream, Attachment } from '../services/modelRouter';
import { runAgenticLoop } from '../services/agenticLoop';
import { buildContext, summarizeSessionHistory, ContextStats } from '../services/contextManager';
import { findOrCreateUser } from '../db/queries';
import * as db from '../db/queries';
import { getStoredFileAsync } from './upload';
import { recordTokenUsage } from '../db/sqlite';

export const chatRouter = Router();
chatRouter.use(requireAuth as any);

// ── Helper: resolve file attachments from the upload store ──────────────────
async function resolveAttachments(attachmentRefs: Array<{ fileId: string }> | undefined): Promise<Attachment[]> {
  if (!attachmentRefs?.length) return [];
  const results: Attachment[] = [];
  for (const ref of attachmentRefs) {
    const stored = await getStoredFileAsync(ref.fileId);
    if (stored) {
      results.push({ mimeType: stored.mimeType, data: stored.base64, filename: stored.filename });
    }
  }
  return results;
}

// ── Helper: get/create session and save user message ────────────────────────
async function ensureSession(projectId: string | undefined, userId: string, userMessage: string) {
  let session = projectId ? await db.getChatSession(projectId) : null;
  if (!session && projectId) session = await db.createChatSession(projectId, userId);
  if (session) await db.addMessage(session.id, 'user', userMessage);
  return session;
}

// ── Helper: build smart context and optionally trigger summarization ─────────
async function getContext(
  sessionId: string | undefined,
  preferredModel: string | undefined,
): Promise<{ context: string; contextStats: ContextStats | null }> {
  if (!sessionId) return { context: '', contextStats: null };

  const ctxResult = await buildContext(sessionId, preferredModel);
  if (ctxResult.stats.shouldSummarize) {
    summarizeSessionHistory(sessionId); // fire-and-forget
  }
  return { context: ctxResult.context, contextStats: ctxResult.stats };
}

/**
 * POST /api/chat/send  (non-streaming fallback)
 */
chatRouter.post('/send', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { message, projectId, preferredModel, attachments: attachmentRefs } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const user = await findOrCreateUser(req.clerkId!, req.clerkId + '@user.clerk', undefined);
    const session = await ensureSession(projectId, user.id, message);

    const { context, contextStats } = await getContext(session?.id, preferredModel);

    const response = await processChat({
      message,
      context,
      projectId,
      preferredModel,
      attachments: await resolveAttachments(attachmentRefs),
    });

    if (session) {
      await db.addMessage(session.id, 'assistant', response.content, response.model, response.tokensUsed);
    }
    await db.recordUsage(user.id, response.model, response.tokensUsed, 0, 'chat');
    try { recordTokenUsage(user.id, response.tokensUsed); } catch {} // update quota counter

    res.json({
      content: response.content,
      model: response.model,
      tokensUsed: response.tokensUsed,
      routing: response.routingDecision,
      sessionId: session?.id,
      usedSearch: response.usedSearch,
      searchSources: response.searchSources,
      contextStats,
    });
  } catch (error: any) {
    console.error('[Chat] Error:', error.message);
    res.status(500).json({ error: 'Failed to process message', details: error.message });
  }
});

/**
 * POST /api/chat/stream  (SSE)
 */
chatRouter.post('/stream', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { message, projectId, preferredModel, attachments: attachmentRefs } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const user = await findOrCreateUser(req.clerkId!, req.clerkId + '@user.clerk', undefined);
    const session = await ensureSession(projectId, user.id, message);

    const { context, contextStats } = await getContext(session?.id, preferredModel);

    let fullContent = '';
    let modelUsed = '';
    let tokensUsed = 0;

    const attachments = await resolveAttachments(attachmentRefs);

    for await (const chunk of processChatStream({
      message,
      context,
      projectId,
      preferredModel,
      attachments,
    })) {
      if (chunk.type === 'token') {
        fullContent += chunk.content;
        res.write('data: ' + JSON.stringify({ type: 'token', content: chunk.content }) + '\n\n');
      } else if (chunk.type === 'info') {
        res.write('data: ' + JSON.stringify({ type: 'info', content: chunk.content }) + '\n\n');
      } else if (chunk.type === 'done') {
        modelUsed = chunk.model || '';
        tokensUsed = chunk.tokensUsed || 0;
      } else if (chunk.type === 'error') {
        res.write('data: ' + JSON.stringify({ type: 'error', content: chunk.content }) + '\n\n');
      }
    }

    if (session && fullContent) {
      await db.addMessage(session.id, 'assistant', fullContent, modelUsed, tokensUsed);
    }
    if (user && modelUsed) {
      await db.recordUsage(user.id, modelUsed, tokensUsed, 0, 'chat');
      try { recordTokenUsage(user.id, tokensUsed); } catch {} // update quota counter
    }

    res.write('data: ' + JSON.stringify({
      type: 'done',
      model: modelUsed,
      tokensUsed,
      sessionId: session?.id,
      contextStats,
    }) + '\n\n');
    res.end();
  } catch (error: any) {
    console.error('[Chat Stream] Error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream response', details: error.message });
    } else {
      res.write('data: ' + JSON.stringify({ type: 'error', content: error.message }) + '\n\n');
      res.end();
    }
  }
});

/**
 * GET /api/chat/session/:projectId
 */
chatRouter.get('/session/:projectId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const session = await db.getChatSession(req.params.projectId as string);
    res.json({ session: session ?? null });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get session', details: error.message });
  }
});

/**
 * GET /api/chat/history/:sessionId
 */
chatRouter.get('/history/:sessionId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const messages = await db.getMessages(req.params.sessionId as string);
    res.json({ messages });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch history', details: error.message });
  }
});

/**
 * POST /api/chat/agentic  (SSE — AI stream → deploy loop → auto-fix)
 */
chatRouter.post('/agentic', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      message, projectId, preferredModel,
      sandboxId, maxIterations, attachments: attachmentRefs,
    } = req.body;

    if (!message)   return res.status(400).json({ error: 'Message is required' });
    if (!sandboxId) return res.status(400).json({ error: 'sandboxId is required for agentic mode' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (payload: object) =>
      res.write('data: ' + JSON.stringify(payload) + '\n\n');

    const user = await findOrCreateUser(req.clerkId!, req.clerkId + '@user.clerk', undefined);
    const session = await ensureSession(projectId, user.id, message);

    const { context, contextStats } = await getContext(session?.id, preferredModel);

    // ── Phase 1: Stream initial AI response ──────────────────────────────────
    let fullContent = '';
    let modelUsed = '';
    let tokensUsed = 0;

    for await (const chunk of processChatStream({
      message,
      context,
      projectId,
      preferredModel,
      attachments: await resolveAttachments(attachmentRefs),
    })) {
      if (chunk.type === 'token') {
        fullContent += chunk.content;
        send({ type: 'token', content: chunk.content });
      } else if (chunk.type === 'info') {
        send({ type: 'info', content: chunk.content });
      } else if (chunk.type === 'done') {
        modelUsed = chunk.model || '';
        tokensUsed = chunk.tokensUsed || 0;
      } else if (chunk.type === 'error') {
        send({ type: 'error', content: chunk.content });
      }
    }

    if (session && fullContent) {
      await db.addMessage(session.id, 'assistant', fullContent, modelUsed, tokensUsed);
    }
    if (user && modelUsed) {
      await db.recordUsage(user.id, modelUsed, tokensUsed, 0, 'chat');
      try { recordTokenUsage(user.id, tokensUsed); } catch {} // update quota counter
    }

    // Include contextStats so the frontend meter updates after AI responds
    send({ type: 'ai_done', model: modelUsed, tokensUsed, sessionId: session?.id, contextStats });

    if (res.destroyed) return;

    // ── Phase 2: Agentic deploy + fix loop ───────────────────────────────────
    for await (const event of runAgenticLoop({
      sandboxId,
      initialResponse: fullContent,
      originalMessage: message,
      context,
      preferredModel,
      maxIterations: maxIterations || 3,
    })) {
      if (res.destroyed) break;
      send(event);

      if (event.type === 'fix_done' && session && event.content) {
        await db.addMessage(session.id, 'assistant', event.content, modelUsed, 0);
      }
    }

    res.end();
  } catch (error: any) {
    console.error('[Chat Agentic] Error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to run agentic loop', details: error.message });
    } else {
      res.write('data: ' + JSON.stringify({ type: 'error', content: error.message }) + '\n\n');
      res.end();
    }
  }
});
