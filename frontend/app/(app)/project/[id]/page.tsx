"use client";

import { useAuth } from "@clerk/nextjs";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import { streamMessage, streamAgenticMessage, createSandbox, connectSandbox, getProject, uploadFiles, fetchSandboxFiles, readSandboxFile, writeSandboxFile, executeSandboxCommand, getChatHistory, getProjectSession, deployFiles, ContextStats } from "@/lib/api";
import PromptBar from "@/components/PromptBar";
import MessageBubble from "@/components/MessageBubble";
import AgentBubble, { AgentStep, AgentBubbleStatus } from "@/components/AgentBubble";
import ResearchBubble from "@/components/ResearchBubble";
import SkillSelector, { type SkillId } from "@/components/SkillSelector";
import LivePreview from "@/components/LivePreview";
import CodeEditor from "@/components/CodeEditor";
import FileTree from "@/components/FileTree";
import Terminal from "@/components/Terminal";
import TopBar from "@/components/TopBar";
import TokenMeter from "@/components/TokenMeter";
import { useResearchStream } from "@/hooks/useResearchStream";
import { useToast } from "@/components/ToastProvider";
import { useKeyboardShortcuts } from "@/components/KeyboardShortcuts";
import {
  Eye, Code2, Terminal as TermIcon, FolderTree, Play,
  PanelLeftClose, PanelLeftOpen, Search,
} from "lucide-react";
import { Suspense } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  attachments?: Array<{ filename: string; mimeType: string }>;
  usedSearch?: boolean;
  searchSources?: Array<{ title: string; url: string }>;
  // Agentic process steps attached to this message
  agentSteps?: AgentStep[];
  agentStatus?: AgentBubbleStatus;
}

type RightTab = "preview" | "code" | "terminal";

function makeStep(type: AgentStep["type"], content: string): AgentStep {
  return { id: crypto.randomUUID(), type, content, timestamp: Date.now() };
}

// ── Page wrapper ──────────────────────────────────────────────────────────────

export default function ProjectPage() {
  return <Suspense><ProjectWorkspace /></Suspense>;
}

// ── Workspace ─────────────────────────────────────────────────────────────────

function ProjectWorkspace() {
  const { id }          = useParams<{ id: string }>();
  const searchParams    = useSearchParams();
  const { getToken }    = useAuth();
  const toast           = useToast();
  const { registerShortcut } = useKeyboardShortcuts();

  const [messages, setMessages]           = useState<Message[]>([]);
  const [isLoading, setIsLoading]         = useState(false);
  const [selectedModel, setSelectedModel] = useState("auto");
  const [skill, setSkill]                 = useState<SkillId>("engineer");
  const [sandboxId, setSandboxId]         = useState<string | null>(null);
  const [previewUrl, setPreviewUrl]       = useState<string | null>(null);
  const [code, setCode]                   = useState("// Generated code will appear here\n");
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [rightTab, setRightTab]           = useState<RightTab>("preview");
  const [showFiles, setShowFiles]         = useState(true);
  const [currentModel, setCurrentModel]   = useState<string | undefined>();
  const [initialPromptSent, setInitialPromptSent] = useState(false);
  const [sandboxFiles, setSandboxFiles]   = useState<Array<{ name: string; type: "file" | "dir"; path: string }>>([]);
  const [contextStats, setContextStats]   = useState<ContextStats | null>(null);

  // Auth token shared with research hook
  const [authToken, setAuthToken] = useState<string | null>(null);
  useEffect(() => { getToken().then(setAuthToken); }, []);

  // Deep Research — inline bubble
  const research = useResearchStream(authToken);
  const [researchQuery, setResearchQuery] = useState("");

  const messagesEndRef  = useRef<HTMLDivElement>(null);
  const sandboxIdRef    = useRef<string | null>(null);
  const agenticAbortRef = useRef<AbortController | null>(null);

  // ── Agent step helpers ────────────────────────────────────────────────────

  const pushStep = useCallback((msgId: string, step: AgentStep) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? { ...m, agentSteps: [...(m.agentSteps ?? []), step] }
          : m
      )
    );
  }, []);

  const setAgentStatus = useCallback((msgId: string, status: AgentBubbleStatus) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, agentStatus: status } : m))
    );
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    registerShortcut({ key: "b", meta: true, label: "Toggle File Tree", description: "Show or hide the file panel", category: "Workspace", action: () => setShowFiles((p) => !p) });
    registerShortcut({ key: "p", meta: true, shift: true, label: "Toggle Preview", description: "Switch to preview panel", category: "Workspace", action: () => setRightTab("preview") });
    registerShortcut({ key: "j", meta: true, label: "Toggle Terminal", description: "Switch to terminal panel", category: "Workspace", action: () => setRightTab("terminal") });
    registerShortcut({ key: "e", meta: true, label: "Toggle Code Editor", description: "Switch to code editor panel", category: "Workspace", action: () => setRightTab("code") });
    registerShortcut({ key: "r", meta: true, label: "Toggle Research Agent", description: "Switch between Research Agent and Auto Route", category: "Workspace", action: () => setSelectedModel((m) => m === "research" ? "auto" : "research") });
  }, [registerShortcut]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function buildProjectContext(): string {
    const last = [...messages].reverse().find((m) => m.role === "assistant" && m.content);
    if (!last) return "";
    return `Developer is working on project ID: ${id}.\n\nLatest AI response (truncated):\n${last.content.slice(0, 1200)}`;
  }

  function parseCodeFiles(content: string): Array<{ path: string; content: string; language?: string }> {
    const files: Array<{ path: string; content: string; language?: string }> = [];
    const blockRe = /```(\w+)?(?::([^\n]+))?\n([\s\S]*?)```/g;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(content)) !== null) {
      const lang = m[1] || "text";
      let fp: string | null = m[2]?.trim() ?? null;
      const raw = m[3];
      if (!fp) { const pm = raw.split("\n")[0].trim().match(/^\/\/\s*(?:filepath|file|path|filename):\s*(.+)$/i); if (pm) fp = pm[1].trim(); }
      if (fp) { const lines = raw.split("\n"); const hasPC = /^\/\/\s*(?:filepath|file|path|filename):/i.test(lines[0].trim()); files.push({ path: fp, content: (hasPC ? lines.slice(1).join("\n") : raw).trimStart(), language: lang }); }
    }
    if (!files.length) {
      const s = /```(\w+)?\n([\s\S]*?)```/.exec(content);
      if (s) { const lang = s[1] || "javascript"; const ext: Record<string, string> = { typescript: "index.ts", ts: "index.ts", javascript: "index.js", js: "index.js", python: "main.py", py: "main.py", html: "index.html", css: "styles.css", jsx: "App.jsx", tsx: "App.tsx" }; files.push({ path: ext[lang] ?? `main.${lang}`, content: s[2], language: lang }); }
    }
    return files;
  }

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, research.answer]);

  useEffect(() => {
    const p = searchParams.get("prompt");
    const mode = searchParams.get("mode") as "build" | "plan" | null;
    if (p && !initialPromptSent) { setInitialPromptSent(true); handleSend(p, undefined, mode || "build"); }
  }, [searchParams, initialPromptSent]);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (!token || !id) return;
        const session = await getProjectSession(token, id);
        if (session) {
          const history = await getChatHistory(token, session.id);
          if (history?.length) setMessages(history.map((h: any) => ({ id: h.id || crypto.randomUUID(), role: h.role as "user" | "assistant", content: h.content, model: h.model_used })));
        }
      } catch (e) { console.error("Failed to load history", e); }
    })();
  }, [id]);

  async function refreshFiles(token: string, sbId: string) {
    try { setSandboxFiles(await fetchSandboxFiles(token, sbId, "/home/user")); } catch { /* silent */ }
  }

  // ── Restore sandbox on page load ────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (!token || !id) return;
        const project = await getProject(token, id);
        if (!project.e2b_sandbox_id) return;

        toast.info("Reconnecting sandbox…", "Restoring your previous environment");
        const result = await connectSandbox(token, project.e2b_sandbox_id, id);
        setSandboxId(result.sandboxId);
        sandboxIdRef.current = result.sandboxId;
        if (result.previewUrl) setPreviewUrl(result.previewUrl);
        await refreshFiles(token, result.sandboxId);
        toast.success("Sandbox restored", "Back to where you left off");
      } catch (err: any) {
        // Sandbox expired — silently clear the stored ID, user can start fresh
        console.warn("[Sandbox] Could not restore:", err.message);
      }
    })();
  }, [id]);

  async function handleStartSandbox() {
    try {
      const token = await getToken();
      if (!token) return;
      toast.info("Starting sandbox…", "Setting up your cloud environment");
      const result = await createSandbox(token, id);
      setSandboxId(result.sandboxId);
      sandboxIdRef.current = result.sandboxId;
      // Note: previewUrl is NOT set here — only set after first successful deploy
      setTerminalOutput((p) => [...p, `[System] Sandbox started: ${result.sandboxId}`]);
      await refreshFiles(token, result.sandboxId);
      toast.success("Sandbox ready!", "Your cloud environment is live");
    } catch (err: any) { toast.error("Sandbox failed", err.message); }
  }

  async function handleDeploy(sbId: string, files: Array<{ path: string; content: string; language?: string }>) {
    setTerminalOutput((p) => [...p, `[Deploy] Deploying ${files.length} file(s)…`]);
    setRightTab("terminal");
    try {
      const token = await getToken();
      if (!token) return;
      await deployFiles(token, sbId, files,
        (line) => setTerminalOutput((p) => [...p, line]),
        (result) => { if (result.previewUrl) { setPreviewUrl(result.previewUrl); setRightTab("preview"); setTerminalOutput((p) => [...p, `[Deploy] ✓ Live → ${result.previewUrl}`]); } refreshFiles(token, sbId); },
        (error) => setTerminalOutput((p) => [...p, `[Deploy] ✗ ${error}`]),
        id,
      );
    } catch (err: any) { setTerminalOutput((p) => [...p, `[Deploy] ✗ ${err.message}`]); }
  }

  async function handleTerminalCommand(command: string) {
    if (!sandboxId) return;
    setTerminalOutput((p) => [...p, `$ ${command}`]);
    try {
      const token = await getToken();
      if (!token) return;
      const r = await executeSandboxCommand(token, sandboxId, command);
      if (r.stdout) setTerminalOutput((p) => [...p, r.stdout]);
      if (r.stderr) setTerminalOutput((p) => [...p, `[Error] ${r.stderr}`]);
      await refreshFiles(token, sandboxId);
    } catch (err: any) { setTerminalOutput((p) => [...p, `[Error] ${err.message}`]); }
  }

  async function handleFileSelect(path: string) {
    if (!sandboxId) return;
    try { const token = await getToken(); if (!token) return; setCode(await readSandboxFile(token, sandboxId, path)); setRightTab("code"); } catch { /* silent */ }
  }

  // ── Main send handler ─────────────────────────────────────────────────────

  async function handleSend(message: string, files?: File[], mode?: "build" | "plan") {
    if (isLoading) return;

    // ── Auto-create sandbox if user hasn't started one yet ────────────────
    if (!sandboxIdRef.current && selectedModel !== "research") {
      try {
        const token = await getToken();
        if (token) {
          toast.info("Starting sandbox…", "Auto-creating your cloud environment");
          const result = await createSandbox(token, id);
          setSandboxId(result.sandboxId);
          sandboxIdRef.current = result.sandboxId;
          setTerminalOutput((p) => [...p, `[System] Sandbox auto-started: ${result.sandboxId}`]);
          await refreshFiles(token, result.sandboxId);
        }
      } catch (err: any) {
        console.warn("[Sandbox] Auto-create failed:", err.message);
        // Continue without sandbox — user will see code in editor
      }
    }

    // ── Research Agent ──────────────────────────────────────────────────────
    if (selectedModel === "research") {
      setMessages((p) => [...p, { id: crypto.randomUUID(), role: "user", content: message }]);
      setResearchQuery(message);
      research.reset();
      await research.startResearch(message, buildProjectContext() || undefined);
      return;
    }

    // ── Normal / agentic path ───────────────────────────────────────────────
    setMessages((p) => [...p, {
      id: crypto.randomUUID(), role: "user", content: message,
      attachments: files?.map((f) => ({ filename: f.name, mimeType: f.type })),
    }]);
    setIsLoading(true);

    try {
      const token = await getToken();
      if (!token) return;

      let attachmentRefs: Array<{ fileId: string }> | undefined;
      if (files?.length) { const up = await uploadFiles(token, files); attachmentRefs = up.map((f: any) => ({ fileId: f.fileId })); }

      const isPlan = mode === "plan";
      let finalPrompt = message;
      if (isPlan) finalPrompt = `ACT AS A SENIOR SOFTWARE ARCHITECT.\nBefore writing any code, provide a comprehensive Plan and Architecture Reference in Markdown.\nFocus on:\n1. Component Hierarchy\n2. Data Flow & State Management\n3. API Endpoints / Data Schema\n4. Security & Performance considerations\n\nThen, proceed with the implementation.\n\nUSER REQUEST: ${message}`;

      // Create the assistant message with initial agent state
      const assistantId = crypto.randomUUID();
      const initialStatus: AgentBubbleStatus = isPlan ? "planning" : "thinking";
      setMessages((p) => [...p, {
        id: assistantId, role: "assistant", content: "",
        agentSteps: [makeStep(isPlan ? "planning" : "thinking", isPlan ? "Analysing architecture requirements…" : "Reading your request…")],
        agentStatus: initialStatus,
      }]);

      const captured = { content: "", currentMsgId: assistantId, firstToken: true };

      // ── Agentic loop (sandbox active, non-plan) ─────────────────────────
      const activeSandbox = sandboxIdRef.current;
      if (activeSandbox && !isPlan) {
        const controller = streamAgenticMessage(
          token, finalPrompt, id, activeSandbox, selectedModel, attachmentRefs, 3,
          {
            onToken: (chunk) => {
              captured.content += chunk;
              const tid = captured.currentMsgId;
              // First token → transition to "generating"
              if (captured.firstToken) {
                captured.firstToken = false;
                pushStep(tid, makeStep("generating", "Writing code…"));
                setAgentStatus(tid, "generating");
              }
              setMessages((p) => p.map((m) => m.id === tid ? { ...m, content: m.content + chunk } : m));
            },
            onInfo: (info) => setCurrentModel(info.model),
            onAiDone: (data) => {
              setMessages((p) => p.map((m) => m.id === assistantId ? { ...m, model: data.model } : m));
              if (data.contextStats) setContextStats(data.contextStats);
              const df = parseCodeFiles(captured.content);
              if (df.length) setCode(df[0].content);
              pushStep(assistantId, makeStep("deploying", `Deploying ${parseCodeFiles(captured.content).length || "generated"} file(s) to sandbox…`));
              setAgentStatus(assistantId, "deploying");
            },
            onIterationStart: (data) => {
              pushStep(assistantId, makeStep("deploying", `Deploy attempt ${data.iteration}/${data.maxIterations}…`));
              setAgentStatus(assistantId, "deploying");
              setRightTab("terminal");
            },
            onDeployLog: (line) => setTerminalOutput((p) => [...p, line]),
            onDeployResult: (result) => { if (result.success && result.previewUrl) setPreviewUrl(result.previewUrl); },
            onFixStart: (data) => {
              pushStep(assistantId, makeStep("fixing", `Error detected — generating fix (attempt ${data.iteration}/${data.maxIterations})…`));
              setAgentStatus(assistantId, "fixing");
              setTerminalOutput((p) => [...p, "[Agent] Error detected, generating fix…"]);
              // New message for the fix response
              const fixId = crypto.randomUUID();
              captured.content = "";
              captured.currentMsgId = fixId;
              captured.firstToken = true;
              setMessages((p) => [...p, { id: fixId, role: "assistant", content: "" }]);
            },
            onFixDone: (content) => { const df = parseCodeFiles(content); if (df.length) setCode(df[0].content); },
            onLoopComplete: (data) => {
              if (data.success) {
                pushStep(assistantId, makeStep("success", data.previewUrl ? `✓ Live at ${data.previewUrl}` : "✓ Completed successfully"));
                setAgentStatus(assistantId, "complete");
                if (data.previewUrl) { setPreviewUrl(data.previewUrl); setRightTab("preview"); }
                setTerminalOutput((p) => [...p, data.previewUrl ? `[Agent] ✓ Deployed → ${data.previewUrl}` : "[Agent] ✓ Completed"]);
              } else {
                pushStep(assistantId, makeStep("error", `Failed after ${data.iteration} attempt(s): ${data.error || "Unknown error"}`));
                setAgentStatus(assistantId, "error");
                setTerminalOutput((p) => [...p, `[Agent] ✗ Failed: ${data.error || "Unknown error"}`]);
              }
              refreshFiles(token, activeSandbox);
              setIsLoading(false);
              agenticAbortRef.current = null;
            },
            onError: (error) => {
              pushStep(assistantId, makeStep("error", error));
              setAgentStatus(assistantId, "error");
              setMessages((p) => p.map((m) => m.id === assistantId ? { ...m, content: m.content || `Error: ${error}` } : m));
              setIsLoading(false);
              agenticAbortRef.current = null;
            },
          },
          skill,
        );
        agenticAbortRef.current = controller;
        return; // callbacks handle setIsLoading(false)
      }

      // ── Non-agentic (plan mode or no sandbox) ───────────────────────────
      await streamMessage(
        token, finalPrompt, id, selectedModel, attachmentRefs,
        (chunk) => {
          captured.content += chunk;
          if (captured.firstToken) {
            captured.firstToken = false;
            pushStep(assistantId, makeStep(isPlan ? "planning" : "generating", isPlan ? "Writing architecture plan…" : "Generating response…"));
            setAgentStatus(assistantId, isPlan ? "planning" : "generating");
          }
          setMessages((p) => p.map((m) => m.id === assistantId ? { ...m, content: m.content + chunk } : m));
        },
        (info) => setCurrentModel(info.model),
        (data) => {
          setMessages((p) => p.map((m) => m.id === assistantId ? { ...m, model: data.model } : m));
          if (data.contextStats) setContextStats(data.contextStats);
          const df = parseCodeFiles(captured.content);
          if (df.length) {
            setCode(df[0].content);
            setRightTab("code");
            pushStep(assistantId, makeStep("success", `Generated ${df.length} file${df.length > 1 ? "s" : ""}`));
          } else {
            pushStep(assistantId, makeStep("success", "Response complete"));
          }
          setAgentStatus(assistantId, "complete");
          const sb = sandboxIdRef.current;
          if (sb && df.length && !isPlan) handleDeploy(sb, df);
        },
        (error) => {
          pushStep(assistantId, makeStep("error", error));
          setAgentStatus(assistantId, "error");
          setMessages((p) => p.map((m) => m.id === assistantId ? { ...m, content: `Error: ${error}` } : m));
        },
        skill,
      );
    } catch (err) {
      console.error("Send error:", err);
      setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", content: "Something went wrong. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  }

  const rightTabs: { id: RightTab; icon: typeof Eye; label: string }[] = [
    { id: "preview", icon: Eye,       label: "Preview" },
    { id: "code",    icon: Code2,     label: "Code"    },
    { id: "terminal",icon: TermIcon,  label: "Terminal"},
  ];

  const isAgentRunning = research.status === "streaming" || research.status === "starting";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <TopBar sandboxActive={!!sandboxId} currentModel={currentModel} />

      <div className="flex-1 flex overflow-hidden workspace-panels">

        {/* ── Left panel — Chat ────────────────────────────────────────── */}
        <div className="w-[420px] flex flex-col border-r border-[var(--border)] shrink-0 chat-panel">

          {/* Model + skill bar */}
          <div className="px-4 pt-2.5 pb-0 border-b border-[var(--border)] shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="text-xs bg-[var(--muted)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-zinc-300 focus:outline-none focus:border-indigo-500"
                >
                  <option value="auto">Auto Route</option>
                  <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                  <option value="research">🔍 Research Agent</option>
                </select>
                <TokenMeter contextStats={contextStats} />
              </div>
              {!sandboxId && (
                <button
                  onClick={handleStartSandbox}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded-md transition"
                >
                  <Play className="w-3 h-3" /> Start Sandbox
                </button>
              )}
            </div>
            {/* Skill selector — only shown for non-research models */}
            {selectedModel !== "research" && (
              <div className="pb-2">
                <SkillSelector value={skill} onChange={setSkill} />
              </div>
            )}
          </div>

          {/* Message thread */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && research.status === "idle" && (
              <div className="text-center py-20">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-500/10 mb-4">
                  <Code2 className="w-6 h-6 text-indigo-400" />
                </div>
                <p className="text-sm text-[var(--muted-foreground)]">Describe what you want to build.</p>
                <p className="text-xs text-zinc-600 mt-1">The AI will generate and deploy code for you.</p>
                {selectedModel === "research" && (
                  <p className="text-xs text-indigo-400 mt-3 border border-indigo-500/20 bg-indigo-500/8 rounded-lg px-3 py-2">
                    Research Agent active — ask a technical question and it will search the web.
                  </p>
                )}
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className="space-y-2">
                {/* Agent process bubble — shown above assistant messages that have steps */}
                {msg.role === "assistant" && msg.agentSteps && msg.agentSteps.length > 0 && (
                  <AgentBubble
                    steps={msg.agentSteps}
                    status={msg.agentStatus ?? "complete"}
                    onAbort={
                      msg.agentStatus !== "complete" && msg.agentStatus !== "error" && agenticAbortRef.current
                        ? () => {
                            agenticAbortRef.current?.abort();
                            agenticAbortRef.current = null;
                            setIsLoading(false);
                            setAgentStatus(msg.id, "error");
                            pushStep(msg.id, makeStep("error", "Aborted by user"));
                            setTerminalOutput((p) => [...p, "[Agent] Aborted by user"]);
                          }
                        : undefined
                    }
                  />
                )}

                {/* Message content — only render when there is content */}
                {(msg.role === "user" || msg.content) && (
                  <MessageBubble
                    role={msg.role}
                    content={msg.content}
                    model={msg.model}
                    attachments={msg.attachments}
                    usedSearch={msg.usedSearch}
                    searchSources={msg.searchSources}
                  />
                )}
              </div>
            ))}

            {/* Research bubble — inline in the thread */}
            {research.status !== "idle" && researchQuery && (
              <ResearchBubble
                query={researchQuery}
                events={research.events}
                answer={research.answer}
                status={research.status}
                pendingQuestion={research.pendingQuestion}
                onAnswer={research.sendAnswer}
              />
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Prompt bar */}
          <div className="p-3 border-t border-[var(--border)] shrink-0">
            <PromptBar
              onSend={handleSend}
              isLoading={isLoading || isAgentRunning}
              placeholder={selectedModel === "research" ? "Ask a technical question…" : "Ask me to build something…"}
            />
          </div>
        </div>

        {/* ── Right panel ──────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden right-panel">

          {/* Tab bar */}
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
                  rightTab === tab.id ? "bg-[var(--muted)] text-white" : "text-[var(--muted-foreground)] hover:text-white"
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}

            {/* Research toggle */}
            <div className="ml-auto">
              <button
                onClick={() => setSelectedModel((m) => m === "research" ? "auto" : "research")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition border ${
                  selectedModel === "research"
                    ? "bg-indigo-500/20 border-indigo-500/30 text-indigo-300"
                    : "border-white/5 text-[var(--muted-foreground)] hover:text-white hover:bg-[var(--muted)] hover:border-white/10"
                }`}
                title="Toggle Research Agent (⌘R)"
              >
                <Search className="w-3.5 h-3.5" />
                {selectedModel === "research" ? "Research On" : "Research"}
              </button>
            </div>
          </div>

          {/* Panel content */}
          <div className="flex-1 flex overflow-hidden">
            {showFiles && (
              <div className="w-[200px] border-r border-[var(--border)] overflow-y-auto shrink-0 file-panel">
                <div className="px-3 py-2 border-b border-[var(--border)]">
                  <div className="flex items-center gap-1.5">
                    <FolderTree className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                    <span className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-medium">Files</span>
                  </div>
                </div>
                <FileTree files={sandboxFiles} onFileSelect={handleFileSelect} />
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              {rightTab === "preview"  && <LivePreview url={previewUrl} sandboxId={sandboxId} />}
              {rightTab === "code"     && (
                <CodeEditor
                  code={code}
                  onChange={setCode}
                  onDeploy={sandboxId ? async (updatedCode) => {
                    const token = await getToken();
                    if (!token || !sandboxId) return;
                    // Write the edited file back to the sandbox and redeploy
                    const files = parseCodeFiles(updatedCode);
                    if (files.length > 0) {
                      await deployFiles(
                        token, sandboxId, files,
                        (line) => setTerminalOutput((p) => [...p, line]),
                        (result) => {
                          if (result.previewUrl) { setPreviewUrl(result.previewUrl); setRightTab("preview"); }
                          refreshFiles(token, sandboxId);
                        },
                        (err) => setTerminalOutput((p) => [...p, `[Deploy] ✗ ${err}`]),
                      );
                    } else {
                      // No filepath annotation — write as-is to last known file
                      toast.info("Writing file…", "No filepath annotation found, writing to index.js");
                      await writeSandboxFile(token, sandboxId, "/home/user/index.js", updatedCode);
                    }
                  } : undefined}
                />
              )}
              {rightTab === "terminal" && <Terminal output={terminalOutput} onCommand={handleTerminalCommand} isConnected={!!sandboxId} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
