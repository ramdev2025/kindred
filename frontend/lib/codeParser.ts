export interface ParsedFile {
  path: string;
  content: string;
  language: string;
}

/**
 * Parse AI response for code blocks with file paths.
 * Supports patterns like:
 *   ```tsx // src/App.tsx
 *   ```typescript filename="src/index.ts"
 *   ```js
 *   // File: src/utils.js
 */
export function parseCodeBlocks(response: string): ParsedFile[] {
  const files: ParsedFile[] = [];
  
  // Match code blocks with optional language and filename hints
  const codeBlockRegex = /```(\w+)?(?:\s+(?:\/\/\s*)?(?:filename=["']?)?([^\n"']+?)["']?)?\n([\s\S]*?)```/g;
  
  let match;
  let index = 0;
  
  while ((match = codeBlockRegex.exec(response)) !== null) {
    const language = match[1] || 'text';
    let filePath = match[2]?.trim() || '';
    const content = match[3].trim();
    
    // Try to extract filename from first line comment if not in header
    if (!filePath && content) {
      const firstLineMatch = content.match(/^(?:\/\/|#|\/\*)\s*(?:File:|filename:)?\s*(.+?)(?:\s*\*\/)?$/m);
      if (firstLineMatch) {
        filePath = firstLineMatch[1].trim();
      }
    }
    
    // Generate a default path if none found
    if (!filePath) {
      const ext = getExtension(language);
      filePath = index === 0 ? `main${ext}` : `file${index}${ext}`;
    }
    
    // Clean up the path
    filePath = filePath.replace(/^["']|["']$/g, '').trim();
    
    files.push({ path: filePath, content, language });
    index++;
  }
  
  return files;
}

/**
 * Check if any parsed files contain a package.json (meaning deps need install)
 */
export function needsDependencyInstall(files: ParsedFile[]): boolean {
  return files.some(f => f.path.includes('package.json'));
}

/**
 * Detect the likely dev server command based on files
 */
export function detectStartCommand(files: ParsedFile[]): string | null {
  const hasPackageJson = files.some(f => f.path.includes('package.json'));
  const hasRequirements = files.some(f => f.path.includes('requirements.txt'));
  
  if (hasPackageJson) {
    // Check if it has a start script
    const pkg = files.find(f => f.path.includes('package.json'));
    if (pkg) {
      try {
        const parsed = JSON.parse(pkg.content);
        if (parsed.scripts?.dev) return 'npm run dev';
        if (parsed.scripts?.start) return 'npm start';
      } catch {}
    }
    return 'npm start';
  }
  
  if (hasRequirements) {
    const mainPy = files.find(f => f.path.endsWith('.py'));
    if (mainPy) return `python ${mainPy.path}`;
  }
  
  return null;
}

function getExtension(language: string): string {
  const map: Record<string, string> = {
    typescript: '.ts',
    tsx: '.tsx',
    javascript: '.js',
    jsx: '.jsx',
    python: '.py',
    html: '.html',
    css: '.css',
    json: '.json',
    yaml: '.yml',
    sql: '.sql',
    bash: '.sh',
    shell: '.sh',
    text: '.txt',
  };
  return map[language] || `.${language}`;
}
