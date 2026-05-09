"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShortcutAction {
  key: string;
  meta?: boolean;     // Cmd on Mac, Ctrl on Windows
  shift?: boolean;
  label: string;
  description?: string;
  category?: string;
  action: () => void;
}

interface KeyboardShortcutsContextValue {
  registerShortcut: (shortcut: ShortcutAction) => void;
  unregisterShortcut: (key: string, meta?: boolean, shift?: boolean) => void;
  shortcuts: ShortcutAction[];
  showPalette: boolean;
  setShowPalette: (show: boolean) => void;
}

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextValue | null>(null);

export function useKeyboardShortcuts(): KeyboardShortcutsContextValue {
  const ctx = useContext(KeyboardShortcutsContext);
  if (!ctx) throw new Error("useKeyboardShortcuts must be used within KeyboardShortcutsProvider");
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function KeyboardShortcutsProvider({ children }: { children: ReactNode }) {
  const [shortcuts, setShortcuts] = useState<ShortcutAction[]>([]);
  const [showPalette, setShowPalette] = useState(false);
  const [search, setSearch] = useState("");

  const registerShortcut = useCallback((shortcut: ShortcutAction) => {
    setShortcuts((prev) => {
      const existing = prev.findIndex(
        (s) => s.key === shortcut.key && s.meta === shortcut.meta && s.shift === shortcut.shift
      );
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = shortcut;
        return updated;
      }
      return [...prev, shortcut];
    });
  }, []);

  const unregisterShortcut = useCallback((key: string, meta?: boolean, shift?: boolean) => {
    setShortcuts((prev) =>
      prev.filter((s) => !(s.key === key && s.meta === meta && s.shift === shift))
    );
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const metaKey = e.metaKey || e.ctrlKey;

      // Command palette toggle: Cmd+K
      if (metaKey && e.key === "k") {
        e.preventDefault();
        setShowPalette((prev) => !prev);
        setSearch("");
        return;
      }

      // Close palette on Escape
      if (e.key === "Escape" && showPalette) {
        setShowPalette(false);
        setSearch("");
        return;
      }

      // Check registered shortcuts
      for (const shortcut of shortcuts) {
        if (
          e.key.toLowerCase() === shortcut.key.toLowerCase() &&
          (shortcut.meta ? metaKey : !metaKey) &&
          (shortcut.shift ? e.shiftKey : !e.shiftKey)
        ) {
          // Don't trigger shortcuts when typing in inputs (except specific ones)
          const target = e.target as HTMLElement;
          const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

          // Allow Cmd+Enter and Cmd+K even in inputs
          if (isInput && !(shortcut.meta && (shortcut.key === "Enter" || shortcut.key === "k"))) {
            continue;
          }

          e.preventDefault();
          shortcut.action();
          return;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts, showPalette]);

  const filteredShortcuts = shortcuts.filter(
    (s) =>
      !search ||
      s.label.toLowerCase().includes(search.toLowerCase()) ||
      s.description?.toLowerCase().includes(search.toLowerCase()) ||
      s.category?.toLowerCase().includes(search.toLowerCase())
  );

  const isMac = typeof navigator !== "undefined" && navigator.platform.includes("Mac");
  const metaSymbol = isMac ? "⌘" : "Ctrl+";

  return (
    <KeyboardShortcutsContext.Provider
      value={{ registerShortcut, unregisterShortcut, shortcuts, showPalette, setShowPalette }}
    >
      {children}

      {/* Command Palette */}
      <AnimatePresence>
        {showPalette && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90]"
              onClick={() => setShowPalette(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg z-[91]"
            >
              <div
                className="rounded-2xl border overflow-hidden shadow-2xl"
                style={{
                  background: "rgba(20, 20, 20, 0.95)",
                  borderColor: "rgba(255,255,255,0.1)",
                  backdropFilter: "blur(20px)",
                }}
              >
                {/* Search input */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 text-white/30 fill-none stroke-current stroke-2 shrink-0">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Type a command..."
                    className="flex-1 bg-transparent text-sm text-white placeholder-white/25 focus:outline-none font-medium"
                    autoFocus
                  />
                  <kbd className="text-[10px] font-bold text-white/20 bg-white/5 px-2 py-1 rounded-md uppercase tracking-wider border border-white/5">
                    ESC
                  </kbd>
                </div>

                {/* Commands list */}
                <div className="max-h-[300px] overflow-y-auto py-2">
                  {filteredShortcuts.length === 0 ? (
                    <p className="text-xs text-white/30 text-center py-8 font-medium">No commands found</p>
                  ) : (
                    filteredShortcuts.map((shortcut, i) => (
                      <button
                        key={`${shortcut.key}-${shortcut.meta}-${shortcut.shift}-${i}`}
                        onClick={() => {
                          shortcut.action();
                          setShowPalette(false);
                          setSearch("");
                        }}
                        className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-white/5 transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-white/80 font-medium group-hover:text-white transition-colors">
                            {shortcut.label}
                          </span>
                          {shortcut.description && (
                            <span className="text-xs text-white/25 font-medium">
                              {shortcut.description}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {shortcut.meta && (
                            <kbd className="text-[10px] font-bold text-white/30 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                              {metaSymbol}
                            </kbd>
                          )}
                          {shortcut.shift && (
                            <kbd className="text-[10px] font-bold text-white/30 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                              ⇧
                            </kbd>
                          )}
                          <kbd className="text-[10px] font-bold text-white/30 bg-white/5 px-1.5 py-0.5 rounded border border-white/5 uppercase">
                            {shortcut.key === "Enter" ? "↵" : shortcut.key}
                          </kbd>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                {/* Footer hint */}
                <div className="px-5 py-2.5 border-t border-white/5 flex items-center gap-4">
                  <span className="text-[10px] text-white/20 font-medium flex items-center gap-1">
                    <kbd className="bg-white/5 px-1 py-0.5 rounded border border-white/5 text-[9px]">↑↓</kbd>
                    Navigate
                  </span>
                  <span className="text-[10px] text-white/20 font-medium flex items-center gap-1">
                    <kbd className="bg-white/5 px-1 py-0.5 rounded border border-white/5 text-[9px]">↵</kbd>
                    Run
                  </span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </KeyboardShortcutsContext.Provider>
  );
}

// ── Shortcut display helper ───────────────────────────────────────────────────

export function ShortcutHint({ keys }: { keys: string }) {
  const isMac = typeof navigator !== "undefined" && navigator.platform?.includes("Mac");

  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] text-white/20 font-bold">
      {keys.split("+").map((k, i) => (
        <kbd
          key={i}
          className="bg-white/5 px-1 py-0.5 rounded border border-white/5 uppercase tracking-wider"
        >
          {k === "Cmd" ? (isMac ? "⌘" : "Ctrl") : k === "Shift" ? "⇧" : k}
        </kbd>
      ))}
    </span>
  );
}
