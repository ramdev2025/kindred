"use client";

import { useState, useEffect } from "react";
import { X, GitFork, Upload, Download, GitBranch, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@clerk/nextjs";
import {
  getGitHubAuthUrl,
  getGitHubStatus,
  getGitHubRepos,
  importRepo,
  pushToRepo,
  GitHubRepo,
} from "../lib/github";

interface GitHubModalProps {
  open: boolean;
  onClose: () => void;
}

export default function GitHubModal({ open, onClose }: GitHubModalProps) {
  const { getToken } = useAuth();
  const [connected, setConnected] = useState(false);
  const [username, setUsername] = useState("");
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);

  useEffect(() => {
    if (open) checkStatus();
  }, [open]);

  async function checkStatus() {
    try {
      const token = await getToken();
      if (!token) return;
      const status = await getGitHubStatus(token);
      setConnected(status.connected);
      if (status.username) setUsername(status.username);
      if (status.connected) loadRepos();
    } catch (err) {
      console.error("GitHub status check failed:", err);
    }
  }

  async function handleConnect() {
    try {
      const token = await getToken();
      if (!token) return;
      const url = await getGitHubAuthUrl(token);
      window.open(url, "_blank", "width=600,height=700");
      // Poll for connection
      const interval = setInterval(async () => {
        const t = await getToken();
        if (!t) return;
        const status = await getGitHubStatus(t);
        if (status.connected) {
          clearInterval(interval);
          setConnected(true);
          if (status.username) setUsername(status.username);
          loadRepos();
        }
      }, 2000);
      setTimeout(() => clearInterval(interval), 60000);
    } catch (err) {
      console.error("GitHub connect failed:", err);
    }
  }

  async function loadRepos() {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const r = await getGitHubRepos(token);
      setRepos(r);
    } catch (err) {
      console.error("Failed to load repos:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleImport(repo: GitHubRepo) {
    setImporting(repo.full_name);
    try {
      const token = await getToken();
      if (!token) return;
      const [owner, name] = repo.full_name.split("/");
      await importRepo(token, owner, name);
      // TODO: pass files to workspace context
    } catch (err) {
      console.error("Import failed:", err);
    } finally {
      setImporting(null);
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
                  <div className="w-10 h-10 rounded-xl bg-gray-500/10 flex items-center justify-center">
                    <GitFork className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">GitHub</h2>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {connected ? `Connected as ${username}` : "Connect your GitHub account"}
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
                    Connect GitHub to import repos and push code directly.
                  </p>
                  <button
                    onClick={handleConnect}
                    className="gradient-btn px-6 py-2.5 text-white text-sm font-medium rounded-lg"
                  >
                    Connect GitHub
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {loading ? (
                    <p className="text-sm text-[var(--muted-foreground)] text-center py-4">Loading repos...</p>
                  ) : repos.length === 0 ? (
                    <p className="text-sm text-[var(--muted-foreground)] text-center py-4">No repositories found.</p>
                  ) : (
                    repos.slice(0, 20).map((repo) => (
                      <div key={repo.id} className="flex items-center gap-3 p-3 bg-[var(--muted)] border border-[var(--border)] rounded-lg">
                        <GitBranch className="w-4 h-4 text-[var(--muted-foreground)] shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{repo.full_name}</p>
                          {repo.description && (
                            <p className="text-xs text-[var(--muted-foreground)] truncate">{repo.description}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleImport(repo)}
                          disabled={importing === repo.full_name}
                          className="px-2.5 py-1 text-xs bg-blue-500/10 text-blue-400 rounded hover:bg-blue-500/20 transition disabled:opacity-50"
                        >
                          {importing === repo.full_name ? "..." : "Import"}
                        </button>
                      </div>
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
