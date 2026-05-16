import { Sandbox } from '@e2b/code-interpreter';

interface SandboxInstance {
  sandbox: Sandbox;
  createdAt: Date;
  projectId: string;
}

const activeSandboxes = new Map<string, SandboxInstance>();

// ── Create ────────────────────────────────────────────────────────────────────

export async function createSandbox(
  projectId: string,
): Promise<{ sandboxId: string }> {
  const sandbox = await Sandbox.create({
    apiKey: process.env.E2B_API_KEY,
    timeoutMs: 30 * 60 * 1000, // 30-minute inactivity timeout
  });

  activeSandboxes.set(sandbox.sandboxId, {
    sandbox,
    createdAt: new Date(),
    projectId,
  });

  console.log(`[E2B] Sandbox created: ${sandbox.sandboxId}`);
  return { sandboxId: sandbox.sandboxId };
}

// ── Connect (reconnect after restart / page refresh) ─────────────────────────

export async function connectSandbox(
  sandboxId: string,
  projectId: string,
): Promise<{ sandboxId: string; previewUrl: string | null }> {
  // Already in memory — nothing to do
  if (activeSandboxes.has(sandboxId)) {
    return { sandboxId, previewUrl: getPreviewUrl(sandboxId) };
  }

  try {
    const sandbox = await Sandbox.connect(sandboxId, {
      apiKey: process.env.E2B_API_KEY,
    });

    activeSandboxes.set(sandboxId, { sandbox, createdAt: new Date(), projectId });
    console.log(`[E2B] Sandbox reconnected: ${sandboxId}`);
    return { sandboxId, previewUrl: getPreviewUrl(sandboxId) };
  } catch (err: any) {
    console.error(`[E2B] Reconnect failed for ${sandboxId}: ${err.message}`);
    throw new Error(`Sandbox ${sandboxId} is no longer available. Please start a new one.`);
  }
}

// ── Preview URL ───────────────────────────────────────────────────────────────

/**
 * Returns a fully-qualified https:// URL for the given port.
 * E2B's getHost() returns just the hostname (no protocol).
 */
export function getPreviewUrl(sandboxId: string, port = 3000): string | null {
  const instance = activeSandboxes.get(sandboxId);
  if (!instance) return null;

  try {
    const host = instance.sandbox.getHost(port);
    if (!host) return null;
    return host.startsWith('http') ? host : `https://${host}`;
  } catch {
    // Fallback: E2B public URL format is https://{port}-{sandboxId}.e2b.dev
    return `https://${port}-${sandboxId}.e2b.dev`;
  }
}

// ── Command runner with auto-reconnect ────────────────────────────────────────

async function getInstance(sandboxId: string): Promise<SandboxInstance> {
  const instance = activeSandboxes.get(sandboxId);
  if (instance) return instance;

  // Attempt silent reconnect (backend restarted but sandbox still lives)
  try {
    const sandbox = await Sandbox.connect(sandboxId, {
      apiKey: process.env.E2B_API_KEY,
    });
    const reconnected = { sandbox, createdAt: new Date(), projectId: 'unknown' };
    activeSandboxes.set(sandboxId, reconnected);
    console.log(`[E2B] Auto-reconnected: ${sandboxId}`);
    return reconnected;
  } catch {
    throw new Error(
      `Sandbox ${sandboxId} not found. It may have timed out — please start a new sandbox.`,
    );
  }
}

// ── File operations ───────────────────────────────────────────────────────────

export async function writeFile(
  sandboxId: string,
  path: string,
  content: string,
): Promise<void> {
  const { sandbox } = await getInstance(sandboxId);
  await sandbox.files.write(path, content);
}

export async function readFile(sandboxId: string, path: string): Promise<string> {
  const { sandbox } = await getInstance(sandboxId);
  return sandbox.files.read(path);
}

export async function listFiles(
  sandboxId: string,
  path = '/',
): Promise<Array<{ name: string; type: 'file' | 'dir'; path: string }>> {
  const { sandbox } = await getInstance(sandboxId);
  const entries = await sandbox.files.list(path);
  return entries.map((e: any) => ({
    name: e.name,
    type: e.type === 'dir' ? 'dir' : 'file',
    path: e.path || `${path}/${e.name}`.replace(/\/\//g, '/'),
  }));
}

// ── Command execution ─────────────────────────────────────────────────────────

export async function runCommand(
  sandboxId: string,
  command: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { sandbox } = await getInstance(sandboxId);
  const result = await sandbox.commands.run(command);
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
}

export async function executeInSandbox(
  sandboxId: string,
  code: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { sandbox } = await getInstance(sandboxId);
  const execution = await sandbox.runCode(code);
  return {
    stdout: execution.logs.stdout.join('\n'),
    stderr: execution.logs.stderr.join('\n'),
    exitCode: execution.error ? 1 : 0,
  };
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export async function destroySandbox(sandboxId: string): Promise<void> {
  const instance = activeSandboxes.get(sandboxId);
  if (instance) {
    await instance.sandbox.kill();
    activeSandboxes.delete(sandboxId);
    console.log(`[E2B] Sandbox destroyed: ${sandboxId}`);
  }
}

export function getSandboxStatus(
  sandboxId: string,
): { active: boolean; projectId?: string; createdAt?: Date } {
  const instance = activeSandboxes.get(sandboxId);
  if (!instance) return { active: false };
  return { active: true, projectId: instance.projectId, createdAt: instance.createdAt };
}

export function listActiveSandboxes(): Array<{
  sandboxId: string;
  projectId: string;
  createdAt: Date;
}> {
  return Array.from(activeSandboxes.entries()).map(([id, i]) => ({
    sandboxId: id,
    projectId: i.projectId,
    createdAt: i.createdAt,
  }));
}
