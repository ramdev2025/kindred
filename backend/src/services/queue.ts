/**
 * SQLite-backed job queue — zero-dependency replacement for BullMQ + Redis.
 *
 * Uses a `job_queue` table in the existing SQLite database.
 * Jobs are processed in-process with configurable concurrency.
 * Supports retries with exponential/fixed backoff.
 *
 * This is suitable for single-server deployments. For multi-server,
 * consider migrating to a distributed queue (SQS, Cloud Tasks, etc.).
 */
import { getSQLite } from '../db/sqlite';
import { v4 as uuidv4 } from 'uuid';

let initialized = false;
let processing = false;
let pollInterval: ReturnType<typeof setInterval> | null = null;

function ensureTable() {
  if (initialized) return;
  const db = getSQLite();
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_queue (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      data        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead')),
      attempts    INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      backoff_ms  INTEGER NOT NULL DEFAULT 1000,
      backoff_type TEXT NOT NULL DEFAULT 'exponential',
      result      TEXT,
      error       TEXT,
      run_after   INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status, run_after);
  `);
  initialized = true;
}

// ── Job processors registry ─────────────────────────────────────────────────
type JobProcessor = (data: any) => Promise<any>;
const processors = new Map<string, JobProcessor>();

function registerProcessor(name: string, fn: JobProcessor) {
  processors.set(name, fn);
}

// ── Core queue logic ────────────────────────────────────────────────────────

async function processNextJobs(concurrency = 3) {
  if (processing) return;
  processing = true;

  try {
    ensureTable();
    const db = getSQLite();
    const now = Date.now();

    // Fetch up to `concurrency` pending jobs that are ready to run
    const jobs = db.prepare(
      `SELECT * FROM job_queue
       WHERE status = 'pending' AND run_after <= ?
       ORDER BY created_at ASC
       LIMIT ?`
    ).all(now, concurrency) as any[];

    for (const job of jobs) {
      const processor = processors.get(job.name);
      if (!processor) {
        db.prepare(
          "UPDATE job_queue SET status = 'dead', error = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(`No processor registered for job type: ${job.name}`, job.id);
        continue;
      }

      // Mark as processing
      db.prepare(
        "UPDATE job_queue SET status = 'processing', attempts = attempts + 1, updated_at = datetime('now') WHERE id = ?"
      ).run(job.id);

      try {
        const data = JSON.parse(job.data);
        const result = await processor(data);
        db.prepare(
          "UPDATE job_queue SET status = 'completed', result = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(JSON.stringify(result ?? null), job.id);
        console.log(`[Queue] Job ${job.id} (${job.name}) completed`);
      } catch (err: any) {
        const attempts = job.attempts + 1;
        if (attempts >= job.max_attempts) {
          db.prepare(
            "UPDATE job_queue SET status = 'dead', error = ?, updated_at = datetime('now') WHERE id = ?"
          ).run(err.message, job.id);
          console.error(`[Queue] Job ${job.id} (${job.name}) dead after ${attempts} attempts: ${err.message}`);
        } else {
          // Calculate backoff delay
          const delay = job.backoff_type === 'exponential'
            ? job.backoff_ms * Math.pow(2, attempts - 1)
            : job.backoff_ms;
          const runAfter = Date.now() + delay;
          db.prepare(
            "UPDATE job_queue SET status = 'pending', error = ?, run_after = ?, updated_at = datetime('now') WHERE id = ?"
          ).run(err.message, runAfter, job.id);
          console.warn(`[Queue] Job ${job.id} (${job.name}) failed, retry in ${delay}ms (attempt ${attempts}/${job.max_attempts})`);
        }
      }
    }
  } catch (err: any) {
    console.error('[Queue] Processing error:', err.message);
  } finally {
    processing = false;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function initQueue(): Promise<void> {
  try {
    ensureTable();

    // Register built-in job processors
    registerProcessor('deep-reasoning', processDeepReasoning);
    registerProcessor('sandbox-build', processSandboxBuild);

    // Poll for new jobs every 2 seconds
    if (!pollInterval) {
      pollInterval = setInterval(() => processNextJobs(3), 2000);
      pollInterval.unref();
    }

    console.log('[Queue] SQLite-backed job queue initialized');
  } catch (err: any) {
    console.warn('[Queue] Failed to initialize:', err.message);
  }
}

export async function enqueueDeepReasoning(data: { prompt: string; sessionId: string; userId: string }) {
  return enqueue('deep-reasoning', data, { maxAttempts: 3, backoffType: 'exponential', backoffMs: 1000 });
}

export async function enqueueSandboxBuild(data: { projectId: string; code: string; language: string }) {
  return enqueue('sandbox-build', data, { maxAttempts: 2, backoffType: 'fixed', backoffMs: 2000 });
}

function enqueue(
  name: string,
  data: any,
  opts: { maxAttempts?: number; backoffType?: 'exponential' | 'fixed'; backoffMs?: number } = {}
): string {
  ensureTable();
  const db = getSQLite();
  const id = uuidv4();
  db.prepare(
    `INSERT INTO job_queue (id, name, data, status, max_attempts, backoff_type, backoff_ms, run_after)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`
  ).run(
    id,
    name,
    JSON.stringify(data),
    opts.maxAttempts ?? 3,
    opts.backoffType ?? 'exponential',
    opts.backoffMs ?? 1000,
    0 // run immediately
  );
  return id;
}

/** Get the status of a specific job */
export function getJobStatus(jobId: string) {
  ensureTable();
  const db = getSQLite();
  const row = db.prepare('SELECT * FROM job_queue WHERE id = ?').get(jobId) as any;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    attempts: row.attempts,
    result: row.result ? JSON.parse(row.result) : null,
    error: row.error,
    createdAt: row.created_at,
  };
}

/** Placeholder: returns null since there's no separate Queue object needed */
export function getQueue(): null {
  return null;
}

// ── Built-in job processors ─────────────────────────────────────────────────

async function processDeepReasoning(data: { prompt: string; sessionId: string; userId: string }) {
  const hermesUrl = process.env.HERMES_WORKER_URL || 'http://localhost:8000';
  const response = await fetch(`${hermesUrl}/reason`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: data.prompt, session_id: data.sessionId }),
  });
  return response.json();
}

async function processSandboxBuild(data: { projectId: string; code: string; language: string }) {
  // Handled by E2B service directly for real-time feedback
  console.log(`[Queue] Sandbox build for project ${data.projectId}`);
  return { status: 'delegated_to_e2b' };
}
