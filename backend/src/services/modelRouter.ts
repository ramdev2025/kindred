import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import { Anthropic } from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { getCached, setCache, buildCacheKey } from './cache';
import { getSkill, type SkillId } from './skills';
import { createHash } from 'crypto';

// ── Lazy client initialisation ────────────────────────────────────────────────
let _anthropic: AnthropicVertex | null = null;
let _gemini: GoogleGenAI | null = null;

function getAnthropic(): AnthropicVertex {
  if (!_anthropic) {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const region  = process.env.GOOGLE_CLOUD_LOCATION || 'global';
    if (!project) console.warn('[Claude/Vertex] GOOGLE_CLOUD_PROJECT is not set!');
    _anthropic = new AnthropicVertex({ projectId: project, region });
    console.log(`[Claude] Vertex AI (project: ${project}, region: ${region})`);
  }
  return _anthropic;
}

function getGemini(): GoogleGenAI {
  if (!_gemini) {
    const useVertex = (process.env.GOOGLE_GENAI_USE_VERTEXAI || '').toUpperCase() === 'TRUE';
    if (useVertex) {
      _gemini = new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT, location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1' } as any);
      console.log('[Gemini] Vertex AI backend');
    } else {
      const apiKey = process.env.GOOGLE_GEMINI_API_KEY || '';
      if (!apiKey) console.warn('[Gemini] GOOGLE_GEMINI_API_KEY is not set!');
      _gemini = new GoogleGenAI({ apiKey });
      console.log('[Gemini] AI Studio backend');
    }
  }
  return _gemini;
}

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface RoutingDecision {
  model: 'gemini' | 'claude-sonnet';
  reasoning: string;
  confidence: number;
}

export interface Attachment {
  mimeType: string;
  data: string; // base64
  filename: string;
}

export interface ChatRequest {
  message: string;
  context?: string;
  projectId?: string;
  preferredModel?: string;
  skill?: SkillId;
  attachments?: Attachment[];
}

export interface ChatResponse {
  content: string;
  model: string;
  tokensUsed: number;
  usedSearch?: boolean;
  searchSources?: any[];
}

// ── System prompt — delegated to the active skill ────────────────────────────
const SYSTEM_PROMPT = (context?: string, skill?: SkillId) =>
  getSkill(skill).systemPrompt(context);

// ── Routing ───────────────────────────────────────────────────────────────────

export function routeRequest(
  message: string,
  preferredModel?: string,
  hasAttachments?: boolean,
  skill?: SkillId,
): RoutingDecision {
  if (preferredModel && preferredModel !== 'auto') {
    const m = ['gpt-5.4', 'gpt-4', 'gpt-4o'].includes(preferredModel) ? 'gemini'
      : ['gemini-2.5-pro', 'gemini'].includes(preferredModel) ? 'gemini'
      : ['hermes', 'claude-3-5-sonnet', 'claude'].includes(preferredModel) ? 'claude-sonnet'
      : preferredModel as RoutingDecision['model'];
    return { model: m, reasoning: 'User preference', confidence: 1.0 };
  }

  if (hasAttachments) {
    return { model: 'gemini', reasoning: 'Multimodal input — Gemini vision', confidence: 0.9 };
  }

  const lower = message.toLowerCase();

  // Security skill always goes to Claude (reasoning-heavy)
  if (skill === 'security') {
    return { model: 'claude-sonnet', reasoning: 'Security analysis — Claude Sonnet', confidence: 0.95 };
  }

  // Deep reasoning → Claude
  if (['analyze', 'analyse', 'compare', 'trade-off', 'tradeoff', 'design pattern', 'explain why', 'review', 'best approach', 'pros and cons', 'strategy'].some(k => lower.includes(k))) {
    return { model: 'claude-sonnet', reasoning: 'Reasoning/analysis — Claude Sonnet', confidence: 0.85 };
  }

  // Code generation → Gemini
  if (['build', 'create', 'generate', 'implement', 'write code', 'full stack', 'api endpoint', 'component', 'function', 'refactor', 'fix', 'debug', 'dockerfile', 'deploy', 'pipeline', 'ci/cd'].some(k => lower.includes(k))) {
    return { model: 'gemini', reasoning: 'Code generation — Gemini', confidence: 0.85 };
  }

  // Skill-based default
  const skillDefault = getSkill(skill).preferredModel;
  return { model: skillDefault, reasoning: `Skill default (${skill ?? 'engineer'}) — ${skillDefault}`, confidence: 0.75 };
}

// ── Non-streaming: Gemini ─────────────────────────────────────────────────────

async function callGemini(message: string, context?: string, attachments?: Attachment[], skill?: SkillId): Promise<ChatResponse> {
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const client = getGemini();
  const parts: any[] = [{ text: message }];
  if (attachments?.length) {
    for (const att of attachments) {
      if (att.mimeType === 'text/csv') parts.push({ text: `\n[File: ${att.filename}]\n${Buffer.from(att.data, 'base64').toString('utf-8')}` });
      else parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } });
    }
  }
  try {
    const response = await (client as any).models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts }],
      config: { systemInstruction: SYSTEM_PROMPT(context, skill), maxOutputTokens: 8192, temperature: 0.7 },
    });
    return { content: response.text || '', model: `gemini-vertex/${modelName}`, tokensUsed: response.usageMetadata?.totalTokenCount || 0 };
  } catch (err: any) {
    console.error('[Gemini/Vertex]', err.message);
    throw new Error(`Gemini Vertex API error: ${err.message}`);
  }
}

// ── Non-streaming: Claude ─────────────────────────────────────────────────────

async function callClaude(message: string, context?: string, attachments?: Attachment[], skill?: SkillId): Promise<ChatResponse> {
  const blocks: Anthropic.MessageParam['content'] = [];
  if (attachments) {
    for (const att of attachments) {
      if (att.mimeType.startsWith('image/')) blocks.push({ type: 'image', source: { type: 'base64', media_type: att.mimeType as any, data: att.data } });
      else if (att.mimeType === 'text/csv') blocks.push({ type: 'text', text: `[File: ${att.filename}]\n${Buffer.from(att.data, 'base64').toString('utf-8')}` });
    }
  }
  blocks.push({ type: 'text', text: message });
  try {
    const res = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: SYSTEM_PROMPT(context, skill),
      messages: [{ role: 'user', content: blocks }],
    });
    const text = res.content.filter((b: any): b is Anthropic.TextBlock => b.type === 'text').map((b: any) => b.text).join('');
    return { content: text, model: 'claude-sonnet-4-6-vertex', tokensUsed: res.usage.input_tokens + res.usage.output_tokens };
  } catch (err: any) {
    console.error('[Claude/Vertex]', err.message);
    throw new Error(`Claude Vertex API error: ${err.message}`);
  }
}

// ── Main non-streaming entry ──────────────────────────────────────────────────

export async function processChat(
  request: ChatRequest,
): Promise<ChatResponse & { routingDecision: RoutingDecision }> {
  if (!request.attachments?.length) {
    const cacheKey = buildCacheKey(['chat', createHash('md5').update(request.message + (request.skill ?? '')).digest('hex')]);
    const cached = await getCached(cacheKey);
    if (cached) {
      const p = JSON.parse(cached);
      return { ...p, routingDecision: { model: p.model, reasoning: 'Cached response', confidence: 1.0 } };
    }
  }

  const routing = routeRequest(request.message, request.preferredModel, (request.attachments?.length || 0) > 0, request.skill);
  let lastError: Error | null = null;

  const order: RoutingDecision['model'][] = [routing.model];
  if (!order.includes('gemini')) order.push('gemini');
  if (!order.includes('claude-sonnet')) order.push('claude-sonnet');

  for (const model of order) {
    try {
      const response = model === 'gemini'
        ? await callGemini(request.message, request.context, request.attachments, request.skill)
        : await callClaude(request.message, request.context, request.attachments, request.skill);

      if (model !== routing.model) { console.log(`[Router] Fallback to ${model}`); routing.model = model; }
      if (!request.attachments?.length) {
        const cacheKey = buildCacheKey(['chat', createHash('md5').update(request.message + (request.skill ?? '')).digest('hex')]);
        await setCache(cacheKey, JSON.stringify(response), 300);
      }
      return { ...response, routingDecision: routing };
    } catch (err: any) {
      lastError = err;
      console.warn(`[Router] ${model} failed: ${err.message}`);
    }
  }
  throw lastError || new Error('All AI models failed');
}

// ── Streaming entry ───────────────────────────────────────────────────────────

export async function* processChatStream(
  request: ChatRequest,
): AsyncGenerator<{ type: 'token' | 'done' | 'error' | 'info'; content: string; model?: string; tokensUsed?: number }> {
  const routing = routeRequest(request.message, request.preferredModel, (request.attachments?.length || 0) > 0, request.skill);
  yield { type: 'info', content: JSON.stringify({ model: routing.model, reasoning: routing.reasoning, skill: request.skill ?? 'engineer' }) };

  const order: RoutingDecision['model'][] = [routing.model];
  if (!order.includes('gemini')) order.push('gemini');
  if (!order.includes('claude-sonnet')) order.push('claude-sonnet');

  for (const model of order) {
    try {
      if (model === 'gemini') yield* streamGemini(request.message, request.context, request.attachments, request.skill);
      else yield* streamClaude(request.message, request.context, request.attachments, request.skill);
      return;
    } catch (err: any) {
      console.warn(`[Router] Stream ${model} failed: ${err.message}`);
      if (model !== order[order.length - 1]) yield { type: 'info', content: JSON.stringify({ model: order[order.indexOf(model) + 1], reasoning: `Fallback from ${model}` }) };
    }
  }
  yield { type: 'error', content: 'All AI models failed to stream a response' };
}

// ── Streaming: Gemini ─────────────────────────────────────────────────────────

async function* streamGemini(
  message: string, context?: string, attachments?: Attachment[], skill?: SkillId,
): AsyncGenerator<{ type: 'token' | 'done'; content: string; model?: string; tokensUsed?: number }> {
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const client = getGemini();
  const parts: any[] = [{ text: message }];
  if (attachments) {
    for (const att of attachments) {
      if (att.mimeType === 'text/csv') parts.push({ text: `\n[File: ${att.filename}]\n${Buffer.from(att.data, 'base64').toString('utf-8')}` });
      else parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } });
    }
  }
  const stream = await (client as any).models.generateContentStream({
    model: modelName,
    contents: [{ role: 'user', parts }],
    config: { systemInstruction: SYSTEM_PROMPT(context, skill), maxOutputTokens: 8192, temperature: 0.7 },
  });
  let totalTokens = 0;
  for await (const chunk of stream) {
    if (chunk.text) yield { type: 'token', content: chunk.text };
    if (chunk.usageMetadata?.totalTokenCount) totalTokens = chunk.usageMetadata.totalTokenCount;
  }
  yield { type: 'done', content: '', model: `gemini-vertex/${modelName}`, tokensUsed: totalTokens };
}

// ── Streaming: Claude ─────────────────────────────────────────────────────────

async function* streamClaude(
  message: string, context?: string, attachments?: Attachment[], skill?: SkillId,
): AsyncGenerator<{ type: 'token' | 'done'; content: string; model?: string; tokensUsed?: number }> {
  const blocks: Anthropic.MessageParam['content'] = [];
  if (attachments) {
    for (const att of attachments) {
      if (att.mimeType.startsWith('image/')) blocks.push({ type: 'image', source: { type: 'base64', media_type: att.mimeType as any, data: att.data } });
      else if (att.mimeType === 'text/csv') blocks.push({ type: 'text', text: `[File: ${att.filename}]\n${Buffer.from(att.data, 'base64').toString('utf-8')}` });
    }
  }
  blocks.push({ type: 'text', text: message });
  let inputTokens = 0, outputTokens = 0;
  const stream = await getAnthropic().messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: SYSTEM_PROMPT(context, skill),
    messages: [{ role: 'user', content: blocks }],
  });
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') yield { type: 'token', content: event.delta.text };
    else if (event.type === 'message_start' && (event as any).message?.usage) inputTokens = (event as any).message.usage.input_tokens || 0;
    else if (event.type === 'message_delta' && (event as any).usage) outputTokens = (event as any).usage.output_tokens || 0;
  }
  yield { type: 'done', content: '', model: 'claude-sonnet-4-6-vertex', tokensUsed: inputTokens + outputTokens };
}
