"use client";

import { useState, useEffect } from "react";
import { X, FileText, Table, Download, Upload } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@clerk/nextjs";
import {
  getGoogleAuthUrl,
  getGoogleStatus,
  getGoogleDocs,
  getGoogleSheets,
  importDoc,
  GoogleDoc,
} from "../lib/google";

interface GoogleModalProps {
  open: boolean;
  onClose: () => void;
}

export default function GoogleModal({ open, onClose }: GoogleModalProps) {
  const { getToken } = useAuth();
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState("");
  const [tab, setTab] = useState<"docs" | "sheets">("docs");
  const [docs, setDocs] = useState<GoogleDoc[]>([]);
  const [sheets, setSheets] = useState<GoogleDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);

  useEffect(() => {
    if (open) checkStatus();
  }, [open]);

  async function checkStatus() {
    try {
      const token = await getToken();
      if (!token) return;
      const status = await getGoogleStatus(token);
      setConnected(status.connected);
      if (status.email) setEmail(status.email);
      if (status.connected) loadItems();
    } catch (err) {
      console.error("Google status check failed:", err);
    }
  }

  async function handleConnect() {
    try {
      const token = await getToken();
      if (!token) return;
      const url = await getGoogleAuthUrl(token);
      window.open(url, "_blank", "width=600,height=700");
      const interval = setInterval(async () => {
        const t = await getToken();
        if (!t) return;
        const status = await getGoogleStatus(t);
        if (status.connected) {
          clearInterval(interval);
          setConnected(true);
          if (status.email) setEmail(status.email);
          loadItems();
        }
      }, 2000);
      setTimeout(() => clearInterval(interval), 60000);
    } catch (err) {
      console.error("Google connect failed:", err);
    }
  }

  async function loadItems() {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const [d, s] = await Promise.all([getGoogleDocs(token), getGoogleSheets(token)]);
      setDocs(d);
      setSheets(s);
    } catch (err) {
      console.error("Failed to load Google items:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleImport(docId: string) {
    setImporting(docId);
    try {
      const token = await getToken();
      if (!token) return;
      await importDoc(token, docId);
      // TODO: add content to workspace context
    } catch (err) {
      console.error("Import failed:", err);
    } finally {
      setImporting(null);
    }
  }

  const items = tab === "docs" ? docs : sheets;

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
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">Google Workspace</h2>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {connected ? `Connected as ${email}` : "Connect Google Workspace"}
                    </p>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)]">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {!connected ? (
                <div className="text-center py-8">
                  <p className="text-sm text-[var(--muted-foreground)] mb-4">
                    Connect Google to import Docs and Sheets as context.
                  </p>
                  <button
                    onClick={handleConnect}
                    className="gradient-btn px-6 py-2.5 text-white text-sm font-medium rounded-lg"
                  >
                    Connect Google
                  </button>
                </div>
              ) : (
                <>
                  {/* Tabs */}
                  <div className="flex gap-1 mb-4 p-1 bg-[var(--muted)] rounded-lg">
                    <button
                      onClick={() => setTab("docs")}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${tab === "docs" ? "bg-[var(--card)] text-white" : "text-[var(--muted-foreground)]"}`}
                    >
                      <FileText className="w-3 h-3" /> Docs
                    </button>
                    <button
                      onClick={() => setTab("sheets")}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${tab === "sheets" ? "bg-[var(--card)] text-white" : "text-[var(--muted-foreground)]"}`}
                    >
                      <Table className="w-3 h-3" /> Sheets
                    </button>
                  </div>

                  <div className="space-y-2">
                    {loading ? (
                      <p className="text-sm text-[var(--muted-foreground)] text-center py-4">Loading...</p>
                    ) : items.length === 0 ? (
                      <p className="text-sm text-[var(--muted-foreground)] text-center py-4">No items found.</p>
                    ) : (
                      items.slice(0, 20).map((item) => (
                        <div key={item.id} className="flex items-center gap-3 p-3 bg-[var(--muted)] border border-[var(--border)] rounded-lg">
                          {tab === "docs" ? (
                            <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                          ) : (
                            <Table className="w-4 h-4 text-green-400 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{item.name}</p>
                            <p className="text-xs text-[var(--muted-foreground)]">
                              {new Date(item.modifiedTime).toLocaleDateString()}
                            </p>
                          </div>
                          <button
                            onClick={() => handleImport(item.id)}
                            disabled={importing === item.id}
                            className="px-2.5 py-1 text-xs bg-green-500/10 text-green-400 rounded hover:bg-green-500/20 transition disabled:opacity-50"
                          >
                            {importing === item.id ? "..." : "Import"}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
