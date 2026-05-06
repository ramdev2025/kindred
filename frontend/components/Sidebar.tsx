"use client";

import { useUser, UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import {
  LayoutDashboard,
  FolderKanban,
  Settings,
  Plus,
  ChevronLeft,
  Sparkles,
} from "lucide-react";

interface SidebarProps {
  projects: Array<{ id: string; name: string }>;
  onNewProject: () => void;
}

export default function Sidebar({ projects }: SidebarProps) {
  const { user } = useUser();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`sidebar h-screen flex flex-col shrink-0 transition-all duration-300 ${
        collapsed ? "w-[68px]" : "w-[260px]"
      }`}
    >
      {/* Logo Area */}
      <div className="px-4 h-[72px] flex items-center justify-between">
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2.5">
            
            <span className="font-bold text-[15px] tracking-tight text-white">Kindred <span className="text-white/40 font-medium">AI Studio</span></span>
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`p-2 rounded-xl hover:bg-white/5 text-white/20 hover:text-white transition-colors ${collapsed ? "mx-auto" : ""}`}
        >
          <svg viewBox="0 0 24 24" className={`w-4 h-4 transition-transform duration-300 ${collapsed ? "rotate-180" : ""} fill-none stroke-current stroke-2`}>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>

      {/* New Project Button - Now a Link to Dashboard Chat */}
      <div className="px-4 mb-6">
        <Link
          href="/dashboard"
          className={`w-full gradient-btn text-white text-[13px] font-bold rounded-xl flex items-center justify-center gap-2 uppercase tracking-wider ${
            collapsed ? "h-10 w-10 p-0 rounded-full mx-auto" : "px-4 py-3"
          }`}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-3">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {!collapsed && "New Project"}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="px-3 space-y-1">
        <Link
          href="/dashboard"
          className={`sidebar-item flex items-center gap-3 text-[13px] uppercase tracking-wide ${
            pathname === "/dashboard" ? "active" : ""
          }`}
        >
          <div className="w-8 h-8 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
          </div>
          {!collapsed && "Dashboard"}
        </Link>
      </nav>

      {/* Projects list */}
      <div className="flex-1 overflow-y-auto px-3 mt-8">
        {!collapsed && (
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/20 px-4 mb-4">
            Projects
          </p>
        )}
        <div className="space-y-1">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/project/${project.id}`}
              className={`sidebar-item flex items-center gap-3 text-[13px] font-medium truncate group ${
                pathname === `/project/${project.id}` ? "active" : ""
              }`}
            >
              <div className="w-8 h-8 flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-white/20 group-hover:text-white/60 transition-colors fill-none stroke-current stroke-2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              {!collapsed && <span className="truncate">{project.name}</span>}
            </Link>
          ))}
        </div>
      </div>

      {/* User */}
      <div className="p-4 mt-auto">
        <div className={`flex items-center gap-3 p-2 rounded-2xl bg-white/5 border border-white/5 ${collapsed ? "justify-center" : ""}`}>
          <UserButton 
            appearance={{
              elements: {
                userButtonAvatarBox: "w-8 h-8 rounded-lg"
              }
            }}
          />
          {!collapsed && (
            <div className="truncate flex-1">
              <p className="text-[12px] font-bold text-white truncate leading-none mb-1">
                {user?.firstName || "User"}
              </p>
              <p className="text-[10px] font-medium text-white/30 truncate leading-none">
                {user?.emailAddresses[0]?.emailAddress}
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
