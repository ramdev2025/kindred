import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { processChat, processChatStream, Attachment } from '../services/modelRouter';
import { runAgenticLoop } from '../services/agenticLoop';
import { findOrCreateUser } from '../db/queries';
import * as db from '../db/queries';
import { getStoredFile } from './upload';

export const chatRouter = Router();

// All chat routes require authentication
chatRouter.use(requireAuth as any);

/**
 * POST /api/chat/send
 * Send a message and get AI response
 * Body: { message, projectId, preferredModel, attachments?: [{ fileId }] }
 */
chatRouter.post('/send', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { message, projectId, preferredModel, attachments: attachmentRefs } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get or create user
    const user = await findOrCreateUser(req.clerkId!, req.clerkId + '@user.clerk', undefined);

    // Get or create chat session for this project
    let session = projectId ? await db.getChatSession(projectId) : null;
    if (!session && projectId) {
      session = await db.createChatSession(projectId, user.id);
    }

    // Save user message
    if (session) {
      await db.addMessage(session.id, 'user', message);
    }

    // Resolve attachments from file store
    const resolvedAttachments: Attachment[] = [];
    if (attachmentRefs && Array.isArray(attachmentRefs)) {
      for (const ref of attachmentRefs) {
        const stored = getStoredFile(ref.fileId);
        if (stored) {
          resolvedAttachments.push({
            mimeType: stored.mimeType,
            data: stored.base64,
            filename: stored.filename,
          });
        }
      }
    }

    // Get conversation context
    let context = '';
    if (session) {
      const history = await db.getMessages(session.id, 10);
      context = history.map(m => `${m.role}: ${m.content}`).join('\n');
    }

    // Process with AI
    const response = await processChat({
      message,
      context,
      projectId,
      preferredModel,
      attachments: resolvedAttachments.length > 0 ? resolvedAttachments : undefined,
    });

    // Save assistant message
    if (session) {
      await db.addMessage(session.id, 'assistant', response.content, response.model, response.tokensUsed);
    }

    // Record usage
    await db.recordUsage(user.id, response.model, response.tokensUsed, 0, 'chat');

    res.json({
      content: response.content,
      model: response.model,
      tokensUsed: response.tokensUsed,
      routing: response.routingDecision,
      sessionId: session?.id,
      usedSearch: response.usedSearch,
      searchSources: response.searchSources,
    });
  } catch (error: any) {
    console.error('[Chat] Error:', error.message);
    res.status(500).json({ error: 'Failed to process message', details: error.message });
  }
});

/**
 * POST /api/chat/stream
 * Stream AI response via Server-Sent Events
 * Body: { message, projectId, preferredModel, attachments?: [{ fileId }] }
 */
chatRouter.post('/stream', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { message, projectId, preferredModel, attachments: attachmentRefs } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Get or create user
    const user = await findOrCreateUser(req.clerkId!, req.clerkId + '@user.clerk', undefined);

    // Get or create chat session
    let session = projectId ? await db.getChatSession(projectId) : null;
    if (!session && projectId) {
      session = await db.createChatSession(projectId, user.id);
    }

    // Save user message
    if (session) {
      await db.addMessage(session.id, 'user', message);
    }

    // Resolve attachments
    const resolvedAttachments: Attachment[] = [];
    if (attachmentRefs && Array.isArray(attachmentRefs)) {
      for (const ref of attachmentRefs) {
        const stored = getStoredFile(ref.fileId);
        if (stored) {
          resolvedAttachments.push({ mimeType: stored.mimeType, data: stored.base64, filename: stored.filename });
        }
      }
    }

    // Get conversation context
    let context = '';
    if (session) {
      const history = await db.getMessages(session.id, 10);
      context = history.map(m => `${m.role}: ${m.content}`).join('\n');
    }

    // Stream the response
    let fullContent = '';
    let modelUsed = '';
    let tokensUsed = 0;

    for await (const chunk of processChatStream({
      message,
      context,
      projectId,
      preferredModel,
      attachments: resolvedAttachments.length > 0 ? resolvedAttachments : undefined,
    })) {
      if (chunk.type === 'token') {
        fullContent += chunk.content;
        res.write(`data: ${JSON.stringify({ type: 'token', content: chunk.content })}\n\n`);
      } else if (chunk.type === 'info') {
        res.write(`data: ${JSON.stringify({ type: 'info', content: chunk.content })}\n\n`);
      } else if (chunk.type === 'done') {
        modelUsed = chunk.model || '';
        tokensUsed = chunk.tokensUsed || 0;
      } else if (chunk.type === 'error') {
        res.write(`data: ${JSON.stringify({ type: 'error', content: chunk.content })}\n\n`);
      }
    }

    // Save assistant message to DB
    if (session && fullContent) {
      await db.addMessage(session.id, 'assistant', fullContent, modelUsed, tokensUsed);
    }

    // Record usage
    if (user && modelUsed) {
      await db.recordUsage(user.id, modelUsed, tokensUsed, 0, 'chat');
    }

    // Send final done event with metadata
    res.write(`data: ${JSON.stringify({ type: 'done', model: modelUsed, tokensUsed, sessionId: session?.id })}\n\n`);
    res.end();
  } catch (error: any) {
    console.error('[Chat Stream] Error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream response', details: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
      res.end();
    }
  }
});

/**
 * GET /api/chat/session/:projectId
 * Get the latest chat session for a project
 */
chatRouter.get('/session/:projectId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = req.params.projectId as string;
    const session = await db.getChatSession(projectId);
    if (!session) {
      return res.json({ session: null });
    }
    res.json({ session });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get session', details: error.message });
  }
});

/**
 * GET /api/chat/history/:sessionId
 * Get chat history for a session
 */
chatRouter.get('/history/:sessionId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = req.params.sessionId as string;
    const messages = await db.getMessages(sessionId);
    res.json({ messages });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch history', details: error.message });
  }
});

/**
 * POST /api/chat/agentic
 * Agentic coding loop: stream AI response → deploy → if error, auto-fix → redeploy.
 * Body: { message, projectId, preferredModel, sandboxId, maxIterations?, attachments?: [{ fileId }] }
 */
chatRouter.post('/agentic', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { message, projectId, preferredModel, sandboxId, maxIterations, attachments: attachmentRefs } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (!sandboxId) {
      return res.status(400).json({ error: 'sandboxId is required for agentic mode' });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (payload: object) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    // Get or create user
    const user = await findOrCreateUser(req.clerkId!, req.clerkId + '@user.clerk', undefined);

    // Get or create chat session
    let session = projectId ? await db.getChatSession(projectId) : null;
    if (!session && projectId) {
      session = await db.createChatSession(projectId, user.id);
    }

    // Save user message
    if (session) {
      await db.addMessage(session.id, 'user', message);
    }

    // Resolve attachments
    const resolvedAttachments: Attachment[] = [];
    if (attachmentRefs && Array.isArray(attachmentRefs)) {
      for (const ref of attachmentRefs) {
        const stored = getStoredFile(ref.fileId);
        if (stored) {
          resolvedAttachments.push({ mimeType: stored.mimeType, data: stored.base64, filename: stored.filename });
        }
      }
    }

    // Get conversation context
    let context = '';
    if (session) {
      const history = await db.getMessages(session.id, 10);
      context = history.map(m => `${m.role}: ${m.content}`).join('\n');
    }

    // ── Phase 1: Stream the initial AI response ──────────────────────────────
    let fullContent = '';
    let modelUsed = '';
    let tokensUsed = 0;

    for await (const chunk of processChatStream({
      message,
      context,
      projectId,
      preferredModel,
      attachments: resolvedAttachments.length > 0 ? resolvedAttachments : undefined,
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

    // Save assistant message to DB
    if (session && fullContent) {
      await db.addMessage(session.id, 'assistant', fullContent, modelUsed, tokensUsed);
    }

    // Record usage
    if (user && modelUsed) {
      await db.recordUsage(user.id, modelUsed, tokensUsed, 0, 'chat');
    }

    // Signal that the initial AI response is complete
    send({ type: 'ai_done', model: modelUsed, tokensUsed, sessionId: session?.id });

    // ── Phase 2: Agentic deploy loop ─────────────────────────────────────────
    // Check if the connection is still alive (client hasn't aborted)
    if (res.destroyed) {
      return;
    }

    for await (const event of runAgenticLoop({
      sandboxId,
      initialResponse: fullContent,
      originalMessage: message,
      context,
      preferredModel,
      maxIterations: maxIterations || 3,
    })) {
      if (res.destroyed) break; // Client disconnected
      send(event);

      // If the AI generated a fix, save it to DB as well
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
      res.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
      res.end();
    }
  }
});
