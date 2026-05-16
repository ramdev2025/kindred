import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { chatRouter } from './routes/chat';
import { projectsRouter } from './routes/projects';
import { sandboxRouter } from './routes/sandbox';
import { uploadRouter } from './routes/upload';
import { mcpRouter } from './routes/mcp';
import { githubRouter } from './routes/github';
import { googleRouter } from './routes/google';
import { databasesRouter } from './routes/databases';
import { deployRouter } from './routes/deploy';
import { templatesRouter } from './routes/templates';
import { billingRouter } from './routes/billing';
import { researchRouter } from './routes/research';
import { chatRateLimiter, uploadRateLimiter, sandboxRateLimiter } from './middleware/rateLimiter';
import { requireTokenBudget, requireSandboxBudget } from './middleware/quotaGuard';
import { initDatabase } from './db';
import { initCache } from './services/cache';
import { initQueue } from './services/queue';
import { seedBuiltinTemplates } from './db/sqlite';

dotenv.config({ path: '../.env' });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.FRONTEND_URL || 'https://your-domain.com')
    : [process.env.FRONTEND_URL || 'http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/chat', chatRateLimiter, requireTokenBudget as any, chatRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/sandbox/create', sandboxRateLimiter, requireSandboxBudget as any);
app.use('/api/sandbox', sandboxRouter);
app.use('/api/upload', uploadRateLimiter, uploadRouter);
app.use('/api/mcp', mcpRouter);
app.use('/api/github', githubRouter);
app.use('/api/google', googleRouter);
app.use('/api/databases', databasesRouter);
app.use('/api/deploy', deployRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/billing', billingRouter);
app.use('/api/research', chatRateLimiter, requireTokenBudget as any, researchRouter);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start server - services are initialized but failures don't prevent startup
async function start() {
  // Initialize services gracefully - each one handles its own failure
  await initDatabase();
  await initCache();
  await initQueue();

  // Seed built-in templates on first run
  try { seedBuiltinTemplates(); } catch (e: any) { console.warn('[Seed] Templates:', e.message); }

  app.listen(PORT, () => {
    console.log(`[Server] ADK Orchestrator running on port ${PORT}`);
  });
}

start();
