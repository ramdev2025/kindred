import * as e2bService from './e2b';

export interface DeployFile {
  path: string;
  content: string;
  language?: string;
}

export interface DeployResult {
  success: boolean;
  previewUrl?: string | null;
  filesWritten: number;
  error?: string;
}

export type DeployLogCallback = (line: string) => void;

const BASE_DIR = '/home/user';
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30_000;

/**
 * Full AI → Sandbox pipeline:
 *   1. Write all files to BASE_DIR
 *   2. Detect package manager & install deps
 *   3. Start dev server in background
 *   4. Poll for the port to open
 *   5. Return the live preview URL
 */
export async function deployToSandbox(
  sandboxId: string,
  files: DeployFile[],
  onLog: DeployLogCallback,
): Promise<DeployResult> {
  if (!files.length) {
    return { success: false, filesWritten: 0, error: 'No files provided' };
  }

  try {
    // ── 1. Write files ───────────────────────────────────────────────────────
    onLog(`[Deploy] Writing ${files.length} file(s)…`);
    for (const file of files) {
      // Normalize path: strip leading slash so we always prefix BASE_DIR once
      const relativePath = file.path.replace(/^\/+/, '');
      const fullPath = `${BASE_DIR}/${relativePath}`;
      await e2bService.writeFile(sandboxId, fullPath, file.content);
      onLog(`[Deploy] ✓ wrote ${relativePath}`);
    }

    // ── 2. Detect project type ───────────────────────────────────────────────
    const pkgFile = files.find(
      (f) => f.path === 'package.json' || f.path.endsWith('/package.json'),
    );
    const reqFile = files.find(
      (f) => f.path === 'requirements.txt' || f.path.endsWith('/requirements.txt'),
    );
    const pyprojectFile = files.find((f) => f.path.endsWith('pyproject.toml'));

    let installCmd: string | null = null;
    let startCmd: string | null = null;
    let port = 3000;

    if (pkgFile) {
      installCmd = 'npm install --prefer-offline 2>&1 | tail -5';
      port = 3000;

      try {
        const pkg = JSON.parse(pkgFile.content);
        const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

        if (deps.vite || deps['@vitejs/plugin-react']) {
          port = 5173;
          startCmd = pkg.scripts?.dev ? 'npm run dev -- --host 0.0.0.0' : 'npx vite --host 0.0.0.0';
        } else if (deps.next) {
          port = 3000;
          startCmd = 'npm run dev';
        } else {
          startCmd = pkg.scripts?.dev
            ? 'npm run dev'
            : pkg.scripts?.start
            ? 'npm start'
            : 'node index.js';
        }
      } catch {
        startCmd = 'npm start';
      }
    } else if (reqFile || pyprojectFile) {
      const baseInstall = `cd ${BASE_DIR} && pip install -q`;
      installCmd = reqFile
        ? `${baseInstall} -r requirements.txt 2>&1 | tail -5`
        : `${baseInstall} . 2>&1 | tail -5`;

      port = 8000;
      const mainPy = files.find(
        (f) => f.path === 'main.py' || f.path === 'app.py' || f.path.endsWith('/main.py'),
      );
      if (mainPy) {
        const fileName = mainPy.path.replace(/^\/+/, '');
        startCmd = `python ${BASE_DIR}/${fileName}`;
      } else {
        startCmd = 'uvicorn main:app --host 0.0.0.0 --port 8000';
      }
    }

    // ── 3. Install dependencies ──────────────────────────────────────────────
    if (installCmd) {
      onLog(`[Deploy] Installing dependencies…`);
      const installResult = await e2bService.runCommand(
        sandboxId,
        `cd ${BASE_DIR} && ${installCmd}`,
      );
      if (installResult.stdout?.trim()) {
        installResult.stdout
          .split('\n')
          .slice(-6)
          .forEach((line) => line.trim() && onLog(line));
      }
      if (installResult.exitCode !== 0 && installResult.stderr?.trim()) {
        onLog(`[Deploy] ⚠ install warning: ${installResult.stderr.slice(0, 300)}`);
      } else {
        onLog(`[Deploy] ✓ Dependencies installed`);
      }
    }

    // ── 4. Start dev server ──────────────────────────────────────────────────
    if (startCmd) {
      onLog(`[Deploy] Starting server on port ${port}: ${startCmd}`);

      // Fire-and-forget — don't await so we can poll below
      e2bService
        .runCommand(
          sandboxId,
          `cd ${BASE_DIR} && nohup ${startCmd} > /tmp/dev-server.log 2>&1 &`,
        )
        .catch(() => {});

      // ── 5. Poll for port ─────────────────────────────────────────────────
      onLog(`[Deploy] Waiting for server on port ${port}…`);
      const previewUrl = await pollForPort(sandboxId, port);

      if (previewUrl) {
        onLog(`[Deploy] ✓ Live at ${previewUrl}`);
        return { success: true, previewUrl, filesWritten: files.length };
      }

      // Server may still be starting — hand back the E2B URL anyway
      const fallbackUrl = e2bService.getPreviewUrl(sandboxId, port);
      onLog(
        `[Deploy] Server still starting — preview URL ready: ${fallbackUrl ?? 'unknown'}`,
      );
      return { success: true, previewUrl: fallbackUrl, filesWritten: files.length };
    }

    return { success: true, filesWritten: files.length };
  } catch (err: any) {
    onLog(`[Deploy] ✗ Error: ${err.message}`);
    return { success: false, filesWritten: 0, error: err.message };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function pollForPort(
  sandboxId: string,
  port: number,
): Promise<string | null> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    try {
      const { stdout } = await e2bService.runCommand(
        sandboxId,
        `curl -s -o /dev/null -w "%{http_code}" http://localhost:${port}/ 2>/dev/null || echo ERR`,
      );
      const code = stdout?.trim();
      if (code && code !== 'ERR' && code !== '000' && code !== '') {
        return e2bService.getPreviewUrl(sandboxId, port);
      }
    } catch {
      /* keep polling */
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
