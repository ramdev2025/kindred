"use client";

import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check, Bot, User, FileText, Image as ImageIcon, Globe, ExternalLink } from "lucide-react";
import { useState } from "react";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  model?: string;
  attachments?: Array<{ filename: string; mimeType: string }>;
  usedSearch?: boolean;
  searchSources?: Array<{ title: string; url: string }>;
}

export default function MessageBubble({ role, content, model, attachments, usedSearch, searchSources }: MessageBubbleProps) {
  const [copied, setCopied] = useState<string | null>(null);

  function handleCopy(code: string, id: string) {
    navigator.clipboard.writeText(code);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  if (role === "user") {
    return (
      <div className="flex items-start gap-3 justify-end">
        <div className="max-w-[80%] space-y-2">
          {/* Attachment chips */}
          {attachments && attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 justify-end">
              {attachments.map((att, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 bg-indigo-500/20 text-indigo-300 text-[10px] px-2 py-1 rounded-md"
                >
                  {att.mimeType.startsWith("image/") ? (
                    <ImageIcon className="w-2.5 h-2.5" />
                  ) : (
                    <FileText className="w-2.5 h-2.5" />
                  )}
                  {att.filename}
                </span>
              ))}
            </div>
          )}
          <div className="bg-indigo-600/90 text-white rounded-2xl rounded-tr-sm px-4 py-2.5">
            <p className="text-sm whitespace-pre-wrap">{content}</p>
          </div>
        </div>
        <div className="w-7 h-7 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
          <User className="w-3.5 h-3.5 text-indigo-300" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-3.5 h-3.5 text-emerald-300" />
      </div>
      <div className="max-w-[85%] space-y-2">
        {/* Search indicator */}
        {usedSearch && (
          <div className="flex items-center gap-1.5 text-[10px] text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-md px-2.5 py-1.5 w-fit">
            <Globe className="w-3 h-3" />
            <span>Searched the web</span>
          </div>
        )}

        <div className="text-sm text-zinc-200 leading-relaxed prose prose-invert prose-sm max-w-none">
          <ReactMarkdown
            components={{
              code({ className, children, ...props }) {
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
            {content}
          </ReactMarkdown>
        </div>

        {/* Search sources */}
        {searchSources && searchSources.length > 0 && (
          <div className="border border-[var(--border)] rounded-lg overflow-hidden mt-2">
            <div className="px-3 py-1.5 bg-zinc-900/50 border-b border-[var(--border)]">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Sources</span>
            </div>
            <div className="px-3 py-2 space-y-1.5">
              {searchSources.slice(0, 4).map((source, i) => (
                <a
                  key={i}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 transition group"
                >
                  <ExternalLink className="w-3 h-3 shrink-0" />
                  <span className="truncate group-hover:underline">{source.title || source.url}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {model && (
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider">
            via {model}
          </span>
        )}
      </div>
    </div>
  );
}
