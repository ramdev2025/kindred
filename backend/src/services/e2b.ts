import { Sandbox } from '@e2b/code-interpreter';

interface SandboxInstance {
  sandbox: Sandbox;
  createdAt: Date;
  projectId: string;
}

// Track active sandboxes
const activeSandboxes = new Map<string, SandboxInstance>();

/**
 * Create a new E2B sandbox for a project
 */
export async function createSandbox(projectId: string): Promise<{ sandboxId: string; url?: string }> {
  const sandbox = await Sandbox.create({
    apiKey: process.env.E2B_API_KEY,
  });

  activeSandboxes.set(sandbox.sandboxId, {
    sandbox,
    createdAt: new Date(),
    projectId,
  });

  console.log(`[E2B] Sandbox created: ${sandbox.sandboxId} for project ${projectId}`);

  return {
    sandboxId: sandbox.sandboxId,
    url: `https://${sandbox.sandboxId}.e2b.dev`,
  };
}

/**
 * Execute code in an existing sandbox
 */
export async function executeInSandbox(sandboxId: string, code: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const instance = activeSandboxes.get(sandboxId);
  if (!instance) {
    throw new Error(`Sandbox ${sandboxId} not found`);
  }

  const execution = await instance.sandbox.runCode(code);

  return {
    stdout: execution.logs.stdout.join('\n'),
    stderr: execution.logs.stderr.join('\n'),
    exitCode: execution.error ? 1 : 0,
  };
}

/**
 * Run a terminal command in the sandbox
 */
export async function runCommand(sandboxId: string, command: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const instance = activeSandboxes.get(sandboxId);
  if (!instance) {
    throw new Error(`Sandbox ${sandboxId} not found`);
  }

  const result = await instance.sandbox.commands.run(command);

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
}

/**
 * Write a file to the sandbox filesystem
 */
export async function writeFile(sandboxId: string, path: string, content: string): Promise<void> {
  const instance = activeSandboxes.get(sandboxId);
  if (!instance) {
    throw new Error(`Sandbox ${sandboxId} not found`);
  }

  await instance.sandbox.files.write(path, content);
}

/**
 * Read a file from the sandbox filesystem
 */
export async function readFile(sandboxId: string, path: string): Promise<string> {
  const instance = activeSandboxes.get(sandboxId);
  if (!instance) {
    throw new Error(`Sandbox ${sandboxId} not found`);
  }

  return await instance.sandbox.files.read(path);
}

/**
 * Kill a sandbox
 */
export async function destroySandbox(sandboxId: string): Promise<void> {
  const instance = activeSandboxes.get(sandboxId);
  if (instance) {
    await instance.sandbox.kill();
    activeSandboxes.delete(sandboxId);
    console.log(`[E2B] Sandbox destroyed: ${sandboxId}`);
  }
}

/**
 * Get sandbox status
 */
export function getSandboxStatus(sandboxId: string): { active: boolean; projectId?: string; createdAt?: Date } {
  const instance = activeSandboxes.get(sandboxId);
  if (!instance) return { active: false };
  return { active: true, projectId: instance.projectId, createdAt: instance.createdAt };
}

/**
 * List all active sandboxes
 */
export function listActiveSandboxes(): Array<{ sandboxId: string; projectId: string; createdAt: Date }> {
  return Array.from(activeSandboxes.entries()).map(([id, instance]) => ({
    sandboxId: id,
    projectId: instance.projectId,
    createdAt: instance.createdAt,
  }));
}

/**
 * List files in a sandbox directory
 */
export async function listFiles(sandboxId: string, path: string = '/'): Promise<Array<{ name: string; type: 'file' | 'dir'; path: string }>> {
  const instance = activeSandboxes.get(sandboxId);
  if (!instance) {
    throw new Error(`Sandbox ${sandboxId} not found`);
  }

  const entries = await instance.sandbox.files.list(path);
  return entries.map((entry: any) => ({
    name: entry.name,
    type: entry.type === 'dir' ? 'dir' : 'file',
    path: entry.path || `${path}/${entry.name}`.replace(/\/\//g, '/'),
  }));
}

/**
 * Get the public URL for a port running in the sandbox
 */
export function getPreviewUrl(sandboxId: string, port: number = 3000): string | null {
  const instance = activeSandboxes.get(sandboxId);
  if (!instance) return null;

  try {
    return instance.sandbox.getHost(port);
  } catch {
    return `https://${sandboxId}-${port}.e2b.dev`;
  }
}
