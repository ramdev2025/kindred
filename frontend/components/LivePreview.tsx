"use client";

import { RefreshCw, Monitor, Tablet, Smartphone, ExternalLink } from "lucide-react";
import { useState } from "react";

interface LivePreviewProps {
  url: string | null;
  sandboxId: string | null;
}

type ViewMode = "desktop" | "tablet" | "mobile";

export default function LivePreview({ url, sandboxId }: LivePreviewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("desktop");
  const [key, setKey] = useState(0);

  const widthMap: Record<ViewMode, string> = {
    desktop: "100%",
    tablet: "768px",
    mobile: "375px",
  };

  if (!sandboxId) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0a0a0a]">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
            <Monitor className="w-8 h-8 text-zinc-600" />
          </div>
          <p className="text-sm text-zinc-500 mb-1">No preview available</p>
          <p className="text-xs text-zinc-600">Start a sandbox to see the live preview</p>
        </div>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0a0a0a]">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-zinc-400">Waiting for server to start...</p>
          <p className="text-xs text-zinc-600 mt-1">The preview will appear when the app is running</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode("desktop")}
            className={`p-1.5 rounded ${viewMode === "desktop" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
            title="Desktop"
          >
            <Monitor className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode("tablet")}
            className={`p-1.5 rounded ${viewMode === "tablet" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
            title="Tablet"
          >
            <Tablet className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode("mobile")}
            className={`p-1.5 rounded ${viewMode === "mobile" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
            title="Mobile"
          >
            <Smartphone className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setKey((k) => k + 1)}
            className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
            title="Open in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Preview iframe */}
      <div className="flex-1 flex items-start justify-center overflow-auto p-2">
        <iframe
          key={key}
          src={url}
          className="bg-white rounded-lg shadow-2xl"
          style={{ width: widthMap[viewMode], height: "100%", maxWidth: "100%" }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    </div>
  );
}
