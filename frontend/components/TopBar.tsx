"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import ConnectionsModal from "./ConnectionsModal";
import { fetchConnections } from "../lib/mcp";

interface TopBarProps {
  sandboxActive?: boolean;
  currentModel?: string;
}

export default function TopBar({ sandboxActive, currentModel }: TopBarProps) {
  const pathname = usePathname();
  const { getToken } = useAuth();
  const [showConnections, setShowConnections] = useState(false);
  const [connectionCount, setConnectionCount] = useState(0);

  useEffect(() => {
    loadConnectionCount();
  }, []);

  async function loadConnectionCount() {
    try {
      const token = await getToken();
      if (!token) return;
      const conns = await fetchConnections(token);
      setConnectionCount(conns.length);
    } catch {
      // Ignore - no connections or not authenticated
    }
  }

  const breadcrumb = pathname === "/"
    ? "Dashboard"
    : pathname.startsWith("/project/")
    ? "Workspace"
    : "Dashboard";

  return (
    <>
      <header className={`h-14 border-b border-white/5 ${pathname === "/dashboard" ? "bg-transparent" : "bg-[#09090b]/80 backdrop-blur-md"} flex items-center justify-between px-6 shrink-0 relative z-20`}>
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-medium text-white/40 uppercase tracking-wider">
            {breadcrumb}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {currentModel && (
            <span className="text-[11px] font-medium text-white/60 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full uppercase tracking-tight">
              {currentModel}
            </span>
          )}
          {sandboxActive && (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-blue-400 uppercase tracking-tight">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shadow-[0_0_8px_rgba(96,165,250,0.5)]" />
              Sandbox Live
            </span>
          )}

          {/* Connections button */}
          <button
            onClick={() => setShowConnections(true)}
            className="relative flex items-center gap-2 text-[11px] font-medium px-3 py-1.5 border border-white/10 hover:border-white/20 rounded-lg text-white/40 hover:text-white transition-all uppercase tracking-tight"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-none stroke-current stroke-2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            Connections
            {connectionCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-blue-500 text-white text-[9px] flex items-center justify-center font-bold">
                {connectionCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <ConnectionsModal open={showConnections} onClose={() => { setShowConnections(false); loadConnectionCount(); }} />
    </>
  );
}
