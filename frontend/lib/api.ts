import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Context stats returned by the backend after each AI response
export interface ContextStats {
  messagesIncluded: number;
  estimatedTokens: number;
  totalSessionTokens: number;
  budget: number;
  usagePercent: number;
  hasSummary: boolean;
  shouldSummarize: boolean;
}

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Add auth token to every request
export function setAuthToken(token: string) {
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}

// --- Projects API ---
export async function fetchProjects(token: string) {
  const res = await api.get('/api/projects', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.projects;
}

export async function createProject(token: string, name: string, description?: string) {
  const res = await api.post('/api/projects', { name, description }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.project;
}

export async function deleteProject(token: string, projectId: string) {
  await api.delete(`/api/projects/${projectId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// --- File Upload API ---
export async function uploadFiles(token: string, files: File[]): Promise<Array<{ fileId: string; filename: string; mimeType: string; size: number }>> {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));

  const res = await api.post('/api/upload', formData, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'multipart/form-data',
    },
  });
  return res.data.files;
}

// --- Chat API ---
export async function sendMessage(
  token: string,
  message: string,
  projectId: string,
  preferredModel?: string,
  attachments?: Array<{ fileId: string }>
) {
  const res = await api.post('/api/chat/send', {
    message,
    projectId,
    preferredModel,
    attachments,
  }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

export async function streamMessage(
  token: string,
  message: string,
  projectId: string,
  preferredModel?: string,
  attachments?: Array<{ fileId: string }>,
  onToken?: (token: string) => void,
  onInfo?: (info: any) => void,
  onDone?: (data: { model: string; tokensUsed: number; sessionId?: string; contextStats?: ContextStats }) => void,
  onError?: (error: string) => void
) {
  const response = await fetch(`${API_BASE}/api/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ message, projectId, preferredModel, attachments }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Stream failed' }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          switch (parsed.type) {
            case 'token':
              onToken?.(parsed.content);
              break;
            case 'info':
              onInfo?.(JSON.parse(parsed.content));
              break;
            case 'done':
              onDone?.(parsed);
              break;
            case 'error':
              onError?.(parsed.content);
              break;
          }
        } catch {}
      }
    }
  }
}

/**
 * streamAgenticMessage — POST /api/chat/agentic (SSE stream)
 * Combines AI response streaming with automatic deploy + error fix loop.
 * Returns an AbortController so the caller can cancel mid-loop.
 */
export interface AgenticCallbacks {
  onToken?: (token: string) => void;
  onInfo?: (info: any) => void;
  onAiDone?: (data: { model: string; tokensUsed: number; sessionId?: string; contextStats?: ContextStats }) => void;
  onIterationStart?: (data: { iteration: number; maxIterations: number }) => void;
  onDeployLog?: (line: string) => void;
  onDeployResult?: (data: { success: boolean; previewUrl?: string | null; error?: string }) => void;
  onFixStart?: (data: { error: string; iteration: number; maxIterations: number }) => void;
  onFixDone?: (content: string) => void;
  onLoopComplete?: (data: { success: boolean; iteration?: number; maxIterations?: number; previewUrl?: string | null; error?: string }) => void;
  onError?: (error: string) => void;
}

export function streamAgenticMessage(
  token: string,
  message: string,
  projectId: string,
  sandboxId: string,
  preferredModel?: string,
  attachments?: Array<{ fileId: string }>,
  maxIterations?: number,
  callbacks?: AgenticCallbacks,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(`${API_BASE}/api/chat/agentic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ message, projectId, preferredModel, sandboxId, maxIterations, attachments }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Agentic stream failed' }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          try {
            const parsed = JSON.parse(raw);
            switch (parsed.type) {
              case 'token':
                callbacks?.onToken?.(parsed.content);
                break;
              case 'info':
                callbacks?.onInfo?.(JSON.parse(parsed.content));
                break;
              case 'ai_done':
                callbacks?.onAiDone?.(parsed);
                break;
              case 'iteration_start':
                callbacks?.onIterationStart?.(parsed);
                break;
              case 'deploy_log':
                callbacks?.onDeployLog?.(parsed.content);
                break;
              case 'deploy_result':
                callbacks?.onDeployResult?.(parsed);
                break;
              case 'fix_start':
                callbacks?.onFixStart?.(parsed);
                break;
              case 'fix_done':
                callbacks?.onFixDone?.(parsed.content);
                break;
              case 'loop_complete':
                callbacks?.onLoopComplete?.(parsed);
                break;
              case 'error':
                callbacks?.onError?.(parsed.content);
                break;
            }
          } catch { /* ignore malformed SSE lines */ }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        callbacks?.onError?.(err.message || 'Agentic stream failed');
      }
    }
  })();

  return controller;
}

export async function getChatHistory(token: string, sessionId: string) {
  const res = await api.get(`/api/chat/history/${sessionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.messages;
}

export async function getProjectSession(token: string, projectId: string) {
  const res = await api.get(`/api/chat/session/${projectId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.session;
}

// --- Sandbox API ---
export async function createSandbox(token: string, projectId: string) {
  const res = await api.post('/api/sandbox/create', { projectId }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

export async function executeSandboxCommand(token: string, sandboxId: string, command: string) {
  const res = await api.post('/api/sandbox/command', { sandboxId, command }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

export async function executeSandboxCode(token: string, sandboxId: string, code: string) {
  const res = await api.post('/api/sandbox/execute', { sandboxId, code }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

export async function fetchSandboxFiles(token: string, sandboxId: string, path?: string) {
  const params = path ? `?path=${encodeURIComponent(path)}` : '';
  const res = await api.get(`/api/sandbox/files/${sandboxId}${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.files as Array<{ name: string; type: 'file' | 'dir'; path: string }>;
}

export async function fetchPreviewUrl(token: string, sandboxId: string, port: number = 3000) {
  const res = await api.get(`/api/sandbox/preview-url/${sandboxId}/${port}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.url as string;
}

export async function readSandboxFile(token: string, sandboxId: string, filePath: string) {
  const res = await api.post('/api/sandbox/read-file', { sandboxId, path: filePath }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.content as string;
}

export async function writeSandboxFile(token: string, sandboxId: string, filePath: string, content: string) {
  await api.post('/api/sandbox/write-file', { sandboxId, path: filePath, content }, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * deployFiles — POST /api/sandbox/deploy (SSE stream)
 * Writes files to the sandbox, installs deps, starts the server,
 * and streams log lines back via Server-Sent Events.
 */
export async function deployFiles(
  token: string,
  sandboxId: string,
  files: Array<{ path: string; content: string; language?: string }>,
  onLog?: (line: string) => void,
  onDone?: (result: { success: boolean; previewUrl?: string | null; filesWritten: number; error?: string }) => void,
  onError?: (error: string) => void,
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/sandbox/deploy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ sandboxId, files }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Deploy failed' }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      try {
        const parsed = JSON.parse(raw);
        switch (parsed.type) {
          case 'log':  onLog?.(parsed.content); break;
          case 'done': onDone?.(parsed);        break;
          case 'error': onError?.(parsed.content); break;
        }
      } catch { /* ignore malformed SSE lines */ }
    }
  }
}

// --- Billing & Usage API (Phase 6.1) ---

export interface UsageSummary {
  tier: string;
  tokens: { used: number; limit: number; remaining: number };
  sandboxes: { used: number; limit: number; remaining: number };
  projects: { current: number; limit: number };
  billingCycleStart: string;
}

export async function fetchUsage(token: string): Promise<UsageSummary> {
  const res = await api.get('/api/billing/usage', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.usage;
}

export interface PricingTier {
  id: string;
  name: string;
  price: number;
  tokens: number;
  sandboxes: number;
  projects: number;
  features: string[];
}

export async function fetchPricingTiers(): Promise<PricingTier[]> {
  const res = await api.get('/api/billing/tiers');
  return res.data.tiers;
}

// --- Templates API (Phase 6.4) ---

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  tech_stack: string[];
  files: { prompt?: string };
  use_count: number;
  is_builtin: number;
  created_at: string;
}

export async function fetchTemplates(category?: string): Promise<Template[]> {
  const params = category ? `?category=${encodeURIComponent(category)}` : '';
  const res = await api.get(`/api/templates${params}`);
  return res.data.templates;
}

export async function fetchTemplateById(token: string, templateId: string): Promise<Template> {
  const res = await api.get(`/api/templates/${templateId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.template;
}

export async function useTemplate(token: string, templateId: string, projectName?: string, customPrompt?: string) {
  const res = await api.post(`/api/templates/${templateId}/use`, { projectName, customPrompt }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data as { project: any; initialPrompt: string; template: { id: string; name: string; category: string } };
}

// --- PayPal API (Phase 6.1) ---

export async function createPayPalOrder(token: string, tierId: string): Promise<string> {
  const res = await api.post('/api/billing/paypal/create-order', { tierId }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.id;
}

export async function capturePayPalOrder(token: string, orderID: string): Promise<{ success: boolean; tier: string }> {
  const res = await api.post('/api/billing/paypal/capture-order', { orderID }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}
