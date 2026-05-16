"use client";

import Editor from "@monaco-editor/react";
import { Upload, Loader2 } from "lucide-react";
import { useState } from "react";

interface CodeEditorProps {
  code: string;
  onChange: (value: string) => void;
  onDeploy?: (code: string) => Promise<void>;
  language?: string;
}

export default function CodeEditor({ code, onChange, onDeploy, language }: CodeEditorProps) {
  const [deploying, setDeploying] = useState(false);

  // Guess language from content if not provided
  const detectedLang = language || detectLanguage(code);

  async function handleDeploy() {
    if (!onDeploy || deploying) return;
    setDeploying(true);
    try {
      await onDeploy(code);
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      {onDeploy && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800 bg-[#0a0a0a] shrink-0">
          <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">
            {detectedLang}
          </span>
          <button
            onClick={handleDeploy}
            disabled={deploying}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-xs font-medium hover:bg-emerald-500/25 disabled:opacity-40 transition"
          >
            {deploying ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> Deploying…</>
            ) : (
              <><Upload className="w-3 h-3" /> Deploy changes</>
            )}
          </button>
        </div>
      )}

      <div className="flex-1">
        <Editor
          height="100%"
          language={detectedLang}
          theme="vs-dark"
          value={code}
          onChange={(value) => onChange(value || "")}
          options={{
            fontSize: 13,
            minimap: { enabled: false },
            padding: { top: 16 },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            lineNumbers: "on",
            tabSize: 2,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
}

function detectLanguage(code: string): string {
  if (/<html/i.test(code))                                   return "html";
  if (/from ['"]react['"]/i.test(code))                      return "typescriptreact";
  if (/:\s*(string|number|boolean|void|any)\b/.test(code))   return "typescript";
  if (/def |class |import |from \w+ import/.test(code))      return "python";
  if (/body\s*\{|margin:|padding:|@media/.test(code))        return "css";
  if (/^\s*\{[\s\S]*"[\w]+"\s*:/.test(code))                return "json";
  if (/FROM\s+\w+|RUN\s+|COPY\s+|EXPOSE\s+/i.test(code))   return "dockerfile";
  return "javascript";
}
