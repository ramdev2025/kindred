"use client";

import { Search, FileText, CheckCircle2, AlertCircle, HelpCircle, Loader2, Zap } from "lucide-react";
import { motion } from "framer-motion";
import type { ResearchEvent } from "@/hooks/useResearchStream";

interface ResearchEventBubbleProps {
  event: ResearchEvent;
}

const EVENT_CONFIG = {
  search_query: {
    icon: Search,
    label: "Searching",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    iconColor: "text-blue-400",
    textColor: "text-blue-300",
  },
  search_result: {
    icon: FileText,
    label: "Found",
    bg: "bg-zinc-800/60",
    border: "border-white/5",
    iconColor: "text-zinc-500",
    textColor: "text-zinc-400",
  },
  need_input: {
    icon: HelpCircle,
    label: "Needs clarification",
    bg: "bg-amber-500/10",
    border: "border-amber-500/25",
    iconColor: "text-amber-400",
    textColor: "text-amber-200",
  },
  input_received: {
    icon: CheckCircle2,
    label: "Got it — continuing",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    iconColor: "text-emerald-400",
    textColor: "text-emerald-300",
  },
  done: {
    icon: CheckCircle2,
    label: "Research complete",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    iconColor: "text-emerald-400",
    textColor: "text-emerald-300",
  },
  error: {
    icon: AlertCircle,
    label: "Error",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    iconColor: "text-red-400",
    textColor: "text-red-300",
  },
  token: {
    icon: Zap,
    label: "",
    bg: "",
    border: "",
    iconColor: "",
    textColor: "",
  },
} as const;

export default function ResearchEventBubble({ event }: ResearchEventBubbleProps) {
  // Tokens are rendered in the answer area, not as bubbles
  if (event.type === "token") return null;

  const cfg = EVENT_CONFIG[event.type];
  const Icon = cfg.icon;
  const displayText =
    event.type === "need_input" ? event.question : event.content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${cfg.bg} ${cfg.border}`}
    >
      <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cfg.iconColor}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-[10px] uppercase tracking-widest font-bold mb-0.5 ${cfg.iconColor} opacity-70`}>
          {cfg.label}
        </p>
        {displayText && (
          <p className={`text-xs leading-relaxed ${cfg.textColor} break-words`}>
            {displayText}
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ── Typing indicator shown while the agent is working ────────────────────────

export function ResearchTypingIndicator({ label }: { label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center gap-2.5 text-zinc-600"
    >
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      <span className="text-[11px] uppercase tracking-widest font-medium">{label}</span>
    </motion.div>
  );
}
