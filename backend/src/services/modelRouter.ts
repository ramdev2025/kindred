import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import OpenAI from 'openai';
import { getCached, setCache, buildCacheKey } from './cache';
import { searchWithGemini, needsSearch } from './googleSearch';
import { createHash } from 'crypto';

// Initialize AI clients
const gemini = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY || '');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

export interface RoutingDecision {
  model: 'gemini-2.5-pro' | 'gpt-5.4' | 'hermes';
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
  usedSearch?: boolean;
  searchSources?: Array<{ title: string; url: string }>;
}

/**
 * Route request to the best model based on task analysis
 */
export function routeRequest(message: string, preferredModel?: string, hasAttachments?: boolean): RoutingDecision {
  if (preferredModel && preferredModel !== 'auto') {
    return {
      model: preferredModel as RoutingDecision['model'],
      reasoning: 'User preference',
      confidence: 1.0,
    };
  }

  // If there are image/PDF attachments, prefer Gemini (best multimodal)
  if (hasAttachments) {
    return { model: 'gemini-2.5-pro', reasoning: 'Multimodal input - using Gemini for vision/document understanding', confidence: 0.9 };
  }

  const lower = message.toLowerCase();

  // Search tasks → Gemini (has Google Search tool)
  if (needsSearch(lower)) {
    return { model: 'gemini-2.5-pro', reasoning: 'Search task - using Gemini with Google Search', confidence: 0.85 };
  }

  // Deep reasoning indicators -> Hermes
  const deepReasoningKeywords = ['analyze', 'compare', 'trade-off', 'architect', 'design pattern', 'debug complex', 'explain why'];
  if (deepReasoningKeywords.some(k => lower.includes(k))) {
    return { model: 'hermes', reasoning: 'Deep reasoning task detected', confidence: 0.8 };
  }

  // Code generation / transformation -> GPT-5.4
  const codeGenKeywords = ['refactor', 'implement', 'build', 'create a', 'write code', 'full stack', 'api endpoint', 'component'];
  if (codeGenKeywords.some(k => lower.includes(k))) {
    return { model: 'gpt-5.4', reasoning: 'Complex code generation task', confidence: 0.75 };
  }

  // Quick tasks, Q&A, small edits -> Gemini (fast + cost effective)
  return { model: 'gemini-2.5-pro', reasoning: 'Standard task - using fast model', confidence: 0.7 };
}

/**
 * Execute request with Gemini 2.5 Pro (multimodal + Google Search)
 */
async function callGemini(message: string, context?: string, attachments?: Attachment[]): Promise<ChatResponse> {
  const useSearch = needsSearch(message);

  // Try the latest model, fall back to stable versions
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  const model = gemini.getGenerativeModel({
    model: modelName,
    ...(useSearch ? { tools: [{ googleSearch: {} } as any] } : {}),
  });

  const systemPrompt = `You are an expert full-stack developer helping users build applications through natural language.
Generate clean, production-ready code. Always explain what you're building and why.
When you receive files (images, PDFs, CSVs), analyze their content and use it as context.

IMPORTANT — when generating code files, annotate EVERY code block with its file path:
\`\`\`typescript
// filepath: src/components/App.tsx
...code...
\`\`\`
This enables automatic file deployment to the live sandbox. Use relative paths from the project root.
${context ? `\nProject context:\n${context}` : ''}`;

  // Build multimodal parts
  const parts: Part[] = [{ text: message }];

  if (attachments && attachments.length > 0) {
    for (const attachment of attachments) {
      if (attachment.mimeType === 'text/csv') {
        // For CSV, decode and include as text
        const csvText = Buffer.from(attachment.data, 'base64').toString('utf-8');
        parts.push({ text: `\n\n[File: ${attachment.filename}]\n${csvText}` });
      } else {
        // For images and PDFs, use inline data
        parts.push({
          inlineData: {
            mimeType: attachment.mimeType,
            data: attachment.data,
          },
        });
      }
    }
  }

  try {
    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Understood. I\'m ready to help you build your application. I can analyze images, PDFs, and CSVs you share.' }] },
      ],
    });

    const result = await chat.sendMessage(parts);
    const response = result.response;

    // Check for grounding/search metadata
    const groundingMetadata = (response.candidates?.[0] as any)?.groundingMetadata;
    const searchSources: Array<{ title: string; url: string }> = [];

    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web) {
          searchSources.push({ title: chunk.web.title || '', url: chunk.web.uri || '' });
        }
      }
    }

    return {
      content: response.text(),
      model: 'gemini-2.5-pro',
      tokensUsed: response.usageMetadata?.totalTokenCount || 0,
      usedSearch: searchSources.length > 0,
      searchSources: searchSources.length > 0 ? searchSources : undefined,
    };
  } catch (err: any) {
    console.error(`[Gemini] API call failed (model: ${modelName}):`, err.message);
    throw new Error(`Gemini API error: ${err.message}`);
  }
}

/**
 * Execute request with GPT-5.4 (supports images via URL)
 */
async function callGPT(message: string, context?: string, attachments?: Attachment[]): Promise<ChatResponse> {
  const content: Array<any> = [{ type: 'text', text: message }];

  if (attachments && attachments.length > 0) {
    for (const attachment of attachments) {
      if (attachment.mimeType.startsWith('image/')) {
        content.push({
          type: 'image_url',
          image_url: { url: `data:${attachment.mimeType};base64,${attachment.data}` },
        });
      } else if (attachment.mimeType === 'text/csv') {
        const csvText = Buffer.from(attachment.data, 'base64').toString('utf-8');
        content.push({ type: 'text', text: `\n[File: ${attachment.filename}]\n${csvText}` });
      } else if (attachment.mimeType === 'application/pdf') {
        content.push({ type: 'text', text: `\n[Attached PDF: ${attachment.filename} - content not directly readable by this model, please describe what you need from it]` });
      }
    }
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert full-stack developer helping users build applications through natural language.
Generate clean, production-ready code. Always explain what you're building and why.
When you receive images or file content, analyze them and use as context.

IMPORTANT — when generating code files, annotate EVERY code block with its file path:
\`\`\`typescript
// filepath: src/components/App.tsx
...code...
\`\`\`
This enables automatic file deployment to the live sandbox. Use relative paths from the project root.
${context ? `\nProject context:\n${context}` : ''}`,
        },
        { role: 'user', content },
      ],
      max_tokens: 8192,
      temperature: 0.7,
    });

    return {
      content: response.choices[0]?.message?.content || '',
      model: 'gpt-5.4',
      tokensUsed: response.usage?.total_tokens || 0,
    };
  } catch (err: any) {
    console.error('[GPT] API call failed:', err.message);
    throw new Error(`OpenAI API error: ${err.message}`);
  }
}

/**
 * Execute request with Hermes (via worker API)
 */
async function callHermes(message: string, context?: string, attachments?: Attachment[]): Promise<ChatResponse> {
  const hermesUrl = process.env.HERMES_WORKER_URL || 'http://localhost:8000';

  // For Hermes, include file descriptions in the prompt
  let fullMessage = message;
  if (attachments && attachments.length > 0) {
    const fileDescs = attachments.map(a => {
      if (a.mimeType === 'text/csv') {
        const csvText = Buffer.from(a.data, 'base64').toString('utf-8');
        return `[File: ${a.filename}]\n${csvText}`;
      }
      return `[Attached file: ${a.filename} (${a.mimeType})]`;
    });
    fullMessage = `${message}\n\n${fileDescs.join('\n')}`;
  }

  try {
    const response = await fetch(`${hermesUrl}/reason`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: fullMessage, context }),
    });

    if (!response.ok) {
      throw new Error(`Hermes worker returned ${response.status}`);
    }

    const data = await response.json() as { response: string; tokens_used?: number };
    return {
      content: data.response,
      model: 'hermes',
      tokensUsed: data.tokens_used || 0,
    };
  } catch (err: any) {
    console.error('[Hermes] API call failed:', err.message);
    throw new Error(`Hermes API error: ${err.message}`);
  }
}

/**
 * Main entry point: route and execute a chat request
 * Includes fallback: if the primary model fails, try the next one
 */
export async function processChat(request: ChatRequest): Promise<ChatResponse & { routingDecision: RoutingDecision }> {
  // Skip cache if attachments present (multimodal requests are unique)
  if (!request.attachments || request.attachments.length === 0) {
    const cacheKey = buildCacheKey(['chat', createHash('md5').update(request.message).digest('hex')]);
    const cached = await getCached(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      return { ...parsed, routingDecision: { model: parsed.model, reasoning: 'Cached response', confidence: 1.0 } };
    }
  }

  // Route the request
  const routing = routeRequest(request.message, request.preferredModel, (request.attachments?.length || 0) > 0);

  let response: ChatResponse;
  let lastError: Error | null = null;

  // Try primary model, then fallback models
  const modelOrder: Array<'gemini-2.5-pro' | 'gpt-5.4' | 'hermes'> = [routing.model];
  if (!modelOrder.includes('gemini-2.5-pro')) modelOrder.push('gemini-2.5-pro');
  if (!modelOrder.includes('gpt-5.4')) modelOrder.push('gpt-5.4');

  for (const model of modelOrder) {
    try {
      switch (model) {
        case 'gemini-2.5-pro':
          response = await callGemini(request.message, request.context, request.attachments);
          break;
        case 'gpt-5.4':
          response = await callGPT(request.message, request.context, request.attachments);
          break;
        case 'hermes':
          response = await callHermes(request.message, request.context, request.attachments);
          break;
        default:
          response = await callGemini(request.message, request.context, request.attachments);
      }

      // If we get here, the call succeeded
      if (model !== routing.model) {
        console.log(`[Router] Primary model ${routing.model} failed, used fallback: ${model}`);
        routing.model = model;
        routing.reasoning += ` (fallback from ${routing.model})`;
      }

      // Cache text-only responses
      if (!request.attachments || request.attachments.length === 0) {
        const cacheKey = buildCacheKey(['chat', createHash('md5').update(request.message).digest('hex')]);
        await setCache(cacheKey, JSON.stringify(response!), 300);
      }

      return { ...response!, routingDecision: routing };
    } catch (err: any) {
      lastError = err;
      console.warn(`[Router] Model ${model} failed: ${err.message}, trying next...`);
      continue;
    }
  }

  // All models failed
  throw lastError || new Error('All AI models failed to respond');
}

/**
 * Streaming version: yields content chunks as they arrive
 */
export async function* processChatStream(request: ChatRequest): AsyncGenerator<{ type: 'token' | 'done' | 'error' | 'info'; content: string; model?: string; tokensUsed?: number }> {
  const routing = routeRequest(request.message, request.preferredModel, (request.attachments?.length || 0) > 0);
  
  yield { type: 'info', content: JSON.stringify({ model: routing.model, reasoning: routing.reasoning }) };

  try {
    switch (routing.model) {
      case 'gemini-2.5-pro':
        yield* streamGemini(request.message, request.context, request.attachments);
        break;
      case 'gpt-5.4':
        yield* streamGPT(request.message, request.context, request.attachments);
        break;
      case 'hermes':
        // Hermes doesn't support streaming well, fall back to Gemini stream
        yield* streamGemini(request.message, request.context, request.attachments);
        break;
      default:
        yield* streamGemini(request.message, request.context, request.attachments);
    }
  } catch (err: any) {
    yield { type: 'error', content: err.message };
  }
}

async function* streamGemini(message: string, context?: string, attachments?: Attachment[]): AsyncGenerator<{ type: 'token' | 'done'; content: string; model?: string; tokensUsed?: number }> {
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const model = gemini.getGenerativeModel({ model: modelName });

  const systemPrompt = `You are an expert full-stack developer helping users build applications through natural language.
Generate clean, production-ready code. Always explain what you're building and why.

IMPORTANT — when generating code files, annotate EVERY code block with its file path:
\`\`\`typescript
// filepath: src/components/App.tsx
...code...
\`\`\`
This enables automatic file deployment to the live sandbox. Use relative paths from the project root.
${context ? `\nProject context:\n${context}` : ''}`;

  const parts: Part[] = [{ text: message }];
  if (attachments && attachments.length > 0) {
    for (const attachment of attachments) {
      if (attachment.mimeType === 'text/csv') {
        const csvText = Buffer.from(attachment.data, 'base64').toString('utf-8');
        parts.push({ text: `\n\n[File: ${attachment.filename}]\n${csvText}` });
      } else {
        parts.push({ inlineData: { mimeType: attachment.mimeType, data: attachment.data } });
      }
    }
  }

  const chat = model.startChat({
    history: [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Understood. I\'m ready to help.' }] },
    ],
  });

  const result = await chat.sendMessageStream(parts);
  
  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) {
      yield { type: 'token', content: text };
    }
  }

  const response = await result.response;
  yield { type: 'done', content: '', model: 'gemini-2.5-pro', tokensUsed: response.usageMetadata?.totalTokenCount || 0 };
}

async function* streamGPT(message: string, context?: string, attachments?: Attachment[]): AsyncGenerator<{ type: 'token' | 'done'; content: string; model?: string; tokensUsed?: number }> {
  const content: Array<any> = [{ type: 'text', text: message }];
  if (attachments && attachments.length > 0) {
    for (const attachment of attachments) {
      if (attachment.mimeType.startsWith('image/')) {
        content.push({ type: 'image_url', image_url: { url: `data:${attachment.mimeType};base64,${attachment.data}` } });
      } else if (attachment.mimeType === 'text/csv') {
        const csvText = Buffer.from(attachment.data, 'base64').toString('utf-8');
        content.push({ type: 'text', text: `\n[File: ${attachment.filename}]\n${csvText}` });
      }
    }
  }

  const stream = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
    { role: 'system', content: `You are an expert full-stack developer. Generate clean, production-ready code.

IMPORTANT — annotate EVERY code block with its file path:
\`\`\`typescript
// filepath: src/components/App.tsx
...code...
\`\`\`
This enables automatic file deployment to the live sandbox. Use relative paths from the project root.
${context ? `Project context:\n${context}` : ''}` },
      { role: 'user', content },
    ],
    max_tokens: 8192,
    temperature: 0.7,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      yield { type: 'token', content: delta };
    }
  }

  yield { type: 'done', content: '', model: 'gpt-5.4', tokensUsed: 0 };
}
