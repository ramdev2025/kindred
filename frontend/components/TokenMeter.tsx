"use client";

import { ContextStats } from "@/lib/api";

interface TokenMeterProps {
  contextStats: ContextStats | null;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export default function TokenMeter({ contextStats }: TokenMeterProps) {
  if (!contextStats) return null;

  const { usagePercent, totalSessionTokens, budget } = contextStats;

  // Color based on usage level
  let barColor = "bg-emerald-500";
  let textColor = "text-emerald-400";
  if (usagePercent >= 75) {
    barColor = "bg-red-500";
    textColor = "text-red-400";
  } else if (usagePercent >= 50) {
    barColor = "bg-amber-500";
    textColor = "text-amber-400";
  }

  return (
    <div className="flex items-center gap-2" title={`${formatTokens(totalSessionTokens)} / ${formatTokens(budget)} tokens used (${usagePercent}%)`}>
      <div className="w-16 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.min(usagePercent, 100)}%` }}
        />
      </div>
      <span className={`text-[10px] font-mono ${textColor}`}>
        {usagePercent}%
      </span>
    </div>
  );
}
