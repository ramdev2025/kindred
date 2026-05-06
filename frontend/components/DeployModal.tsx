"use client";

import { useState, useEffect } from "react";
import { X, Rocket, Globe, ExternalLink, CheckCircle, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@clerk/nextjs";
import {
  deployToVercel,
  deployToNetlify,
  deployToCloudRun,
  getDeployStatus,
  getDeployHistory,
  Deployment,
} from "../lib/deploy";

interface DeployModalProps {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  files?: Array<{ path: string; content: string }>;
}

export default function DeployModal({ open, onClose, projectId, files = [] }: DeployModalProps) {
  const { getToken } = useAuth();
  const [step, setStep] = useState<"provider" | "config" | "deploying" | "done">("provider");
  const [provider, setProvider] = useState<"vercel" | "netlify" | "cloudrun">("vercel");
  const [projectName, setProjectName] = useState("");
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([{ key: "", value: "" }]);
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<Deployment[]>([]);

  useEffect(() => {
    if (open && projectId) loadHistory();
  }, [open, projectId]);

  async function loadHistory() {
    try {
      const token = await getToken();
      if (!token || !projectId) return;
      const h = await getDeployHistory(token, projectId);
      setHistory(h);
    } catch (err) {
      console.error("Failed to load deploy history:", err);
    }
  }

  async function handleDeploy() {
    if (!projectId) return;
    setStep("deploying");
    setError("");
    try {
      const token = await getToken();
      if (!token) return;
      const envObj: Record<string, string> = {};
      envVars.forEach((v) => { if (v.key) envObj[v.key] = v.value; });
      const data = { projectId, name: projectName, envVars: envObj, files };

      let result: Deployment;
      if (provider === "vercel") result = await deployToVercel(token, data);
      else if (provider === "netlify") result = await deployToNetlify(token, data);
      else result = await deployToCloudRun(token, data);

      setDeployment(result);

      // Poll for completion
      const interval = setInterval(async () => {
        const t = await getToken();
        if (!t) return;
        const updated = await getDeployStatus(t, result.id);
        setDeployment(updated);
        if (updated.status === "ready" || updated.status === "error") {
          clearInterval(interval);
          setStep("done");
        }
      }, 3000);
      setTimeout(() => clearInterval(interval), 120000);
    } catch (err: any) {
      setError(err.response?.data?.error || "Deployment failed");
      setStep("config");
    }
  }

  function addEnvVar() {
    setEnvVars([...envVars, { key: "", value: "" }]);
  }

  const providers = [
    { id: "vercel" as const, name: "Vercel", desc: "Serverless deployment" },
    { id: "netlify" as const, name: "Netlify", desc: "JAMstack hosting" },
    { id: "cloudrun" as const, name: "Cloud Run", desc: "Container deployment" },
  ];

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
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                    <Rocket className="w-5 h-5 text-orange-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">Deploy</h2>
                    <p className="text-xs text-[var(--muted-foreground)]">Ship your project to production</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)]">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Provider selection */}
              {step === "provider" && (
                <div className="space-y-3">
                  {providers.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setProvider(p.id); setStep("config"); }}
                      className="w-full flex items-center gap-3 p-4 bg-[var(--muted)] border border-[var(--border)] rounded-lg hover:border-orange-500/50 transition text-left"
                    >
                      <Globe className="w-5 h-5 text-orange-400" />
                      <div>
                        <p className="text-sm font-medium text-white">{p.name}</p>
                        <p className="text-xs text-[var(--muted-foreground)]">{p.desc}</p>
                      </div>
                    </button>
                  ))}
                  {history.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-[var(--border)]">
                      <p className="text-xs font-medium text-[var(--muted-foreground)] mb-2">Recent Deployments</p>
                      {history.slice(0, 3).map((d) => (
                        <div key={d.id} className="flex items-center gap-2 py-1.5 text-xs">
                          <span className={`w-2 h-2 rounded-full ${d.status === "ready" ? "bg-green-400" : d.status === "error" ? "bg-red-400" : "bg-yellow-400"}`} />
                          <span className="text-white/70">{d.provider}</span>
                          {d.url && (
                            <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate ml-auto">
                              {d.url}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Config */}
              {step === "config" && (
                <div className="space-y-4">
                  {error && <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded">{error}</p>}
                  <div>
                    <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">Project Name</label>
                    <input
                      type="text"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      placeholder="my-project"
                      autoFocus
                      className="w-full px-4 py-2.5 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 transition"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">Environment Variables</label>
                    <div className="space-y-2">
                      {envVars.map((v, i) => (
                        <div key={i} className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={v.key}
                            onChange={(e) => { const n = [...envVars]; n[i].key = e.target.value; setEnvVars(n); }}
                            placeholder="KEY"
                            className="px-3 py-2 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 transition font-mono"
                          />
                          <input
                            type="text"
                            value={v.value}
                            onChange={(e) => { const n = [...envVars]; n[i].value = e.target.value; setEnvVars(n); }}
                            placeholder="value"
                            className="px-3 py-2 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 transition font-mono"
                          />
                        </div>
                      ))}
                      <button onClick={addEnvVar} className="text-xs text-[var(--muted-foreground)] hover:text-orange-400 transition">+ Add variable</button>
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setStep("provider")} className="flex-1 px-4 py-2.5 bg-[var(--muted)] hover:bg-zinc-700 text-sm font-medium rounded-lg transition">Back</button>
                    <button onClick={handleDeploy} disabled={!projectName.trim()} className="flex-1 gradient-btn px-4 py-2.5 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
                      Deploy to {provider.charAt(0).toUpperCase() + provider.slice(1)}
                    </button>
                  </div>
                </div>
              )}

              {/* Deploying */}
              {step === "deploying" && (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 text-orange-400 animate-spin mx-auto mb-4" />
                  <p className="text-sm text-white mb-1">Deploying to {provider}...</p>
                  <p className="text-xs text-[var(--muted-foreground)]">This may take a minute</p>
                </div>
              )}

              {/* Done */}
              {step === "done" && deployment && (
                <div className="text-center py-8">
                  {deployment.status === "ready" ? (
                    <>
                      <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-4" />
                      <p className="text-sm text-white mb-2">Deployed successfully!</p>
                      {deployment.url && (
                        <a href={deployment.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:underline">
                          <ExternalLink className="w-3.5 h-3.5" />
                          {deployment.url}
                        </a>
                      )}
                    </>
                  ) : (
                    <>
                      <X className="w-8 h-8 text-red-400 mx-auto mb-4" />
                      <p className="text-sm text-white mb-2">Deployment failed</p>
                      <p className="text-xs text-red-400">{deployment.logs || "Unknown error"}</p>
                    </>
                  )}
                  <button onClick={() => { setStep("provider"); setDeployment(null); }} className="mt-4 px-4 py-2 bg-[var(--muted)] hover:bg-zinc-700 text-sm font-medium rounded-lg transition">
                    Deploy Again
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
