"use client";

import { motion } from "framer-motion";

export type SkillId = "engineer" | "devops" | "security";

export const SKILLS: Record<SkillId, { label: string; emoji: string; description: string; activeColor: string; activeBg: string; activeBorder: string }> = {
  engineer: {
    label:        "Engineer",
    emoji:        "💻",
    description:  "Clean code, design patterns, full-stack",
    activeColor:  "text-emerald-300",
    activeBg:     "bg-emerald-500/15",
    activeBorder: "border-emerald-500/30",
  },
  devops: {
    label:        "DevOps",
    emoji:        "🚀",
    description:  "Containers, CI/CD, cloud infrastructure",
    activeColor:  "text-sky-300",
    activeBg:     "bg-sky-500/15",
    activeBorder: "border-sky-500/30",
  },
  security: {
    label:        "Security",
    emoji:        "🔒",
    description:  "OWASP, threat modeling, secure coding",
    activeColor:  "text-amber-300",
    activeBg:     "bg-amber-500/15",
    activeBorder: "border-amber-500/30",
  },
};

interface SkillSelectorProps {
  value: SkillId;
  onChange: (skill: SkillId) => void;
}

export default function SkillSelector({ value, onChange }: SkillSelectorProps) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-900/60 border border-white/5">
      {(Object.entries(SKILLS) as [SkillId, typeof SKILLS[SkillId]][]).map(([id, skill]) => {
        const isActive = value === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            title={skill.description}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
              isActive
                ? `${skill.activeBg} ${skill.activeBorder} ${skill.activeColor} border`
                : "text-zinc-500 hover:text-zinc-300 border border-transparent hover:bg-white/[0.04]"
            }`}
          >
            {isActive && (
              <motion.div
                layoutId="skill-active-bg"
                className={`absolute inset-0 rounded-lg ${skill.activeBg}`}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10">{skill.emoji}</span>
            <span className="relative z-10">{skill.label}</span>
          </button>
        );
      })}
    </div>
  );
}
