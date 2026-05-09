import OpenAI from 'openai';
import { AnthropicVertex } from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { getCached, setCache, buildCacheKey } from './cache';
import { createHash } from 'crypto';

// ---------------------------------------------------------------------------
// Lazy AI client initialisation (after dotenv.config() has run)
// ---------------------------------------------------------------------------
let _openai: OpenAI | null = null;
let _anthropic: AnthropicVertex | null = null;
let _gemini: GoogleGenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY || '';
    if (!apiKey) console.warn('[OpenAI] OPENAI_API_KEY is not set!');
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

function getAnthropic(): AnthropicVertex {
  if (!_anthropic) {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const region = process.env.GOOGLE_CLOUD_LOCATION || 'global';
    if (!project) console.warn('[Claude/Vertex] GOOGLE_CLOUD_PROJECT is not set!');
    // AnthropicVertex uses ADC — no API key required
    _anthropic = new AnthropicVertex({ projectId: project, region });
    console.log(`[Claude] Using Vertex AI backend (project: ${project}, region: ${region})`);
  }
  return _anthropic;
}

function getGemini(): GoogleGenAI {
  if (!_gemini) {
    const useVertex = (process.env.GOOGLE_GENAI_USE_VERTEXAI || '').toUpperCase() === 'TRUE';
    if (useVertex) {
      _gemini = new GoogleGenAI({
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT,
        location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
      } as any);
      console.log('[Gemini] Using Vertex AI backend');
    } else {
      const apiKey = process.env.GOOGLE_GEMINI_API_KEY || '';
      if (!apiKey) console.warn('[Gemini] GOOGLE_GEMINI_API_KEY is not set!');
      _gemini = new GoogleGenAI({ apiKey });
      console.log('[Gemini] Using AI Studio backend');
    }
  }
  return _gemini;
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------
export interface RoutingDecision {
  model: 'gemini' | 'gpt-4o' | 'claude-sonnet';
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
  attachments?: Attachment[];
}

export interface ChatResponse {
  content: string;
  model: string;
  tokensUsed: number;
}

// ---------------------------------------------------------------------------
// Shared system prompt
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = (context?: string) =>
  `You are an expert full-stack developer helping users build applications through natural language.
Generate clean, production-ready code. Always explain what you're building and why.
When you receive files (images, PDFs, CSVs), analyze their content and use it as context.

IMPORTANT — when generating code files, annotate EVERY code block with its file path:
\`\`\`typescript
// filepath: src/components/App.tsx
...code...
\`\`\`
This enables automatic file deployment to the live sandbox. Use relative paths from the project root.
${context ? `\nProject context:\n${context}` : ''}`;

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------
export function routeRequest(
  message: string,
  preferredModel?: string,
  hasAttachments?: boolean,
): RoutingDecision {
  if (preferredModel && preferredModel !== 'auto') {
    // Normalise legacy model names
    const m = preferredModel === 'gpt-5.4' || preferredModel === 'gpt-4'
      ? 'gpt-4o'
      : preferredModel === 'gemini-2.5-pro' || preferredModel === 'gemini'
        ? 'gemini'
        : preferredModel === 'hermes' || preferredModel === 'claude-3-5-sonnet' || preferredModel === 'claude'
          ? 'claude-sonnet'
          : preferredModel as RoutingDecision['model'];
    return { model: m, reasoning: 'User preference', confidence: 1.0 };
  }

  // Attachments → GPT-4o (best vision) or Gemini (also multimodal)
  if (hasAttachments) {
    return { model: 'gemini', reasoning: 'Multimodal input – Gemini vision via Vertex AI', confidence: 0.9 };
  }

  const lower = message.toLowerCase();

  // Deep reasoning / architecture → Claude
  const claudeKeywords = [
    'analyze', 'analyse', 'compare', 'trade-off', 'tradeoff',
    'design pattern', 'explain why', 'review', 'best approach',
    'pros and cons', 'strategy',
  ];
  if (claudeKeywords.some(k => lower.includes(k))) {
    return { model: 'claude-sonnet', reasoning: 'Reasoning/analysis task – Claude Sonnet on Vertex', confidence: 0.85 };
  }

  // Code generation, web/app tasks → Gemini (via Vertex, uses your credits)
  const geminiKeywords = [
    'build', 'create', 'generate', 'implement', 'write code',
    'full stack', 'api endpoint', 'component', 'function',
    'refactor', 'fix', 'debug',
  ];
  if (geminiKeywords.some(k => lower.includes(k))) {
    return { model: 'gemini', reasoning: 'Code generation – Gemini via Vertex AI', confidence: 0.85 };
  }

  // Default → Gemini (Vertex AI credits, no additional cost)
  return { model: 'gemini', reasoning: 'Standard task – Gemini via Vertex AI', confidence: 0.75 };
}

// ---------------------------------------------------------------------------
// Non-streaming: Gemini via Vertex AI
// ---------------------------------------------------------------------------
async function callGemini(message: string, context?: string, attachments?: Attachment[]): Promise<ChatResponse> {
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const client = getGemini();

  const parts: any[] = [{ text: message }];
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (att.mimeType === 'text/csv') {
        parts.push({ text: `\n[File: ${att.filename}]\n${Buffer.from(att.data, 'base64').toString('utf-8')}` });
      } else {
        parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } });
      }
    }
  }

  try {
    const response = await (client as any).models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts }],
      config: { systemInstruction: SYSTEM_PROMPT(context), maxOutputTokens: 8192, temperature: 0.7 },
    });

    return {
      content: response.text || '',
      model: `gemini-vertex/${modelName}`,
      tokensUsed: response.usageMetadata?.totalTokenCount || 0,
    };
  } catch (err: any) {
    console.error('[Gemini/Vertex] API call failed:', err.message);
    throw new Error(`Gemini Vertex API error: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Non-streaming: GPT-4o (fallback)
// ---------------------------------------------------------------------------
async function callGPT(message: string, context?: string, attachments?: Attachment[]): Promise<ChatResponse> {
  const content: Array<any> = [{ type: 'text', text: message }];
  if (attachments) {
    for (const att of attachments) {
      if (att.mimeType.startsWith('image/')) {
        content.push({ type: 'image_url', image_url: { url: `data:${att.mimeType};base64,${att.data}` } });
      } else if (att.mimeType === 'text/csv') {
        content.push({ type: 'text', text: `\n[File: ${att.filename}]\n${Buffer.from(att.data, 'base64').toString('utf-8')}` });
      }
    }
  }
  try {
    const res = await getOpenAI().chat.completions.create({
      model: 'gpt-4o', messages: [
        { role: 'system', content: SYSTEM_PROMPT(context) },
        { role: 'user', content },
      ], max_tokens: 8192, temperature: 0.7,
    });
    return { content: res.choices[0]?.message?.content || '', model: 'gpt-4o', tokensUsed: res.usage?.total_tokens || 0 };
  } catch (err: any) {
    console.error('[GPT-4o] API call failed:', err.message);
    throw new Error(`OpenAI API error: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Non-streaming: Claude 3.5 Sonnet (fallback)
// ---------------------------------------------------------------------------
async function callClaude(message: string, context?: string, attachments?: Attachment[]): Promise<ChatResponse> {
  const blocks: AnthropicVertex.MessageParam['content'] = [];
  if (attachments) {
    for (const att of attachments) {
      if (att.mimeType.startsWith('image/')) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: att.mimeType as any, data: att.data } });
      } else if (att.mimeType === 'text/csv') {
        blocks.push({ type: 'text', text: `[File: ${att.filename}]\n${Buffer.from(att.data, 'base64').toString('utf-8')}` });
      }
    }
  }
  blocks.push({ type: 'text', text: message });
  try {
    const res = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-6',    // Claude Sonnet 4.6 on Vertex
      max_tokens: 8192,
      system: SYSTEM_PROMPT(context),
      messages: [{ role: 'user', content: blocks }],
    });
    const text = res.content.filter((b): b is AnthropicVertex.TextBlock => b.type === 'text').map(b => b.text).join('');
    return { content: text, model: 'claude-sonnet-4-6-vertex', tokensUsed: res.usage.input_tokens + res.usage.output_tokens };
  } catch (err: any) {
    console.error('[Claude/Vertex] API call failed:', err.message);
    throw new Error(`Claude Vertex API error: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main entry: route + execute with cascading fallback
// Gemini (Vertex) → GPT-4o → Claude
// ---------------------------------------------------------------------------
export async function processChat(
  request: ChatRequest,
): Promise<ChatResponse & { routingDecision: RoutingDecision }> {
  if (!request.attachments || request.attachments.length === 0) {
    const cacheKey = buildCacheKey(['chat', createHash('md5').update(request.message).digest('hex')]);
    const cached = await getCached(cacheKey);
    if (cached) {
      const p = JSON.parse(cached);
      return { ...p, routingDecision: { model: p.model, reasoning: 'Cached response', confidence: 1.0 } };
    }
  }

  const routing = routeRequest(request.message, request.preferredModel, (request.attachments?.length || 0) > 0);
  let lastError: Error | null = null;

  // Fallback order: primary first, then the others
  const order: RoutingDecision['model'][] = [routing.model];
  if (!order.includes('gemini')) order.push('gemini');
  if (!order.includes('gpt-4o')) order.push('gpt-4o');
  if (!order.includes('claude-3-5-sonnet')) order.push('claude-3-5-sonnet');

  for (const model of order) {
    try {
      let response: ChatResponse;
      if (model === 'gemini') response = await callGemini(request.message, request.context, request.attachments);
      else if (model === 'gpt-4o') response = await callGPT(request.message, request.context, request.attachments);
      else response = await callClaude(request.message, request.context, request.attachments);

      if (model !== routing.model) {
        console.log(`[Router] Primary ${routing.model} failed, used fallback: ${model}`);
        routing.model = model;
      }
      if (!request.attachments || request.attachments.length === 0) {
        const cacheKey = buildCacheKey(['chat', createHash('md5').update(request.message).digest('hex')]);
        await setCache(cacheKey, JSON.stringify(response), 300);
      }
      return { ...response, routingDecision: routing };
    } catch (err: any) {
      lastError = err;
      console.warn(`[Router] Model ${model} failed: ${err.message}, trying next...`);
    }
  }
  throw lastError || new Error('All AI models failed');
}

// ---------------------------------------------------------------------------
// Streaming entry
// ---------------------------------------------------------------------------
export async function* processChatStream(
  request: ChatRequest,
): AsyncGenerator<{ type: 'token' | 'done' | 'error' | 'info'; content: string; model?: string; tokensUsed?: number }> {
  const routing = routeRequest(request.message, request.preferredModel, (request.attachments?.length || 0) > 0);
  yield { type: 'info', content: JSON.stringify({ model: routing.model, reasoning: routing.reasoning }) };

  // Primary then fallback
  const order: RoutingDecision['model'][] = [routing.model];
  if (!order.includes('gemini')) order.push('gemini');
  if (!order.includes('gpt-4o')) order.push('gpt-4o');
  if (!order.includes('claude-3-5-sonnet')) order.push('claude-3-5-sonnet');

  for (const model of order) {
    try {
      if (model === 'gemini') {
        yield* streamGemini(request.message, request.context, request.attachments);
      } else if (model === 'gpt-4o') {
        yield* streamGPT(request.message, request.context, request.attachments);
      } else {
        yield* streamClaude(request.message, request.context, request.attachments);
      }
      return; // success
    } catch (err: any) {
      console.warn(`[Router] Stream model ${model} failed: ${err.message}, trying next...`);
      if (model !== order[order.length - 1]) {
        yield { type: 'info', content: JSON.stringify({ model: order[order.indexOf(model) + 1], reasoning: `Fallback from ${model}` }) };
      }
    }
  }
  yield { type: 'error', content: 'All AI models failed to stream a response' };
}

// ---------------------------------------------------------------------------
// Streaming: Gemini via Vertex AI
// ---------------------------------------------------------------------------
async function* streamGemini(
  message: string, context?: string, attachments?: Attachment[],
): AsyncGenerator<{ type: 'token' | 'done'; content: string; model?: string; tokensUsed?: number }> {
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const client = getGemini();
  const parts: any[] = [{ text: message }];
  if (attachments) {
    for (const att of attachments) {
      if (att.mimeType === 'text/csv') {
        parts.push({ text: `\n[File: ${att.filename}]\n${Buffer.from(att.data, 'base64').toString('utf-8')}` });
      } else {
        parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } });
      }
    }
  }

  const stream = await (client as any).models.generateContentStream({
    model: modelName,
    contents: [{ role: 'user', parts }],
    config: { systemInstruction: SYSTEM_PROMPT(context), maxOutputTokens: 8192, temperature: 0.7 },
  });

  let totalTokens = 0;
  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) yield { type: 'token', content: text };
    if (chunk.usageMetadata?.totalTokenCount) totalTokens = chunk.usageMetadata.totalTokenCount;
  }
  yield { type: 'done', content: '', model: `gemini-vertex/${modelName}`, tokensUsed: totalTokens };
}

// ---------------------------------------------------------------------------
// Streaming: GPT-4o
// ---------------------------------------------------------------------------
async function* streamGPT(
  message: string, context?: string, attachments?: Attachment[],
): AsyncGenerator<{ type: 'token' | 'done'; content: string; model?: string; tokensUsed?: number }> {
  const content: any[] = [{ type: 'text', text: message }];
  if (attachments) {
    for (const att of attachments) {
      if (att.mimeType.startsWith('image/')) {
        content.push({ type: 'image_url', image_url: { url: `data:${att.mimeType};base64,${att.data}` } });
      } else if (att.mimeType === 'text/csv') {
        content.push({ type: 'text', text: `\n[File: ${att.filename}]\n${Buffer.from(att.data, 'base64').toString('utf-8')}` });
      }
    }
  }
  const stream = await getOpenAI().chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'system', content: SYSTEM_PROMPT(context) }, { role: 'user', content }],
    max_tokens: 8192, temperature: 0.7, stream: true,
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield { type: 'token', content: delta };
  }
  yield { type: 'done', content: '', model: 'gpt-4o', tokensUsed: 0 };
}

// ---------------------------------------------------------------------------
// Streaming: Claude 3.5 Sonnet
// ---------------------------------------------------------------------------
async function* streamClaude(
  message: string, context?: string, attachments?: Attachment[],
): AsyncGenerator<{ type: 'token' | 'done'; content: string; model?: string; tokensUsed?: number }> {
  const blocks: AnthropicVertex.MessageParam['content'] = [];
  if (attachments) {
    for (const att of attachments) {
      if (att.mimeType.startsWith('image/')) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: att.mimeType as any, data: att.data } });
      } else if (att.mimeType === 'text/csv') {
        blocks.push({ type: 'text', text: `[File: ${att.filename}]\n${Buffer.from(att.data, 'base64').toString('utf-8')}` });
      }
    }
  }
  blocks.push({ type: 'text', text: message });

  let inputTokens = 0, outputTokens = 0;
  const stream = await getAnthropic().messages.stream({
    model: 'claude-sonnet-4-6',    // Claude Sonnet 4.6 on Vertex
    max_tokens: 8192,
    system: SYSTEM_PROMPT(context),
    messages: [{ role: 'user', content: blocks }],
  });
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield { type: 'token', content: event.delta.text };
    } else if (event.type === 'message_start' && (event as any).message?.usage) {
      inputTokens = (event as any).message.usage.input_tokens || 0;
    } else if (event.type === 'message_delta' && (event as any).usage) {
      outputTokens = (event as any).usage.output_tokens || 0;
    }
  }
  yield { type: 'done', content: '', model: 'claude-sonnet-4-6-vertex', tokensUsed: inputTokens + outputTokens };
}
