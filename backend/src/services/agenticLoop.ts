import { processChatStream, ChatRequest } from './modelRouter';
import { deployToSandbox, DeployFile } from './deployPipeline';

export interface AgenticLoopParams {
  sandboxId: string;
  initialResponse: string;
  originalMessage: string;
  context?: string;
  preferredModel?: string;
  maxIterations?: number;
}

export interface AgenticEvent {
  type:
    | 'iteration_start'
    | 'deploy_log'
    | 'deploy_result'
    | 'fix_start'
    | 'token'
    | 'fix_done'
    | 'loop_complete';
  content?: string;
  iteration?: number;
  maxIterations?: number;
  success?: boolean;
  previewUrl?: string | null;
  error?: string;
  model?: string;
}

/**
 * Parse code files from AI response markdown.
 * Mirrors the frontend parseCodeFiles logic.
 */
function parseCodeFiles(content: string): DeployFile[] {
  const files: DeployFile[] = [];
  const blockRe = /```(\w+)?(?::([^\n]+))?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = blockRe.exec(content)) !== null) {
    const language = match[1] || 'text';
    let filePath: string | null = match[2]?.trim() ?? null;
    const rawCode = match[3];

    if (!filePath) {
      const firstLine = rawCode.split('\n')[0].trim();
      const pathMatch = firstLine.match(/^\/\/\s*(?:filepath|file|path|filename):\s*(.+)$/i);
      if (pathMatch) filePath = pathMatch[1].trim();
    }

    if (filePath) {
      const lines = rawCode.split('\n');
      const hasPathComment = /^\/\/\s*(?:filepath|file|path|filename):/i.test(lines[0].trim());
      const codeContent = hasPathComment ? lines.slice(1).join('\n') : rawCode;
      files.push({ path: filePath, content: codeContent.trimStart(), language });
    }
  }

  // Fallback: single un-annotated block
  if (files.length === 0) {
    const single = /```(\w+)?\n([\s\S]*?)```/.exec(content);
    if (single) {
      const language = single[1] || 'javascript';
      const extMap: Record<string, string> = {
        typescript: 'index.ts', ts: 'index.ts',
        javascript: 'index.js', js: 'index.js',
        python: 'main.py', py: 'main.py',
        html: 'index.html', css: 'styles.css',
        jsx: 'App.jsx', tsx: 'App.tsx',
      };
      files.push({ path: extMap[language] ?? `main.${language}`, content: single[2], language });
    }
  }

  return files;
}

/**
 * Build a fix prompt that includes the error context from a failed deployment.
 */
function buildFixPrompt(originalMessage: string, code: string, error: string, iteration: number): string {
  return `The code you generated for the following request failed during deployment.

ORIGINAL REQUEST: ${originalMessage}

DEPLOYMENT ERROR (attempt ${iteration}):
${error}

Please fix the code to resolve this error. Make sure to:
1. Address the specific error shown above
2. Keep all file path annotations (// filepath: ...) intact
3. Output the complete corrected file(s)

Generate the fixed code now.`;
}

/**
 * Run the agentic loop: deploy → check errors → fix → redeploy → repeat.
 *
 * Yields SSE-compatible events throughout the process so the frontend
 * can show real-time progress of each iteration.
 */
export async function* runAgenticLoop(params: AgenticLoopParams): AsyncGenerator<AgenticEvent> {
  const {
    sandboxId,
    initialResponse,
    originalMessage,
    context,
    preferredModel,
    maxIterations = 3,
  } = params;

  let currentCode = initialResponse;
  let files = parseCodeFiles(currentCode);

  if (files.length === 0) {
    // No code to deploy — nothing to loop on
    yield { type: 'loop_complete', success: true, content: 'No deployable code found in response.' };
    return;
  }

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    yield { type: 'iteration_start', iteration, maxIterations };

    // ── Deploy ─────────────────────────────────────────────────────────────
    const deployLogs: string[] = [];
    const deployResult = await deployToSandbox(sandboxId, files, (line) => {
      deployLogs.push(line);
    });

    // Emit all deploy logs
    for (const log of deployLogs) {
      yield { type: 'deploy_log', content: log };
    }

    yield {
      type: 'deploy_result',
      success: deployResult.success,
      previewUrl: deployResult.previewUrl,
      error: deployResult.error,
    };

    // ── If deploy succeeded, we're done ────────────────────────────────────
    if (deployResult.success) {
      yield {
        type: 'loop_complete',
        success: true,
        iteration,
        maxIterations,
        previewUrl: deployResult.previewUrl,
      };
      return;
    }

    // ── Last iteration — can't fix anymore ─────────────────────────────────
    if (iteration === maxIterations) {
      yield {
        type: 'loop_complete',
        success: false,
        iteration,
        maxIterations,
        error: deployResult.error || 'Deployment failed after maximum attempts.',
      };
      return;
    }

    // ── Feed error back to AI for a fix ────────────────────────────────────
    const errorContext = [
      ...deployLogs.filter((l) => l.includes('⚠') || l.includes('✗') || l.includes('Error')),
      deployResult.error || '',
    ]
      .filter(Boolean)
      .join('\n');

    const fixPrompt = buildFixPrompt(originalMessage, currentCode, errorContext, iteration);

    yield { type: 'fix_start', error: errorContext, iteration, maxIterations };

    // Stream the fix response from the AI
    let fixContent = '';
    const fixRequest: ChatRequest = {
      message: fixPrompt,
      context,
      preferredModel,
    };

    for await (const chunk of processChatStream(fixRequest)) {
      if (chunk.type === 'token') {
        fixContent += chunk.content;
        yield { type: 'token', content: chunk.content };
      }
      // We ignore info/done/error from the inner stream — we handle them at this level
    }

    yield { type: 'fix_done', content: fixContent };

    // Parse the new code for next iteration
    currentCode = fixContent;
    files = parseCodeFiles(currentCode);

    if (files.length === 0) {
      yield {
        type: 'loop_complete',
        success: false,
        iteration,
        maxIterations,
        error: 'AI fix did not produce any deployable code.',
      };
      return;
    }
  }
}
