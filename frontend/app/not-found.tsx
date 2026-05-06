import Link from "next/link";

/**
 * Custom 404 page — shown when a route doesn't match.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="text-6xl font-bold text-zinc-700 mb-4">404</div>
        <h1 className="text-xl font-semibold text-white mb-2">Page not found</h1>
        <p className="text-sm text-zinc-400 mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="px-5 py-2.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 rounded-lg transition"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/"
            className="px-5 py-2.5 text-sm font-medium text-zinc-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
