"use client";

import { useState, useRef, useEffect } from "react";
import { Trash2 } from "lucide-react";

interface TerminalProps {
  output: string[];
  onCommand?: (command: string) => void;
  isConnected?: boolean;
}

export default function Terminal({ output, onCommand, isConnected = false }: TerminalProps) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !onCommand) return;

    setHistory((prev) => [...prev, input]);
    setHistoryIndex(-1);
    onCommand(input.trim());
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length > 0) {
        const newIndex = historyIndex < history.length - 1 ? historyIndex + 1 : historyIndex;
        setHistoryIndex(newIndex);
        setInput(history[history.length - 1 - newIndex] || "");
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(history[history.length - 1 - newIndex] || "");
      } else {
        setHistoryIndex(-1);
        setInput("");
      }
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a] font-mono text-[13px]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-zinc-600'}`} />
          <span className="text-[11px] text-zinc-500">
            {isConnected ? 'Connected' : 'No sandbox'}
          </span>
        </div>
        <button
          onClick={() => {/* clear would be handled by parent */}}
          className="p-1 text-zinc-600 hover:text-zinc-400 transition-colors"
          title="Clear terminal"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Output */}
      <div ref={outputRef} className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {output.length === 0 ? (
          <p className="text-zinc-600">
            {isConnected ? '$ Ready for commands...' : 'Start a sandbox to use the terminal.'}
          </p>
        ) : (
          output.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap">
              {line.startsWith('$ ') ? (
                <span className="text-green-400">{line}</span>
              ) : line.startsWith('[Error]') || line.startsWith('Error') ? (
                <span className="text-red-400">{line}</span>
              ) : line.startsWith('[System]') ? (
                <span className="text-blue-400">{line}</span>
              ) : (
                <span className="text-zinc-300">{line}</span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Input */}
      {isConnected && onCommand && (
        <form onSubmit={handleSubmit} className="flex items-center border-t border-zinc-800 px-3 py-2">
          <span className="text-green-400 mr-2">$</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-zinc-200 placeholder:text-zinc-700 outline-none"
            autoFocus
          />
        </form>
      )}
    </div>
  );
}
