"use client";

import { useState, useEffect } from "react";
import { X, Database, Plus, Trash2, Table, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@clerk/nextjs";
import {
  connectDatabase,
  fetchDatabases,
  deleteDatabase,
  getDatabaseSchema,
  DatabaseConnection,
  TableSchema,
} from "../lib/databases";

interface DatabaseModalProps {
  open: boolean;
  onClose: () => void;
}

export default function DatabaseModal({ open, onClose }: DatabaseModalProps) {
  const { getToken } = useAuth();
  const [view, setView] = useState<"list" | "add" | "schema">("list");
  const [connections, setConnections] = useState<DatabaseConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedConn, setSelectedConn] = useState<DatabaseConnection | null>(null);
  const [tables, setTables] = useState<TableSchema[]>([]);

  // Form state
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("postgres");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("5432");
  const [dbName, setDbName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [sslEnabled, setSslEnabled] = useState(false);

  useEffect(() => {
    if (open) loadConnections();
  }, [open]);

  async function loadConnections() {
    try {
      const token = await getToken();
      if (!token) return;
      const conns = await fetchDatabases(token);
      setConnections(conns);
    } catch (err) {
      console.error("Failed to load DB connections:", err);
    }
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      await connectDatabase(token, {
        name, provider, host, port: parseInt(port), database_name: dbName, username, password, ssl_enabled: sslEnabled,
      });
      setName(""); setHost(""); setPort("5432"); setDbName(""); setUsername(""); setPassword("");
      setView("list");
      await loadConnections();
    } catch (err: any) {
      setError(err.response?.data?.error || "Connection failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const token = await getToken();
      if (!token) return;
      await deleteDatabase(token, id);
      setConnections((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Failed to delete connection:", err);
    }
  }

  async function handleViewSchema(conn: DatabaseConnection) {
    setSelectedConn(conn);
    setView("schema");
    try {
      const token = await getToken();
      if (!token) return;
      const t = await getDatabaseSchema(token, conn.id);
      setTables(t);
    } catch (err) {
      console.error("Failed to load schema:", err);
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
                  {(view === "add" || view === "schema") && (
                    <button onClick={() => setView("list")} className="p-1.5 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)]">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  )}
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <Database className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">
                      {view === "list" ? "Databases" : view === "add" ? "Add Database" : selectedConn?.name}
                    </h2>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {view === "list" ? "Manage database connections" : view === "add" ? "Connect a new database" : "Schema browser"}
                    </p>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)]">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {view === "list" && (
                <div className="space-y-3">
                  {connections.length === 0 ? (
                    <p className="text-sm text-[var(--muted-foreground)] text-center py-8">No database connections yet.</p>
                  ) : (
                    connections.map((conn) => (
                      <div key={conn.id} className="flex items-center gap-3 p-3 bg-[var(--muted)] border border-[var(--border)] rounded-lg">
                        <Database className="w-4 h-4 text-purple-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{conn.name}</p>
                          <p className="text-xs text-[var(--muted-foreground)]">{conn.provider} &middot; {conn.host}:{conn.port}/{conn.database_name}</p>
                        </div>
                        <button onClick={() => handleViewSchema(conn)} className="px-2 py-1 text-xs bg-purple-500/10 text-purple-400 rounded hover:bg-purple-500/20 transition">
                          Schema
                        </button>
                        <button onClick={() => handleDelete(conn.id)} className="p-1.5 text-red-400/60 hover:text-red-400 transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                  <button
                    onClick={() => setView("add")}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-[var(--border)] hover:border-purple-500/50 rounded-lg text-sm text-[var(--muted-foreground)] hover:text-purple-400 transition"
                  >
                    <Plus className="w-4 h-4" />
                    Add Database
                  </button>
                </div>
              )}

              {view === "add" && (
                <form onSubmit={handleConnect} className="space-y-4">
                  {error && <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded">{error}</p>}
                  <div>
                    <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">Name</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Production DB" autoFocus className="w-full px-4 py-2.5 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">Provider</label>
                    <select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full px-4 py-2.5 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-sm text-white focus:outline-none focus:border-purple-500 transition">
                      <option value="postgres">PostgreSQL</option>
                      <option value="mysql">MySQL</option>
                      <option value="supabase">Supabase</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">Host</label>
                      <input type="text" value={host} onChange={(e) => setHost(e.target.value)} placeholder="localhost" className="w-full px-4 py-2.5 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">Port</label>
                      <input type="number" value={port} onChange={(e) => setPort(e.target.value)} className="w-full px-4 py-2.5 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-sm text-white focus:outline-none focus:border-purple-500 transition" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">Database</label>
                    <input type="text" value={dbName} onChange={(e) => setDbName(e.target.value)} placeholder="myapp" className="w-full px-4 py-2.5 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">Username</label>
                      <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="postgres" className="w-full px-4 py-2.5 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">Password</label>
                      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" className="w-full px-4 py-2.5 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition" />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] cursor-pointer">
                    <input type="checkbox" checked={sslEnabled} onChange={(e) => setSslEnabled(e.target.checked)} className="rounded border-[var(--border)]" />
                    Enable SSL
                  </label>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setView("list")} className="flex-1 px-4 py-2.5 bg-[var(--muted)] hover:bg-zinc-700 text-sm font-medium rounded-lg transition">Cancel</button>
                    <button type="submit" disabled={!name || !host || !dbName || !username || loading} className="flex-1 gradient-btn px-4 py-2.5 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
                      {loading ? "Connecting..." : "Connect"}
                    </button>
                  </div>
                </form>
              )}

              {view === "schema" && (
                <div className="space-y-3">
                  {tables.length === 0 ? (
                    <p className="text-sm text-[var(--muted-foreground)] text-center py-4">Loading schema...</p>
                  ) : (
                    tables.map((tbl) => (
                      <details key={tbl.table_name} className="bg-[var(--muted)] border border-[var(--border)] rounded-lg overflow-hidden">
                        <summary className="flex items-center gap-2 p-3 cursor-pointer hover:bg-white/5">
                          <Table className="w-3.5 h-3.5 text-purple-400" />
                          <span className="text-sm font-medium text-white">{tbl.table_name}</span>
                          <span className="text-xs text-[var(--muted-foreground)] ml-auto">{tbl.columns.length} cols</span>
                        </summary>
                        <div className="px-3 pb-3 space-y-1">
                          {tbl.columns.map((col) => (
                            <div key={col.column_name} className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                              <span className="text-white/80 font-mono">{col.column_name}</span>
                              <span className="text-purple-400/60">{col.data_type}</span>
                              {col.is_nullable === "NO" && <span className="text-yellow-500/60">NOT NULL</span>}
                            </div>
                          ))}
                        </div>
                      </details>
                    ))
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
