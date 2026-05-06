"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchProjects, createProject, deleteProject } from "@/lib/api";
import ProjectCard from "@/components/ProjectCard";
import PromptBar from "@/components/PromptBar";
import TopBar from "@/components/TopBar";
import { Sparkles, Folder, ArrowRight, Bot } from "lucide-react";

interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export default function DashboardHome() {
  const { getToken, isLoaded: isAuthLoaded } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const prompt = searchParams.get("prompt");
    const mode = searchParams.get("mode") as "build" | "plan" || "build";
    
    if (prompt && isAuthLoaded) {
      handleQuickStart(prompt, undefined, mode);
    }
    loadProjects();
  }, [isAuthLoaded]);

  async function loadProjects() {
    try {
      const token = await getToken();
      if (token) {
        const data = await fetchProjects(token);
        setProjects(data || []);
      }
    } catch (err) {
      console.error("Failed to load projects:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleQuickStart(prompt: string, files?: File[], mode?: "build" | "plan") {
    const token = await getToken();
    if (!token) return;

    const name = prompt.length > 40 ? prompt.slice(0, 40) + "..." : prompt;
    const project = await createProject(token, name, prompt);
    router.push(`/project/${project.id}?prompt=${encodeURIComponent(prompt)}&mode=${mode || "build"}`);
  }

  async function handleDelete(id: string) {
    const token = await getToken();
    if (token) {
      await deleteProject(token, id);
      setProjects(projects.filter((p) => p.id !== id));
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#09090b] relative">
      {/* Background Orbs */}
      <div className="glow-top" />
      <div className="glow-center" />
      <div className="glow-bottom" />

      <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
        <TopBar />

        <div className="flex-1 overflow-y-auto">
          {/* Hero prompt section */}
          <div className="relative max-w-4xl mx-auto px-6 pt-32 pb-24 text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-[13px] font-medium text-blue-400 mb-10">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              New — Try the cloud-based App Builder
            </div>

            <div className="relative">
              <h1 className="text-4xl sm:text-5xl font-bold mb-10 text-white tracking-tight">
                Got an idea, {user?.firstName || "RAMDEV"}?
              </h1>
            </div>

            <div className="max-w-2xl mx-auto">
              <PromptBar
                onSend={handleQuickStart}
                isLoading={false}
                variant="hero"
                placeholder="What would you like to build today?"
              />
            </div>
          </div>

          {/* Projects grid */}
          <div className="max-w-5xl mx-auto px-6 pb-20">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <h2 className="text-sm font-semibold text-white/40 uppercase tracking-wider">Your Projects</h2>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="glass-card p-5 h-32 animate-pulse bg-white/5 rounded-2xl" />
                ))}
              </div>
            ) : projects.length === 0 ? (
              <div className="text-center py-20 glass-card bg-white/5 rounded-3xl">
                <svg viewBox="0 0 24 24" className="w-12 h-12 text-white/10 mx-auto mb-4 fill-none stroke-current stroke-1">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <p className="text-sm text-white/30">
                  No projects yet. Start your first adventure above.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {projects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    id={project.id}
                    name={project.name}
                    description={project.description}
                    updatedAt={project.updated_at}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
