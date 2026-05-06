"use client";

import { useState, useEffect } from "react";
import { X, Plus, Trash2, Wifi, WifiOff, Wrench, ChevronLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@clerk/nextjs";
import {
  fetchConnections,
  addConnection,
  deleteConnection,
  testConnection,
  MCPConnection,
} from "../lib/mcp";

interface ConnectionsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ConnectionsModal({ open, onClose }: ConnectionsModalProps) {
  const { getToken } = useAuth();
  const [view, setView] = useState<"list" | "add">("list");
  const [connections, setConnections] = useState<MCPConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; toolCount?: number }>>({});

  // Form state
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [transport, setTransport] = useState("http");
  const [authType, setAuthType] = useState<"none" | "bearer" | "apikey">("none");
  const [authValue, setAuthValue] = useState("");

  useEffect(() => {
    if (open) loadConnections();
  }, [open]);

  async function loadConnections() {
    try {
      const token = await getToken();
      if (!token) return;
      const conns = await fetchConnections(token);
      setConnections(conns);
    } catch (err) {
      console.error("Failed to load connections:", err);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const authConfig: Record<string, any> = {};
      if (authType === "bearer") authConfig.bearerToken = authValue;
      if (authType === "apikey") authConfig.apiKey = authValue;

      await addConnection(token, { name, url, transport, authConfig });
      setName("");
      setUrl("");
      setTransport("http");
      setAuthType("none");
      setAuthValue("");
      setView("list");
      await loadConnections();
    } catch (err) {
      console.error("Failed to add connection:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const token = await getToken();
      if (!token) return;
      await deleteConnection(token, id);
      setConnections((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Failed to delete connection:", err);
    }
  }

  async function handleTest(id: string) {
    try {
      const token = await getToken();
      if (!token) return;
      const result = await testConnection(token, id);
      setTestResults((prev) => ({ ...prev, [id]: result }));
    } catch (err) {
      setTestResults((prev) => ({ ...prev, [id]: { ok: false } }));
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="glass-card w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  {view === "add" && (
                    <button onClick={() => setView("list")} className="p-1.5 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)]">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  )}
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <Wrench className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">{view === "list" ? "MCP Connections" : "Add Connection"}</h2>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {view === "list" ? "Manage your MCP server connections" : "Connect a new MCP server"}
                    </p>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)]">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {view === "list" ? (
                <div className="space-y-3">
                  {connections.length === 0 ? (
                    <p className="text-sm text-[var(--muted-foreground)] text-center py-8">
                      No connections yet. Add your first MCP server.
                    </p>
                  ) : (
                    connections.map((conn) => (
                      <div key={conn.id} className="flex items-center gap-3 p-3 bg-[var(--muted)] border border-[var(--border)] rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{conn.name}</p>
                          <p className="text-xs text-[var(--muted-foreground)] truncate">{conn.url}</p>
                        </div>
                        {testResults[conn.id] && (
                          <span className={`flex items-center gap-1 text-xs ${testResults[conn.id].ok ? "text-green-400" : "text-red-400"}`}>
                            {testResults[conn.id].ok ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                            {testResults[conn.id].ok ? `${testResults[conn.id].toolCount} tools` : "Failed"}
                          </span>
                        )}
                        <button onClick={() => handleTest(conn.id)} className="px-2 py-1 text-xs bg-blue-500/10 text-blue-400 rounded hover:bg-blue-500/20 transition">
                          Test
                        </button>
                        <button onClick={() => handleDelete(conn.id)} className="p-1.5 text-red-400/60 hover:text-red-400 transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                  <button
                    onClick={() => setView("add")}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-[var(--border)] hover:border-blue-500/50 rounded-lg text-sm text-[var(--muted-foreground)] hover:text-blue-400 transition"
                  >
                    <Plus className="w-4 h-4" />
                    Add Connection
                  </button>
                </div>
              ) : (
                <form onSubmit={handleAdd} className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="My MCP Server"
                      autoFocus
                      className="w-full px-4 py-2.5 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">URL</label>
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://mcp-server.example.com"
                      className="w-full px-4 py-2.5 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">Transport</label>
                    <select
                      value={transport}
                      onChange={(e) => setTransport(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 transition"
                    >
                      <option value="http">HTTP (SSE)</option>
                      <option value="stdio">Stdio</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">Authentication</label>
                    <select
                      value={authType}
                      onChange={(e) => setAuthType(e.target.value as any)}
                      className="w-full px-4 py-2.5 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 transition"
                    >
                      <option value="none">None</option>
                      <option value="bearer">Bearer Token</option>
                      <option value="apikey">API Key</option>
                    </select>
                  </div>
                  {authType !== "none" && (
                    <div>
                      <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">
                        {authType === "bearer" ? "Bearer Token" : "API Key"}
                      </label>
                      <input
                        type="password"
                        value={authValue}
                        onChange={(e) => setAuthValue(e.target.value)}
                        placeholder={authType === "bearer" ? "sk-..." : "key-..."}
                        className="w-full px-4 py-2.5 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition"
                      />
                    </div>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setView("list")}
                      className="flex-1 px-4 py-2.5 bg-[var(--muted)] hover:bg-zinc-700 text-sm font-medium rounded-lg transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!name.trim() || !url.trim() || loading}
                      className="flex-1 gradient-btn px-4 py-2.5 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? "Adding..." : "Add Connection"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
