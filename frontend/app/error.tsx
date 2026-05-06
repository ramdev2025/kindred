"use client";

import Link from "next/link";

/**
 * App-level Error Boundary — catches errors in pages/layouts below root layout.
 * Displays a recoverable error screen with retry and navigation options.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-red-500/10 mb-5">
          <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">Something went wrong</h2>
        <p className="text-sm text-zinc-400 mb-1">
          {error.message || "An unexpected error occurred while loading this page."}
        </p>
        {error.digest && (
          <p className="text-xs text-zinc-600 mb-5 font-mono">ID: {error.digest}</p>
        )}
        <div className="flex items-center justify-center gap-3 mt-5">
          <button
            onClick={reset}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 rounded-lg transition"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 text-sm font-medium text-zinc-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
