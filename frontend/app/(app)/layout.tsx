"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { fetchProjects, createProject } from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import { ToastProvider } from "@/components/ToastProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { KeyboardShortcutsProvider } from "@/components/KeyboardShortcuts";

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
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    <ThemeProvider>
      <ToastProvider>
        <KeyboardShortcutsProvider>
          <div className="h-screen flex overflow-hidden">
            {/* Mobile sidebar overlay */}
            <div
              className={`sidebar-overlay ${sidebarOpen ? "visible" : ""}`}
              onClick={() => setSidebarOpen(false)}
            />

            {/* Sidebar — with mobile-open class */}
            <div className={`${sidebarOpen ? "mobile-open" : ""}`}>
              <Sidebar
                projects={projects.map((p) => ({ id: p.id, name: p.name }))}
                onMobileClose={() => setSidebarOpen(false)}
              />
            </div>

            {/* Main content */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Mobile menu button — only visible on small screens */}
              <button
                className="mobile-menu-btn items-center gap-2 px-4 py-2 text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-b border-[var(--border)] bg-[var(--background)]"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar menu"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-2">
                  <path d="M3 12h18M3 6h18M3 18h18" />
                </svg>
                <span className="uppercase tracking-wider">Menu</span>
              </button>
              {children}
            </div>
          </div>
        </KeyboardShortcutsProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
