"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, Paperclip, X, FileText, Image as ImageIcon, Mic, Plus, ArrowUp, ChevronDown, Bot, Zap, Brain } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export interface AttachedFile {
  file: File;
  preview?: string; // data URL for images
}

interface PromptBarProps {
  onSend: (message: string, files?: File[], mode?: "build" | "plan") => void;
  isLoading: boolean;
  placeholder?: string;
  variant?: "default" | "hero";
}

export default function PromptBar({ onSend, isLoading, placeholder, variant = "default" }: PromptBarProps) {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"build" | "plan">("build");
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSubmit() {
    if ((!input.trim() && attachedFiles.length === 0) || isLoading) return;
    onSend(input.trim(), attachedFiles.length > 0 ? attachedFiles.map(a => a.file) : undefined, mode);
    setInput("");
    setAttachedFiles([]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const newAttachments: AttachedFile[] = files.map((file) => {
      const attached: AttachedFile = { file };
      if (file.type.startsWith("image/")) {
        attached.preview = URL.createObjectURL(file);
      }
      return attached;
    });
    setAttachedFiles((prev) => [...prev, ...newAttachments].slice(0, 5));
    e.target.value = "";
  }

  function removeFile(index: number) {
    setAttachedFiles((prev) => {
      const updated = [...prev];
      if (updated[index].preview) URL.revokeObjectURL(updated[index].preview!);
      updated.splice(index, 1);
      return updated;
    });
  }

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  if (variant === "hero") {
    return (
      <div className="prompt-bar w-full max-w-2xl mx-auto flex flex-col gap-3 relative group p-5 bg-[#1a1a1a] rounded-3xl border-white/10 shadow-2xl">

        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "Ask Kindred to build something..."}
          rows={1}
          className="w-full bg-transparent text-xl text-white placeholder-white/20 resize-none focus:outline-none min-h-[44px] max-h-[200px] pr-12 font-medium"
        />
        
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-9 h-9 rounded-xl hover:bg-white/5 text-white/30 hover:text-white transition flex items-center justify-center border border-white/5 hover:border-white/10"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              multiple
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                onClick={() => setShowModeDropdown(!showModeDropdown)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all group"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 group-hover:shadow-[0_0_8px_rgba(96,165,250,0.5)] transition-all" />
                <span className="text-[13px] font-bold text-white/60 uppercase tracking-wider">{mode}</span>
                <svg viewBox="0 0 24 24" className={`w-3.5 h-3.5 text-white/20 transition-transform ${showModeDropdown ? 'rotate-180' : ''} fill-none stroke-current stroke-2`}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              <AnimatePresence>
                {showModeDropdown && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowModeDropdown(false)} 
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute bottom-full mb-3 left-0 w-64 bg-[#141414] border border-white/10 p-1.5 shadow-2xl z-50 overflow-hidden rounded-2xl"
                    >
                      <button
                        onClick={() => {
                          setMode("build");
                          setShowModeDropdown(false);
                        }}
                        className={`w-full flex items-start gap-3 p-3 rounded-xl transition text-left ${
                          mode === "build" ? "bg-white/10" : "hover:bg-white/5"
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 mt-1.5 rounded-full ${mode === "build" ? "bg-blue-400" : "bg-white/20"}`} />
                        <div>
                          <p className="text-[12px] font-bold text-white uppercase tracking-tight">Build Mode</p>
                          <p className="text-[10px] text-white/40 mt-0.5 font-medium leading-relaxed">Generate and execute code directly in the cloud.</p>
                        </div>
                      </button>

                      <button
                        onClick={() => {
                          setMode("plan");
                          setShowModeDropdown(false);
                        }}
                        className={`w-full flex items-start gap-3 p-3 rounded-xl transition text-left mt-1 ${
                          mode === "plan" ? "bg-white/10" : "hover:bg-white/5"
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 mt-1.5 rounded-full ${mode === "plan" ? "bg-purple-400" : "bg-white/20"}`} />
                        <div>
                          <p className="text-[12px] font-bold text-white uppercase tracking-tight">Plan Mode</p>
                          <p className="text-[10px] text-white/40 mt-0.5 font-medium leading-relaxed">Architecture & technical logic for complex apps.</p>
                        </div>
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            
            <button
              onClick={handleSubmit}
              disabled={isLoading || (!input.trim() && attachedFiles.length === 0)}
              className="w-10 h-10 rounded-2xl kindred-gradient flex items-center justify-center disabled:opacity-30 transition-all shadow-lg shadow-blue-500/20 hover:scale-105"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-white fill-none stroke-current stroke-2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="prompt-bar px-5 py-4 space-y-3 bg-[#1a1a1a] rounded-2xl border-white/5"
    >
      {/* Attached files preview */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 pb-1">
          {attachedFiles.map((attached, i) => (
            <div
              key={i}
              className="flex items-center gap-2 bg-white/5 border border-white/5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-white/60 group"
            >
              {attached.preview ? (
                <img src={attached.preview} alt="" className="w-4 h-4 rounded-sm object-cover" />
              ) : (
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-none stroke-current stroke-2">
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                  <path d="M13 2v7h7" />
                </svg>
              )}
              <span className="max-w-[100px] truncate uppercase tracking-tight">{attached.file.name}</span>
              <button
                onClick={() => removeFile(i)}
                className="text-white/20 hover:text-red-500 transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-3 h-3 fill-none stroke-current stroke-2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-center gap-4">

        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "What should we build next?"}
          rows={1}
          className="flex-1 bg-transparent text-[15px] text-white placeholder-white/20 resize-none focus:outline-none min-h-[22px] max-h-[120px] font-medium"
        />
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-9 h-9 rounded-xl hover:bg-white/5 text-white/30 hover:text-white transition flex items-center justify-center"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>

          <button
            onClick={handleSubmit}
            disabled={isLoading || (!input.trim() && attachedFiles.length === 0)}
            className="w-9 h-9 rounded-xl kindred-gradient flex items-center justify-center disabled:opacity-30 transition-all shadow-lg shadow-blue-500/20"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-white fill-none stroke-current stroke-2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
