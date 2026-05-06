import { Queue, Worker, Job } from 'bullmq';
import { isRedisAvailable } from './cache';

let taskQueue: Queue | null = null;
let queueAvailable = false;

export async function initQueue(): Promise<void> {
  if (!isRedisAvailable()) {
    console.warn('[Queue] Redis not available, running without job queue');
    return;
  }

  try {
    const connection = { host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname, port: 6379 };

    taskQueue = new Queue('vibe-tasks', { connection });

    // Worker processes background jobs
    const worker = new Worker('vibe-tasks', async (job: Job) => {
      console.log(`[Queue] Processing job ${job.id}: ${job.name}`);

      switch (job.name) {
        case 'deep-reasoning':
          return await processDeepReasoning(job.data);
        case 'sandbox-build':
          return await processSandboxBuild(job.data);
        default:
          console.warn(`[Queue] Unknown job type: ${job.name}`);
      }
    }, { connection, concurrency: 3 });

    worker.on('completed', (job) => {
      console.log(`[Queue] Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
      console.error(`[Queue] Job ${job?.id} failed:`, err.message);
    });

    queueAvailable = true;
    console.log('[Queue] BullMQ initialized');
  } catch (err: any) {
    console.warn('[Queue] Failed to initialize queue:', err.message);
    queueAvailable = false;
    taskQueue = null;
  }
}

export function getQueue(): Queue | null {
  return taskQueue;
}

export async function enqueueDeepReasoning(data: { prompt: string; sessionId: string; userId: string }) {
  if (!taskQueue) {
    console.warn('[Queue] Queue not available, skipping deep-reasoning job');
    return null;
  }
  return taskQueue.add('deep-reasoning', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  });
}

export async function enqueueSandboxBuild(data: { projectId: string; code: string; language: string }) {
  if (!taskQueue) {
    console.warn('[Queue] Queue not available, skipping sandbox-build job');
    return null;
  }
  return taskQueue.add('sandbox-build', data, {
    attempts: 2,
    backoff: { type: 'fixed', delay: 2000 },
  });
}

// Job processors
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
