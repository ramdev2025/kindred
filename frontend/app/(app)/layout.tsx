"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { fetchProjects, createProject } from "@/lib/api";
import Sidebar from "@/components/Sidebar";

interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      const token = await getToken();
      if (token) {
        const data = await fetchProjects(token);
        setProjects(data || []);
      }
    } catch (err) {
      console.error("Failed to load projects:", err);
    }
  }

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
