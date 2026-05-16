"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search } from "lucide-react";
import ResearchPanel from "@/components/ResearchPanel";

interface ResearchDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
  /** Snapshot of what is currently being built — forwarded to the ADK agent */
  projectContext?: string;
}

export default function ResearchDrawer({
  isOpen,
  onClose,
  token,
  projectContext,
}: ResearchDrawerProps) {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* ── Backdrop ─────────────────────────────────────────────────── */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* ── Drawer panel ─────────────────────────────────────────────── */}
          <motion.aside
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed inset-y-0 right-0 z-50 w-[480px] max-w-[95vw] flex flex-col bg-[#111111] border-l border-white/8 shadow-2xl"
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 shrink-0 bg-[#0e0e0e]">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                  <Search className="w-3.5 h-3.5 text-indigo-300" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-white tracking-tight">
                    Deep Research
                  </p>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider">
                    ADK Programmer Specialist
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Keyboard hint */}
                <span className="hidden sm:flex items-center gap-1 text-[9px] text-zinc-700 border border-white/5 rounded px-1.5 py-0.5 font-mono">
                  ⌘ R
                </span>
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-lg hover:bg-white/5 flex items-center justify-center text-zinc-600 hover:text-zinc-300 transition"
                  aria-label="Close research drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ResearchPanel fills the rest */}
            <div className="flex-1 overflow-hidden">
              <ResearchPanel token={token} projectContext={projectContext} />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
