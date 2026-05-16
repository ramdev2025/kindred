import { processChatStream, ChatRequest } from './modelRouter';
import { deployToSandbox, DeployFile } from './deployPipeline';
import { getSkill, type SkillId } from './skills';

export interface AgenticLoopParams {
  sandboxId: string;
  initialResponse: string;
  originalMessage: string;
  context?: string;
  preferredModel?: string;
  skill?: SkillId;
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
      const pathMatch = firstLine.match(/^(?:\/\/|#)\s*(?:filepath|file|path|filename):\s*(.+)$/i);
      if (pathMatch) filePath = pathMatch[1].trim();
    }
    if (filePath) {
      const lines = rawCode.split('\n');
      const hasPathComment = /^(?:\/\/|#)\s*(?:filepath|file|path|filename):/i.test(lines[0].trim());
      files.push({ path: filePath, content: (hasPathComment ? lines.slice(1).join('\n') : rawCode).trimStart(), language });
    }
  }
  if (files.length === 0) {
    const single = /```(\w+)?\n([\s\S]*?)```/.exec(content);
    if (single) {
      const language = single[1] || 'javascript';
      const extMap: Record<string, string> = { typescript: 'index.ts', ts: 'index.ts', javascript: 'index.js', js: 'index.js', python: 'main.py', py: 'main.py', html: 'index.html', css: 'styles.css', jsx: 'App.jsx', tsx: 'App.tsx' };
      files.push({ path: extMap[language] ?? `main.${language}`, content: single[2], language });
    }
  }
  return files;
}

/**
 * Fallback: if AI returned code without filepath annotations,
 * make a best-guess filename from the content itself.
 */
function inferFilename(content: string): string {
  if (/<html/i.test(content))                        return 'index.html';
  if (/from 'react'|from "react"/i.test(content))   return 'App.tsx';
  if (/import.*from|export default/i.test(content))  return 'index.ts';
  if (/def |import |from |class /m.test(content))    return 'main.py';
  if (/body\s*{|margin:|padding:/i.test(content))    return 'styles.css';
  return 'index.js';
}

export async function* runAgenticLoop(params: AgenticLoopParams): AsyncGenerator<AgenticEvent> {
  const {
    sandboxId, initialResponse, originalMessage,
    context, preferredModel, skill, maxIterations = 3,
  } = params;

  let currentCode = initialResponse;
  let files = parseCodeFiles(currentCode);

  // ── Filepath fallback: AI skipped annotations ─────────────────────────────
  if (files.length === 0) {
    // Try to extract any raw code block and assign a guessed filename
    const rawBlock = /```(?:\w+)?\n([\s\S]*?)```/.exec(currentCode);
    if (rawBlock) {
      const guessedName = inferFilename(rawBlock[1]);
      files = [{ path: guessedName, content: rawBlock[1].trimStart() }];
      yield { type: 'deploy_log', content: `[Deploy] No filepath annotations found — inferred filename: ${guessedName}` };
    } else {
      // No code blocks at all — ask AI to re-emit with annotations
      yield { type: 'deploy_log', content: '[Deploy] No deployable code found — requesting re-emit with filepath annotations…' };
      let retryContent = '';
      const retryRequest: ChatRequest = {
        message: `The previous response did not include any code blocks with filepath annotations.\nPlease re-output the complete implementation.\nEvery code block MUST start with a comment like:\n  // filepath: src/App.tsx\n  or\n  # filepath: main.py\nThis is required for the sandbox deployment system.\n\nOriginal request: ${originalMessage}`,
        context,
        preferredModel,
        skill,
      };
      for await (const chunk of processChatStream(retryRequest)) {
        if (chunk.type === 'token') {
          retryContent += chunk.content;
          yield { type: 'token', content: chunk.content };
        }
      }
      currentCode = retryContent;
      files = parseCodeFiles(currentCode);

      if (files.length === 0) {
        yield { type: 'loop_complete', success: false, error: 'AI did not produce deployable code with filepath annotations after retry.' };
        return;
      }
    }
  }

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    yield { type: 'iteration_start', iteration, maxIterations };

    const deployLogs: string[] = [];
    const deployResult = await deployToSandbox(sandboxId, files, (line) => deployLogs.push(line));

    for (const log of deployLogs) yield { type: 'deploy_log', content: log };
    yield { type: 'deploy_result', success: deployResult.success, previewUrl: deployResult.previewUrl, error: deployResult.error };

    if (deployResult.success) {
      yield { type: 'loop_complete', success: true, iteration, maxIterations, previewUrl: deployResult.previewUrl };
      return;
    }

    if (iteration === maxIterations) {
      yield { type: 'loop_complete', success: false, iteration, maxIterations, error: deployResult.error || 'Deployment failed after maximum attempts.' };
      return;
    }

    // Build the fix prompt using the skill-specific template
    const errorContext = [
      ...deployLogs.filter((l) => l.includes('⚠') || l.includes('✗') || l.includes('Error')),
      deployResult.error || '',
    ].filter(Boolean).join('\n');

    const fixPrompt = getSkill(skill).fixPrompt(originalMessage, currentCode, errorContext, iteration);

    yield { type: 'fix_start', error: errorContext, iteration, maxIterations };

    let fixContent = '';
    const fixRequest: ChatRequest = { message: fixPrompt, context, preferredModel, skill };

    for await (const chunk of processChatStream(fixRequest)) {
      if (chunk.type === 'token') {
        fixContent += chunk.content;
        yield { type: 'token', content: chunk.content };
      }
    }

    yield { type: 'fix_done', content: fixContent };
    currentCode = fixContent;
    files = parseCodeFiles(currentCode);

    if (files.length === 0) {
      yield { type: 'loop_complete', success: false, iteration, maxIterations, error: 'AI fix did not produce any deployable code.' };
      return;
    }
  }
}
