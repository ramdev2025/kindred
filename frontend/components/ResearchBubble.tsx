"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  ChevronRight,
  Search,
  FileText,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Copy,
  Check,
  Loader2,
} from "lucide-react";
import type { ResearchEvent, ResearchStatus } from "@/hooks/useResearchStream";

// ── Event row inside the collapsible ─────────────────────────────────────────

function EventRow({ event }: { event: ResearchEvent }) {
  if (event.type === "token" || event.type === "done") return null;

  const cfg = {
    search_query:   { icon: Search,       color: "text-blue-400",    label: event.content },
    search_result:  { icon: FileText,     color: "text-zinc-500",    label: event.content },
    need_input:     { icon: HelpCircle,   color: "text-amber-400",   label: event.question },
    input_received: { icon: CheckCircle2, color: "text-emerald-400", label: event.content },
    error:          { icon: AlertCircle,  color: "text-red-400",     label: event.content },
  }[event.type];

  if (!cfg) return null;
  const Icon = cfg.icon;

  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-white/[0.04] last:border-0">
      <Icon className={`w-3 h-3 mt-0.5 shrink-0 ${cfg.color}`} />
      <span className="text-[11px] text-zinc-400 leading-relaxed break-words min-w-0">
        {cfg.label}
      </span>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ResearchBubbleProps {
  query: string;
  events: ResearchEvent[];
  answer: string;
  status: ResearchStatus;
  pendingQuestion: string | null;
  onAnswer: (answer: string) => Promise<void>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ResearchBubble({
  query,
  events,
  answer,
  status,
  pendingQuestion,
  onAnswer,
}: ResearchBubbleProps) {
  const [expanded, setExpanded]       = useState(true);
  const [hitlText, setHitlText]       = useState("");
  const [copied, setCopied]           = useState<string | null>(null);
  const hitlRef                       = useRef<HTMLInputElement>(null);

  // Auto-focus HITL input when agent pauses
  useEffect(() => {
    if (status === "awaiting_input") {
      setTimeout(() => hitlRef.current?.focus(), 80);
    }
  }, [status]);

  // Auto-collapse once answer starts streaming in
  useEffect(() => {
    if (answer.length > 120) setExpanded(false);
  }, [answer.length > 120]);

  const searchCount = events.filter((e) => e.type === "search_query").length;
  const isRunning   = status === "streaming" || status === "starting";

  const headerLabel = isRunning
    ? `Researching… (${searchCount} search${searchCount !== 1 ? "es" : ""} so far)`
    : status === "awaiting_input"
    ? "Waiting for your input"
    : status === "error"
    ? "Research failed"
    : `Used Deep Research · ${searchCount} search${searchCount !== 1 ? "es" : ""}`;

  function handleCopy(code: string, id: string) {
    navigator.clipboard.writeText(code);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleHitlSend() {
    const ans = hitlText.trim();
    if (!ans) return;
    setHitlText("");
    await onAnswer(ans);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3"
    >
      {/* Avatar — indigo to distinguish from normal assistant (emerald) */}
      <div className="w-7 h-7 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
        <Search className="w-3.5 h-3.5 text-indigo-400" />
      </div>

      <div className="max-w-[85%] space-y-2 min-w-0">

        {/* ── Collapsible tool-use strip ──────────────────────────────────── */}
        <div className="rounded-xl border border-white/5 overflow-hidden bg-zinc-900/40">

          {/* Header row — always visible */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] transition text-left"
          >
            {isRunning ? (
              <Loader2 className="w-3 h-3 text-indigo-400 animate-spin shrink-0" />
            ) : (
              <Search className="w-3 h-3 text-indigo-400 shrink-0" />
            )}
            <span className="text-[11px] text-zinc-400 flex-1 font-medium">
              {headerLabel}
            </span>
            <ChevronRight
              className={`w-3 h-3 text-zinc-600 shrink-0 transition-transform duration-200 ${
                expanded ? "rotate-90" : ""
              }`}
            />
          </button>

          {/* Expandable event log */}
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                key="events"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="px-3 pb-2 border-t border-white/5 max-h-[220px] overflow-y-auto">
                  {events.length === 0 ? (
                    <p className="text-[11px] text-zinc-600 py-2">Starting up…</p>
                  ) : (
                    events
                      .filter((e) => e.type !== "token" && e.type !== "done")
                      .map((e) => <EventRow key={e.id} event={e} />)
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── HITL clarification input ────────────────────────────────────── */}
        <AnimatePresence>
          {status === "awaiting_input" && pendingQuestion && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="rounded-xl border border-amber-500/20 bg-amber-500/8 p-3 space-y-2.5"
            >
              <div className="flex items-start gap-2">
                <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200 leading-relaxed">{pendingQuestion}</p>
              </div>
              <div className="flex gap-2">
                <input
                  ref={hitlRef}
                  type="text"
                  value={hitlText}
                  onChange={(e) => setHitlText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleHitlSend()}
                  placeholder="Your answer…"
                  className="flex-1 bg-black/30 border border-amber-500/20 rounded-lg px-3 py-1.5 text-xs text-white placeholder-amber-900 focus:outline-none focus:border-amber-500/40 transition"
                />
                <button
                  onClick={handleHitlSend}
                  disabled={!hitlText.trim()}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/25 text-amber-300 text-[11px] font-bold hover:bg-amber-500/30 disabled:opacity-30 transition uppercase tracking-wide"
                >
                  Send
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Streaming / final answer ────────────────────────────────────── */}
        {answer && (
          <div className="text-sm text-zinc-200 leading-relaxed prose prose-invert prose-sm max-w-none">
            <ReactMarkdown
              components={{
                code({ className, children, node, inline, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || "");
                  const codeStr = String(children).replace(/\n$/, "");
                  const blockId = codeStr.slice(0, 20);

                  if (match) {
                    return (
                      <div className="code-block my-3 relative group">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-zinc-900/50">
                          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                            {match[1]}
                          </span>
                          <button
                            onClick={() => handleCopy(codeStr, blockId)}
                            className="opacity-0 group-hover:opacity-100 transition p-1 rounded hover:bg-zinc-700"
                          >
                            {copied === blockId ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-zinc-400" />
                            )}
                          </button>
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
            {isRunning && (
              <span className="inline-block w-1.5 h-[1em] bg-indigo-400 animate-pulse rounded-sm ml-0.5 align-text-bottom" />
            )}
          </div>
        )}

        {/* Model tag */}
        {status === "complete" && (
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider">
            via Google ADK · Deep Research
          </span>
        )}
      </div>
    </motion.div>
  );
}
