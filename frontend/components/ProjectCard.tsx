"use client";

import Link from "next/link";

interface ProjectCardProps {
  id: string;
  name: string;
  description?: string;
  updatedAt: string;
  onDelete: (id: string) => void;
}

export default function ProjectCard({ id, name, description, updatedAt, onDelete }: ProjectCardProps) {
  return (
    <Link href={`/project/${id}`}>
      <div className="glass-card p-5 group cursor-pointer transition-all duration-300 rounded-2xl border-white/5 hover:border-blue-500/30">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-blue-400 fill-none stroke-current stroke-2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-[15px] text-white group-hover:text-blue-400 transition-colors">
                {name}
              </h3>
              {description && (
                <p className="text-xs text-white/40 mt-1 line-clamp-1">
                  {description}
                </p>
              )}
            </div>
          </div>
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-white/20 group-hover:text-blue-400 transition-all opacity-0 group-hover:opacity-100 transform translate-x-[-4px] group-hover:translate-x-0 fill-none stroke-current stroke-2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </div>
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-white/5">
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white/20 fill-none stroke-current stroke-2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          <span className="text-[11px] font-medium text-white/30 uppercase tracking-tight">
            {new Date(updatedAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(id);
            }}
            className="ml-auto text-[11px] font-bold text-white/20 hover:text-red-500/80 transition-colors opacity-0 group-hover:opacity-100"
          >
            DELETE
          </button>
        </div>
      </div>
    </Link>
  );
}
