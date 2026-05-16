"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight, Loader2, Sparkles, Code2, Rocket,
  Wrench, CheckCircle2, AlertCircle, FileText, Square,
} from "lucide-react";

// ── Types (kept in sync with page.tsx Message interface) ─────────────────────

export type AgentStepType =
  | "thinking"   // initial — reading the prompt
  | "planning"   // plan mode — writing architecture
  | "generating" // writing code tokens
  | "deploying"  // pushing files to sandbox
  | "fixing"     // auto-fix iteration
  | "success"    // loop complete, deployed
  | "error";     // loop failed

export interface AgentStep {
  id: string;
  type: AgentStepType;
  content: string;
  timestamp: number;
}

export type AgentBubbleStatus =
  | "thinking" | "planning" | "generating"
  | "deploying" | "fixing" | "complete" | "error";

// ── Step row config ───────────────────────────────────────────────────────────

const STEP_CFG: Record<AgentStepType, { icon: typeof Sparkles; color: string }> = {
  thinking:   { icon: Sparkles,      color: "text-zinc-400" },
  planning:   { icon: FileText,      color: "text-blue-400" },
  generating: { icon: Code2,         color: "text-emerald-400" },
  deploying:  { icon: Rocket,        color: "text-sky-400" },
  fixing:     { icon: Wrench,        color: "text-amber-400" },
  success:    { icon: CheckCircle2,  color: "text-emerald-400" },
  error:      { icon: AlertCircle,   color: "text-red-400" },
};

// ── Header label + icon per status ───────────────────────────────────────────

const STATUS_CFG: Record<AgentBubbleStatus, { label: (n: number) => string; icon: typeof Code2; iconColor: string }> = {
  thinking:   { label: ()  => "Thinking…",              icon: Sparkles,     iconColor: "text-zinc-400" },
  planning:   { label: ()  => "Planning architecture…", icon: FileText,     iconColor: "text-blue-400" },
  generating: { label: ()  => "Generating code…",       icon: Code2,        iconColor: "text-emerald-400" },
  deploying:  { label: ()  => "Deploying to sandbox…",  icon: Rocket,       iconColor: "text-sky-400" },
  fixing:     { label: ()  => "Fixing errors…",         icon: Wrench,       iconColor: "text-amber-400" },
  complete:   { label: (n) => `Built · ${n} step${n !== 1 ? "s" : ""}`, icon: CheckCircle2, iconColor: "text-emerald-400" },
  error:      { label: ()  => "Build failed",            icon: AlertCircle,  iconColor: "text-red-400" },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface AgentBubbleProps {
  steps: AgentStep[];
  status: AgentBubbleStatus;
  onAbort?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AgentBubble({ steps, status, onAbort }: AgentBubbleProps) {
  const isActive  = status !== "complete" && status !== "error";
  const cfg       = STATUS_CFG[status];
  const Icon      = cfg.icon;

  // Start expanded; auto-collapse once code starts flowing (complete/error)
  const [expanded, setExpanded] = useState(true);
  useEffect(() => {
    if (!isActive) setExpanded(false);
  }, [isActive]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3"
    >
      {/* Avatar — emerald like normal assistant but with the step icon */}
      <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5">
        {isActive
          ? <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
          : <Icon   className={`w-3.5 h-3.5 ${cfg.iconColor}`} />
        }
      </div>

      <div className="max-w-[85%] space-y-1 min-w-0">
        {/* ── Collapsible pill ────────────────────────────────────────────── */}
        <div className="rounded-xl border border-white/5 overflow-hidden bg-zinc-900/40">

          {/* Header row */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] transition text-left"
          >
            <Icon className={`w-3 h-3 shrink-0 ${cfg.iconColor}`} />
            <span className="text-[11px] text-zinc-400 flex-1 font-medium">
              {cfg.label(steps.length)}
            </span>

            {/* Abort button — only while active */}
            {isActive && onAbort && (
              <button
                onClick={(e) => { e.stopPropagation(); onAbort(); }}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-red-500/15 text-red-400 hover:bg-red-500/25 rounded-md transition mr-1"
                title="Stop generation"
              >
                <Square className="w-2.5 h-2.5" /> Stop
              </button>
            )}

            <ChevronRight
              className={`w-3 h-3 text-zinc-600 shrink-0 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
            />
          </button>

          {/* Expandable step log */}
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                key="steps"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="px-3 pb-2 border-t border-white/[0.04] max-h-[200px] overflow-y-auto space-y-0">
                  {steps.length === 0 ? (
                    <p className="text-[11px] text-zinc-600 py-2">Starting…</p>
                  ) : (
                    steps.map((step) => {
                      const sc = STEP_CFG[step.type];
                      const StepIcon = sc.icon;
                      return (
                        <div key={step.id} className="flex items-start gap-2 py-1.5 border-b border-white/[0.03] last:border-0">
                          <StepIcon className={`w-3 h-3 mt-0.5 shrink-0 ${sc.color}`} />
                          <span className="text-[11px] text-zinc-400 leading-relaxed break-words min-w-0">
                            {step.content}
                          </span>
                        </div>
                      );
                    })
                  )}

                  {/* Live pulse on the last step while active */}
                  {isActive && (
                    <div className="flex items-center gap-2 pt-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[10px] text-zinc-600">working…</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
