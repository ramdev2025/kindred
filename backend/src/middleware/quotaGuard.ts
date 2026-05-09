/**
 * Quota Enforcement Middleware (Phase 6.1)
 *
 * Checks token budget and sandbox limits before allowing expensive operations.
 * Auto-initializes a free-tier quota for new users.
 */
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { getUserByClerkIdSQLite, checkTokenQuota, checkSandboxQuota, checkProjectQuota } from '../db/sqlite';

/**
 * Middleware: enforce monthly token budget before AI requests.
 * Attach to /api/chat/send and /api/chat/stream.
 */
export function requireTokenBudget(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const user = getUserByClerkIdSQLite(req.clerkId!);
    if (!user) return next(); // auth middleware will catch this later

    const check = checkTokenQuota((user as any).id);
    if (!check.allowed) {
      return res.status(429).json({
        error: 'Monthly token quota exceeded',
        details: `You have used ${check.used.toLocaleString()} of your ${check.limit.toLocaleString()} monthly tokens. Upgrade to Pro for more.`,
        quota: { used: check.used, limit: check.limit, remaining: check.remaining },
        upgradeUrl: '/settings/billing',
      });
    }

    // Attach quota info for downstream recording
    (req as any).quotaUserId = (user as any).id;
    next();
  } catch (err: any) {
    console.warn('[Quota] Token check failed, allowing request:', err.message);
    next(); // fail-open — don't block users if quota system errors
  }
}

/**
 * Middleware: enforce daily sandbox creation limit.
 * Attach to POST /api/sandbox/create.
 */
export function requireSandboxBudget(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const user = getUserByClerkIdSQLite(req.clerkId!);
    if (!user) return next();

    const check = checkSandboxQuota((user as any).id);
    if (!check.allowed) {
      return res.status(429).json({
        error: 'Daily sandbox limit reached',
        details: `You can create ${check.limit} sandboxes per day on your current plan. Upgrade for more.`,
        quota: { remaining: check.remaining, limit: check.limit },
        upgradeUrl: '/settings/billing',
      });
    }

    (req as any).quotaUserId = (user as any).id;
    next();
  } catch (err: any) {
    console.warn('[Quota] Sandbox check failed, allowing request:', err.message);
    next();
  }
}

/**
 * Middleware: enforce project count limit.
 * Attach to POST /api/projects.
 */
export function requireProjectBudget(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const user = getUserByClerkIdSQLite(req.clerkId!);
    if (!user) return next();

    const check = checkProjectQuota((user as any).id);
    if (!check.allowed) {
      return res.status(429).json({
        error: 'Project limit reached',
        details: `You have ${check.current} of ${check.limit} projects on your current plan. Upgrade for more.`,
        quota: { current: check.current, limit: check.limit },
        upgradeUrl: '/settings/billing',
      });
    }

    next();
  } catch (err: any) {
    console.warn('[Quota] Project check failed, allowing request:', err.message);
    next();
  }
}
