"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Search, Send, RotateCcw, X, Copy, Check,
  Sparkles, FlaskConical, Zap, BookOpen,
} from "lucide-react";

import { useResearchStream } from "@/hooks/useResearchStream";
import ResearchEventBubble, { ResearchTypingIndicator } from "@/components/ResearchEventBubble";

// ── Status pill ───────────────────────────────────────────────────────────────

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  idle:            { label: "Ready",              cls: "bg-zinc-800 text-zinc-500" },
  starting:        { label: "Connecting…",        cls: "bg-blue-500/20 text-blue-400" },
  streaming:       { label: "Researching…",       cls: "bg-indigo-500/20 text-indigo-300" },
  awaiting_input:  { label: "Waiting for you",    cls: "bg-amber-500/20 text-amber-300" },
  complete:        { label: "Complete",            cls: "bg-emerald-500/20 text-emerald-300" },
  error:           { label: "Error",               cls: "bg-red-500/20 text-red-400" },
};

const TYPING_LABELS: Record<string, string> = {
  starting:  "Connecting to research agent…",
  streaming: "Agent is researching…",
};

// ── Starter prompts ───────────────────────────────────────────────────────────

const STARTERS = [
  { icon: FlaskConical, text: "What is the best vector DB for a FastAPI + LangGraph RAG system in 2025?" },
  { icon: BookOpen,     text: "Compare Upstash Redis vs self-hosted Redis for Cloud Run workloads." },
  { icon: Zap,          text: "How do I stream Gemini responses through a FastAPI SSE endpoint?" },
  { icon: Sparkles,     text: "What Google ADK patterns should I use for a multi-agent coding assistant?" },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface ResearchPanelProps {
  token: string | null;
  /** Optional project context forwarded to the agent system prompt */
  projectContext?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ResearchPanel({ token, projectContext }: ResearchPanelProps) {
  const {
    status, events, answer, pendingQuestion,
    sessionId, error, isCached,
    startResearch, sendAnswer, reset, cancel,
  } = useResearchStream(token);

  const [query, setQuery]           = useState("");
  const [hitlAnswer, setHitlAnswer] = useState("");
  const [copied, setCopied]         = useState(false);

  const bottomRef    = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLTextAreaElement>(null);
  const hitlInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll events list
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events, answer]);

  // Focus HITL input when agent pauses
  useEffect(() => {
    if (status === "awaiting_input") {
      setTimeout(() => hitlInputRef.current?.focus(), 100);
    }
  }, [status]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleSubmit() {
    const q = query.trim();
    if (!q || status === "streaming" || status === "starting") return;
    startResearch(q, projectContext);
    setQuery("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  async function handleHitlSubmit() {
    const a = hitlAnswer.trim();
    if (!a) return;
    await sendAnswer(a);
    setHitlAnswer("");
  }

  function handleHitlKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleHitlSubmit();
  }

  function handleCopyAnswer() {
    navigator.clipboard.writeText(answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isActive  = status === "streaming" || status === "starting";
  const pill      = STATUS_PILL[status] || STATUS_PILL.idle;
  const hasAnswer = answer.length > 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[#111111]">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center">
            <Search className="w-3.5 h-3.5 text-indigo-300" />
          </div>
          <div>
            <h2 className="text-[13px] font-bold text-white tracking-tight">
              Deep Research
            </h2>
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider">
              Programmer Specialist · Google ADK
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Cached badge */}
          {isCached && (
            <span className="text-[9px] uppercase tracking-widest font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-md">
              Cached
            </span>
          )}

          {/* Status pill */}
          <span className={`text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-full ${pill.cls}`}>
            {pill.label}
          </span>

          {/* Session ID */}
          {sessionId && (
            <span className="text-[9px] text-zinc-700 font-mono hidden sm:block">
              {sessionId.slice(0, 8)}
            </span>
          )}

          {/* Reset button */}
          {status !== "idle" && (
            <button
              onClick={reset}
              className="w-7 h-7 rounded-lg hover:bg-white/5 flex items-center justify-center text-zinc-600 hover:text-zinc-300 transition"
              title="New research"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">

        {/* Idle state — starter prompts */}
        {status === "idle" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 pt-4"
          >
            <div className="text-center space-y-1">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center mx-auto mb-3">
                <Search className="w-5 h-5 text-indigo-400" />
              </div>
              <p className="text-sm font-semibold text-white">Ask anything technical</p>
              <p className="text-xs text-zinc-600">
                The agent searches the web, synthesizes sources, and asks you
                clarifying questions when needed.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {STARTERS.map(({ icon: Icon, text }) => (
                <button
                  key={text}
                  onClick={() => { setQuery(text); inputRef.current?.focus(); }}
                  className="flex items-start gap-3 w-full text-left px-4 py-3 rounded-xl border border-white/5 bg-zinc-900/60 hover:bg-zinc-800/80 hover:border-white/10 transition group"
                >
                  <Icon className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0 group-hover:text-indigo-300 transition" />
                  <span className="text-xs text-zinc-400 group-hover:text-zinc-300 transition leading-relaxed">
                    {text}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Activity log — search queries, results, HITL events */}
        {events.length > 0 && (
          <div className="space-y-2">
            {events
              .filter((e) => e.type !== "done" && e.type !== "token")
              .map((event) => (
                <ResearchEventBubble key={event.id} event={event} />
              ))}
          </div>
        )}

        {/* Typing indicator */}
        {TYPING_LABELS[status] && (
          <ResearchTypingIndicator label={TYPING_LABELS[status]} />
        )}

        {/* ── Streamed answer ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {hasAnswer && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-white/5 bg-zinc-900/50 overflow-hidden"
            >
              {/* Answer header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-zinc-900/80">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                    Research Answer
                  </span>
                </div>
                {status === "complete" && (
                  <button
                    onClick={handleCopyAnswer}
                    className="flex items-center gap-1.5 text-[10px] text-zinc-600 hover:text-zinc-300 transition"
                  >
                    {copied ? (
                      <><Check className="w-3 h-3 text-emerald-400" /><span className="text-emerald-400">Copied</span></>
                    ) : (
                      <><Copy className="w-3 h-3" /><span>Copy</span></>
                    )}
                  </button>
                )}
              </div>

              {/* Answer body */}
              <div className="px-4 py-4 prose prose-invert prose-sm max-w-none text-zinc-200 text-sm leading-relaxed">
                <ReactMarkdown
                  components={{
                    code({ className, children, node, inline, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || "");
                      const codeStr = String(children).replace(/\n$/, "");
                      if (match) {
                        return (
                          <div className="my-3 rounded-lg overflow-hidden border border-white/5">
                            <div className="px-3 py-1.5 bg-zinc-950/80 border-b border-white/5">
                              <span className="text-[10px] uppercase tracking-wider text-zinc-600">
                                {match[1]}
                              </span>
                            </div>
                            <SyntaxHighlighter
                              style={oneDark}
                              language={match[1]}
                              PreTag="div"
                              customStyle={{ margin: 0, background: "transparent", fontSize: "12px" }}
                            >
                              {codeStr}
                            </SyntaxHighlighter>
                          </div>
                        );
                      }
                      return (
                        <code className="bg-zinc-800 text-indigo-300 px-1.5 py-0.5 rounded text-xs" {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {answer}
                </ReactMarkdown>

                {/* Blinking cursor while streaming */}
                {isActive && (
                  <span className="inline-block w-1.5 h-4 bg-indigo-400 animate-pulse rounded-sm ml-0.5 align-text-bottom" />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error state */}
        {status === "error" && error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-300"
          >
            {error}
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── HITL clarification box ──────────────────────────────────────────── */}
      <AnimatePresence>
        {status === "awaiting_input" && pendingQuestion && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="mx-5 mb-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 space-y-3 shrink-0"
          >
            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-amber-400 text-[10px] font-bold">?</span>
              </div>
              <p className="text-xs text-amber-200 leading-relaxed flex-1">
                {pendingQuestion}
              </p>
            </div>
            <div className="flex gap-2">
              <input
                ref={hitlInputRef}
                type="text"
                value={hitlAnswer}
                onChange={(e) => setHitlAnswer(e.target.value)}
                onKeyDown={handleHitlKey}
                placeholder="Your answer…"
                className="flex-1 bg-black/30 border border-amber-500/20 rounded-xl px-3.5 py-2 text-sm text-white placeholder-amber-800 focus:outline-none focus:border-amber-500/50 transition"
              />
              <button
                onClick={handleHitlSubmit}
                disabled={!hitlAnswer.trim()}
                className="px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold hover:bg-amber-500/30 disabled:opacity-30 transition uppercase tracking-wider"
              >
                Send
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Prompt input ────────────────────────────────────────────────────── */}
      <div className="px-5 pb-5 shrink-0">
        <div className="flex items-end gap-3 bg-[#1a1a1a] rounded-2xl border border-white/5 px-4 py-3">
          <textarea
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              status === "complete"
                ? "Ask a follow-up or start new research…"
                : "What do you want to research?"
            }
            rows={1}
            disabled={isActive || status === "awaiting_input"}
            className="flex-1 bg-transparent text-sm text-white placeholder-white/20 resize-none focus:outline-none min-h-[22px] max-h-[100px] disabled:opacity-40"
            style={{ height: "auto" }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = Math.min(t.scrollHeight, 100) + "px";
            }}
          />

          {/* Cancel / Send */}
          {isActive ? (
            <button
              onClick={cancel}
              className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition shrink-0"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!query.trim() || status === "awaiting_input"}
              className="w-9 h-9 rounded-xl kindred-gradient flex items-center justify-center disabled:opacity-30 transition shadow-lg shadow-blue-500/20 shrink-0"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          )}
        </div>

        {/* Footer hint */}
        <p className="text-center text-[10px] text-zinc-700 mt-2 uppercase tracking-widest">
          Powered by Google ADK · Gemini · Google Search
        </p>
      </div>
    </div>
  );
}
