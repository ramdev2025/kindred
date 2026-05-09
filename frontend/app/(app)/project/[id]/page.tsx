"use client";

import { useAuth } from "@clerk/nextjs";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { sendMessage, streamMessage, streamAgenticMessage, createSandbox, uploadFiles, fetchSandboxFiles, readSandboxFile, executeSandboxCommand, fetchPreviewUrl, getChatHistory, getProjectSession, deployFiles, ContextStats } from "@/lib/api";
import PromptBar from "@/components/PromptBar";
import MessageBubble from "@/components/MessageBubble";
import LivePreview from "@/components/LivePreview";
import CodeEditor from "@/components/CodeEditor";
import FileTree from "@/components/FileTree";
import Terminal from "@/components/Terminal";
import TopBar from "@/components/TopBar";
import TokenMeter from "@/components/TokenMeter";
import { useToast } from "@/components/ToastProvider";
import { useKeyboardShortcuts } from "@/components/KeyboardShortcuts";
import {
  Eye,
  Code2,
  Terminal as TermIcon,
  FolderTree,
  Play,
  PanelLeftClose,
  PanelLeftOpen,
  Square,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  attachments?: Array<{ filename: string; mimeType: string }>;
  usedSearch?: boolean;
  searchSources?: Array<{ title: string; url: string }>;
}

import { Suspense } from "react";

type RightTab = "preview" | "code" | "terminal";

export default function ProjectPage() {
  return (
    <Suspense>
      <ProjectWorkspace />
    </Suspense>
  );
}

function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { getToken } = useAuth();
  const toast = useToast();
  const { registerShortcut } = useKeyboardShortcuts();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState("auto");
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [code, setCode] = useState("// Generated code will appear here\n");
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [rightTab, setRightTab] = useState<RightTab>("preview");
  const [showFiles, setShowFiles] = useState(true);
  const [currentModel, setCurrentModel] = useState<string | undefined>();
  const [initialPromptSent, setInitialPromptSent] = useState(false);
  const [sandboxFiles, setSandboxFiles] = useState<Array<{ name: string; type: 'file' | 'dir'; path: string }>>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [contextStats, setContextStats] = useState<ContextStats | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Tracks sandboxId in a ref so async callbacks always get the latest value
  const sandboxIdRef = useRef<string | null>(null);
  // AbortController for cancelling an in-progress agentic loop
  const agenticAbortRef = useRef<AbortController | null>(null);
  const [agenticStatus, setAgenticStatus] = useState<string | null>(null);

  // ── Register Keyboard Shortcuts (Phase 4.5) ──────────────────────────────
  useEffect(() => {
    registerShortcut({
      key: "b",
      meta: true,
      label: "Toggle File Tree",
      description: "Show or hide the file panel",
      category: "Workspace",
      action: () => setShowFiles((prev) => !prev),
    });
    registerShortcut({
      key: "p",
      meta: true,
      shift: true,
      label: "Toggle Preview",
      description: "Switch to preview panel",
      category: "Workspace",
      action: () => setRightTab("preview"),
    });
    registerShortcut({
      key: "j",
      meta: true,
      label: "Toggle Terminal",
      description: "Switch to terminal panel",
      category: "Workspace",
      action: () => setRightTab("terminal"),
    });
    registerShortcut({
      key: "e",
      meta: true,
      label: "Toggle Code Editor",
      description: "Switch to code editor panel",
      category: "Workspace",
      action: () => setRightTab("code"),
    });
  }, [registerShortcut]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Extract all annotated code files from an AI response.
   * Supports:
   *   ```lang:path/to/file  (fenced lang:path shorthand)
   *   ```lang\n// filepath: path/to/file  (comment annotation)
   * Falls back to a single unnamed block if no annotations found.
   */
  function parseCodeFiles(
    content: string,
  ): Array<{ path: string; content: string; language?: string }> {
    const files: Array<{ path: string; content: string; language?: string }> = [];
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
          python: 'main.py',     py: 'main.py',
          html: 'index.html',    css: 'styles.css',
          jsx: 'App.jsx',        tsx: 'App.tsx',
        };
        files.push({ path: extMap[language] ?? `main.${language}`, content: single[2], language });
      }
    }

    return files;
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle initial prompt from dashboard
  useEffect(() => {
    const initialPrompt = searchParams.get("prompt");
    const initialMode = searchParams.get("mode") as "build" | "plan" | null;
    if (initialPrompt && !initialPromptSent) {
      setInitialPromptSent(true);
      handleSend(initialPrompt, undefined, initialMode || "build");
    }
  }, [searchParams, initialPromptSent]);

  // Load chat history on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        const token = await getToken();
        if (!token || !id) return;

        const session = await getProjectSession(token, id);
        if (session) {
          setSessionId(session.id);
          const history = await getChatHistory(token, session.id);
          if (history && history.length > 0) {
            const loadedMessages: Message[] = history.map((msg: any) => ({
              id: msg.id || crypto.randomUUID(),
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
              model: msg.model_used,
            }));
            setMessages(loadedMessages);
          }
        }
      } catch (err) {
        console.error("Failed to load chat history:", err);
      }
    }
    loadHistory();
  }, [id]);

  async function refreshFiles(token: string, sbId: string) {
    try {
      const files = await fetchSandboxFiles(token, sbId, '/home/user');
      setSandboxFiles(files);
    } catch (err) {
      console.error("Failed to fetch files:", err);
    }
  }

  async function handleStartSandbox() {
    try {
      const token = await getToken();
      if (token) {
        toast.info("Starting sandbox...", "Setting up your cloud environment");
        const result = await createSandbox(token, id);
        setSandboxId(result.sandboxId);
        sandboxIdRef.current = result.sandboxId;   // keep ref in sync
        setPreviewUrl(result.url);
        setTerminalOutput((prev) => [...prev, `[System] Sandbox started: ${result.sandboxId}`]);
        await refreshFiles(token, result.sandboxId);
        toast.success("Sandbox ready!", "Your cloud environment is live");
      }
    } catch (err: any) {
      console.error("Failed to create sandbox:", err);
      toast.error("Sandbox failed", err.message || "Could not start the sandbox");
    }
  }

  /**
   * Deploy AI-generated files to the active sandbox via SSE pipeline.
   * Streams install + server-start logs to the terminal, then flips to Preview.
   */
  async function handleDeploy(
    sbId: string,
    files: Array<{ path: string; content: string; language?: string }>,
  ) {
    setTerminalOutput((prev) => [...prev, `[Deploy] Deploying ${files.length} file(s)…`]);
    setRightTab('terminal');

    try {
      const token = await getToken();
      if (!token) return;

      await deployFiles(
        token,
        sbId,
        files,
        // onLog — stream each install / server-start line to terminal
        (line) => setTerminalOutput((prev) => [...prev, line]),
        // onDone — flip to Preview and update URL
        (result) => {
          if (result.previewUrl) {
            setPreviewUrl(result.previewUrl);
            setRightTab('preview');
            setTerminalOutput((prev) => [...prev, `[Deploy] ✓ Live → ${result.previewUrl}`]);
          } else {
            setTerminalOutput((prev) => [...prev, '[Deploy] Done — no preview URL returned']);
          }
          // Refresh file tree after deploy
          refreshFiles(token, sbId);
        },
        // onError
        (error) => setTerminalOutput((prev) => [...prev, `[Deploy] ✗ ${error}`]),
      );
    } catch (err: any) {
      setTerminalOutput((prev) => [...prev, `[Deploy] ✗ ${err.message}`]);
    }
  }

  async function handleTerminalCommand(command: string) {
    if (!sandboxId) return;
    setTerminalOutput((prev) => [...prev, `$ ${command}`]);
    try {
      const token = await getToken();
      if (!token) return;
      const result = await executeSandboxCommand(token, sandboxId, command);
      if (result.stdout) {
        setTerminalOutput((prev) => [...prev, result.stdout]);
      }
      if (result.stderr) {
        setTerminalOutput((prev) => [...prev, `[Error] ${result.stderr}`]);
      }
      // Refresh files after commands that might change the filesystem
      await refreshFiles(token, sandboxId);
    } catch (err: any) {
      setTerminalOutput((prev) => [...prev, `[Error] ${err.message || 'Command failed'}`]);
    }
  }

  async function handleFileSelect(path: string) {
    if (!sandboxId) return;
    try {
      const token = await getToken();
      if (!token) return;
      const content = await readSandboxFile(token, sandboxId, path);
      setCode(content);
      setRightTab("code");
    } catch (err) {
      console.error("Failed to read file:", err);
    }
  }

  async function handleSend(message: string, files?: File[], mode?: "build" | "plan") {
    if (isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      attachments: files?.map(f => ({ filename: f.name, mimeType: f.type })),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setAgenticStatus(null);

    try {
      const token = await getToken();
      if (!token) return;

      // Upload files if present
      let attachmentRefs: Array<{ fileId: string }> | undefined;
      if (files && files.length > 0) {
        const uploaded = await uploadFiles(token, files);
        attachmentRefs = uploaded.map(f => ({ fileId: f.fileId }));
      }

      let finalPrompt = message;
      if (mode === "plan") {
        finalPrompt = `ACT AS A SENIOR SOFTWARE ARCHITECT.
Before writing any code, provide a comprehensive Plan and Architecture Reference in Markdown.
Focus on:
1. Component Hierarchy
2. Data Flow & State Management
3. API Endpoints / Data Schema
4. Security & Performance considerations

Then, proceed with the implementation.

USER REQUEST: ${message}`;
      }

      const assistantId = crypto.randomUUID();
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

      // Closure-captured accumulator — avoids stale-state reads inside callbacks
      const captured = { content: '', currentMsgId: assistantId };

      // ── Use agentic mode when sandbox is active and not in plan mode ──────
      const activeSandbox = sandboxIdRef.current;
      if (activeSandbox && mode !== 'plan') {
        setAgenticStatus('Generating code...');

        const controller = streamAgenticMessage(
          token,
          finalPrompt,
          id,
          activeSandbox,
          selectedModel,
          attachmentRefs,
          3, // maxIterations
          {
            onToken: (chunk) => {
              captured.content += chunk;
              const targetId = captured.currentMsgId;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === targetId ? { ...msg, content: msg.content + chunk } : msg
                )
              );
            },
            onInfo: (info) => {
              setCurrentModel(info.model);
            },
            onAiDone: (data) => {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantId ? { ...msg, model: data.model } : msg
                )
              );
              if (data.contextStats) setContextStats(data.contextStats);
              // Update code editor with first detected file
              const detectedFiles = parseCodeFiles(captured.content);
              if (detectedFiles.length > 0) {
                setCode(detectedFiles[0].content);
              }
              setAgenticStatus('Deploying to sandbox...');
            },
            onIterationStart: (data) => {
              setAgenticStatus(`Deploy attempt ${data.iteration}/${data.maxIterations}...`);
              setRightTab('terminal');
            },
            onDeployLog: (line) => {
              setTerminalOutput((prev) => [...prev, line]);
            },
            onDeployResult: (result) => {
              if (result.success && result.previewUrl) {
                setPreviewUrl(result.previewUrl);
              }
            },
            onFixStart: (data) => {
              setAgenticStatus(`Fixing error (attempt ${data.iteration}/${data.maxIterations})...`);
              setTerminalOutput((prev) => [...prev, `[Agent] Error detected, generating fix...`]);
              // Start a new assistant message for the fix
              const fixId = crypto.randomUUID();
              captured.content = '';
              captured.currentMsgId = fixId;
              setMessages((prev) => [...prev, { id: fixId, role: 'assistant', content: '' }]);
            },
            onFixDone: (content) => {
              const detectedFiles = parseCodeFiles(content);
              if (detectedFiles.length > 0) {
                setCode(detectedFiles[0].content);
              }
              setAgenticStatus('Re-deploying fix...');
            },
            onLoopComplete: (data) => {
              setAgenticStatus(null);
              if (data.success && data.previewUrl) {
                setPreviewUrl(data.previewUrl);
                setRightTab('preview');
                setTerminalOutput((prev) => [...prev, `[Agent] ✓ Deployed successfully → ${data.previewUrl}`]);
              } else if (data.success) {
                setTerminalOutput((prev) => [...prev, '[Agent] ✓ Completed']);
              } else {
                setTerminalOutput((prev) => [...prev, `[Agent] ✗ Failed after ${data.iteration} attempt(s): ${data.error || 'Unknown error'}`]);
              }
              // Refresh file tree
              refreshFiles(token, activeSandbox);
              setIsLoading(false);
              agenticAbortRef.current = null;
            },
            onError: (error) => {
              setAgenticStatus(null);
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantId ? { ...msg, content: msg.content || `Error: ${error}` } : msg
                )
              );
              setIsLoading(false);
              agenticAbortRef.current = null;
            },
          },
        );

        agenticAbortRef.current = controller;
        // Don't setIsLoading(false) here — the callbacks handle it
        return;
      }

      // ── Non-agentic path (no sandbox or plan mode) ─────────────────────────
      await streamMessage(
        token,
        finalPrompt,
        id,
        selectedModel,
        attachmentRefs,
        // onToken
        (chunk) => {
          captured.content += chunk;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId ? { ...msg, content: msg.content + chunk } : msg
            )
          );
        },
        // onInfo
        (info) => {
          setCurrentModel(info.model);
        },
        // onDone
        (data) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId ? { ...msg, model: data.model } : msg
            )
          );
          if (data.contextStats) setContextStats(data.contextStats);

          // Parse code files from the full response
          const detectedFiles = parseCodeFiles(captured.content);

          // Update code editor with first file
          if (detectedFiles.length > 0) {
            setCode(detectedFiles[0].content);
            setRightTab('code');
          }

          // Auto-deploy if sandbox is active and we're in Build mode
          const sb = sandboxIdRef.current;
          if (sb && detectedFiles.length > 0 && mode !== 'plan') {
            handleDeploy(sb, detectedFiles);
          }
        },
        // onError
        (error) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId ? { ...msg, content: `Error: ${error}` } : msg
            )
          );
        }
      );
    } catch (err) {
      console.error("Send error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
      setAgenticStatus(null);
    }
  }

  const rightTabs: { id: RightTab; icon: typeof Eye; label: string }[] = [
    { id: "preview", icon: Eye, label: "Preview" },
    { id: "code", icon: Code2, label: "Code" },
    { id: "terminal", icon: TermIcon, label: "Terminal" },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <TopBar sandboxActive={!!sandboxId} currentModel={currentModel} />

      <div className="flex-1 flex overflow-hidden workspace-panels">
        {/* Left panel - Chat */}
        <div className="w-[420px] flex flex-col border-r border-[var(--border)] shrink-0 chat-panel">
          {/* Model selector */}
          <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="text-xs bg-[var(--muted)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-zinc-300 focus:outline-none focus:border-indigo-500"
              >
                <option value="auto">Auto Route</option>
                <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                <option value="gpt-5.4">GPT-5.4</option>
                <option value="hermes">Hermes (Deep)</option>
              </select>
              <TokenMeter contextStats={contextStats} />
            </div>
            {!sandboxId && (
              <button
                onClick={handleStartSandbox}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded-md transition"
              >
                <Play className="w-3 h-3" />
                Start Sandbox
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
            {messages.length === 0 && (
              <div className="text-center py-20">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-500/10 mb-4">
                  <Code2 className="w-6 h-6 text-indigo-400" />
                </div>
                <p className="text-sm text-[var(--muted-foreground)]">
                  Describe what you want to build.
                </p>
                <p className="text-xs text-zinc-600 mt-1">
                  The AI will generate and execute code for you.
                </p>
              </div>
            )}
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                role={msg.role}
                content={msg.content}
                model={msg.model}
                attachments={msg.attachments}
                usedSearch={msg.usedSearch}
                searchSources={msg.searchSources}
              />
            ))}
            {isLoading && (
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <div className="w-3 h-3 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                </div>
                <div className="flex items-center gap-2">
                  {agenticStatus ? (
                    <span className="text-xs text-emerald-400 font-medium">{agenticStatus}</span>
                  ) : (
                    <div className="flex gap-1.5">
                      <span className="typing-dot w-2 h-2 bg-zinc-500 rounded-full" />
                      <span className="typing-dot w-2 h-2 bg-zinc-500 rounded-full" />
                      <span className="typing-dot w-2 h-2 bg-zinc-500 rounded-full" />
                    </div>
                  )}
                  {agenticAbortRef.current && (
                    <button
                      onClick={() => {
                        agenticAbortRef.current?.abort();
                        agenticAbortRef.current = null;
                        setIsLoading(false);
                        setAgenticStatus(null);
                        setTerminalOutput((prev) => [...prev, '[Agent] Aborted by user']);
                      }}
                      className="ml-2 flex items-center gap-1 text-xs px-2 py-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-md transition"
                      title="Stop agentic loop"
                    >
                      <Square className="w-3 h-3" />
                      Stop
                    </button>
                  )}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Prompt */}
          <div className="p-3 border-t border-[var(--border)] shrink-0">
            <PromptBar
              onSend={handleSend}
              isLoading={isLoading}
              placeholder="Ask me to build something..."
            />
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col overflow-hidden right-panel">
          {/* Tabs */}
          <div className="px-4 py-2 border-b border-[var(--border)] flex items-center gap-1 shrink-0">
            <button
              onClick={() => setShowFiles(!showFiles)}
              className="p-1.5 rounded-md hover:bg-[var(--muted)] text-[var(--muted-foreground)] mr-2"
              title={showFiles ? "Hide files" : "Show files"}
            >
              {showFiles ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </button>
            {rightTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setRightTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition ${
                  rightTab === tab.id
                    ? "bg-[var(--muted)] text-white"
                    : "text-[var(--muted-foreground)] hover:text-white"
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 flex overflow-hidden">
            {showFiles && (
              <div className="w-[200px] border-r border-[var(--border)] overflow-y-auto shrink-0 file-panel">
                <div className="px-3 py-2 border-b border-[var(--border)]">
                  <div className="flex items-center gap-1.5">
                    <FolderTree className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                    <span className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-medium">
                      Files
                    </span>
                  </div>
                </div>
                <FileTree files={sandboxFiles} onFileSelect={handleFileSelect} />
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              {rightTab === "preview" && <LivePreview url={previewUrl} sandboxId={sandboxId} />}
              {rightTab === "code" && <CodeEditor code={code} onChange={setCode} />}
              {rightTab === "terminal" && <Terminal output={terminalOutput} onCommand={handleTerminalCommand} isConnected={!!sandboxId} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
