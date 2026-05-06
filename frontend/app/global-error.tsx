"use client";

/**
 * Global Error Boundary — catches errors in the root layout itself.
 * This is the last resort error handler in Next.js App Router.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="h-full dark">
      <body className="h-full bg-[#09090b] text-white flex items-center justify-center">
        <div className="max-w-md text-center px-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-500/10 mb-6">
            <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
          <p className="text-sm text-zinc-400 mb-6">
            An unexpected error occurred. This has been logged automatically.
          </p>
          {error.digest && (
            <p className="text-xs text-zinc-600 mb-4 font-mono">
              Error ID: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            className="px-5 py-2.5 text-sm font-medium bg-white/10 hover:bg-white/15 border border-white/10 rounded-lg transition"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
