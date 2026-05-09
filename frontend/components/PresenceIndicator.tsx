"use client";

/**
 * Phase 4.3 — Real-time Collaboration (Basic Presence)
 *
 * This module provides a visual presence indicator showing who's currently
 * viewing the same project workspace. In a production setup, this would
 * connect to a WebSocket/SSE server. For now, it shows the current user
 * with a "live" indicator — the data model is ready for multi-user expansion.
 */

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";

interface ActiveUser {
  id: string;
  name: string;
  avatar?: string;
  color: string;
  lastSeen: Date;
}

const PRESENCE_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
];

function getRandomColor() {
  return PRESENCE_COLORS[Math.floor(Math.random() * PRESENCE_COLORS.length)];
}

interface PresenceIndicatorProps {
  projectId: string;
}

export default function PresenceIndicator({ projectId }: PresenceIndicatorProps) {
  const { user } = useUser();
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);

  useEffect(() => {
    if (!user) return;

    // Current user is always "present"
    const currentUser: ActiveUser = {
      id: user.id,
      name: user.firstName || "You",
      avatar: user.imageUrl,
      color: getRandomColor(),
      lastSeen: new Date(),
    };

    setActiveUsers([currentUser]);

    // In production, this would connect to a presence WebSocket:
    // const ws = new WebSocket(`${WS_URL}/presence/${projectId}`);
    // ws.onmessage = (e) => { setActiveUsers(JSON.parse(e.data)); };
    // ws.send(JSON.stringify({ type: 'join', user: currentUser }));
    // return () => { ws.send(JSON.stringify({ type: 'leave' })); ws.close(); };
  }, [user, projectId]);

  if (activeUsers.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5" title={`${activeUsers.length} user(s) in this workspace`}>
      {/* Stacked avatars */}
      <div className="flex -space-x-2">
        {activeUsers.slice(0, 5).map((u) => (
          <div
            key={u.id}
            className="relative w-6 h-6 rounded-full border-2 flex items-center justify-center text-[9px] font-bold text-white overflow-hidden"
            style={{ borderColor: u.color, background: u.avatar ? undefined : u.color }}
            title={u.name}
          >
            {u.avatar ? (
              <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" />
            ) : (
              u.name.charAt(0).toUpperCase()
            )}
            {/* Live dot */}
            <span
              className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-[var(--background)]"
              style={{ boxShadow: "0 0 4px rgba(16, 185, 129, 0.6)" }}
            />
          </div>
        ))}
      </div>

      {activeUsers.length > 5 && (
        <span className="text-[10px] font-bold" style={{ color: "var(--muted-foreground)" }}>
          +{activeUsers.length - 5}
        </span>
      )}

      {/* Status text */}
      <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
        {activeUsers.length === 1 ? "Only you" : `${activeUsers.length} online`}
      </span>
    </div>
  );
}
