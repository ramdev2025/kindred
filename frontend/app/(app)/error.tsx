"use client";

import Link from "next/link";

/**
 * Error boundary for the authenticated app section.
 * Catches workspace/dashboard errors without losing the full page layout.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/10 mb-5">
          <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.1-5.1m0 0L11.42 4.97m-5.1 5.1H21M3 12a9 9 0 1118 0 9 9 0 01-18 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">Workspace Error</h2>
        <p className="text-sm text-zinc-400 mb-1">
          {error.message || "Something went wrong in your workspace."}
        </p>
        {error.digest && (
          <p className="text-xs text-zinc-600 mb-5 font-mono">ID: {error.digest}</p>
        )}
        <div className="flex items-center justify-center gap-3 mt-5">
          <button
            onClick={reset}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 rounded-lg transition"
          >
            Retry
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 text-sm font-medium text-zinc-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
