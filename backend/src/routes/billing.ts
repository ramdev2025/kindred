/**
 * Billing & Quota API Routes (Phase 6.1)
 *
 * Provides endpoints for checking usage quotas and (future) billing management.
 */
import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { getUserByClerkIdSQLite, getQuotaSummary, getOrCreateQuota } from '../db/sqlite';

export const billingRouter = Router();
billingRouter.use(requireAuth as any);

/**
 * GET /api/billing/usage
 * Returns the user's current usage summary (tokens, sandboxes, projects).
 */
billingRouter.get('/usage', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = getUserByClerkIdSQLite(req.clerkId!) as any;
    if (!user) return res.status(401).json({ error: 'User not found' });

    const summary = getQuotaSummary(user.id);

    res.json({ usage: summary });
  } catch (err: any) {
    console.error('[Billing] usage error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/billing/quota
 * Returns raw quota info for the current user.
 */
billingRouter.get('/quota', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = getUserByClerkIdSQLite(req.clerkId!) as any;
    if (!user) return res.status(401).json({ error: 'User not found' });

    const quota = getOrCreateQuota(user.id);

    res.json({ quota });
  } catch (err: any) {
    console.error('[Billing] quota error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/billing/tiers
 * Returns available pricing tiers for upgrade comparison.
 */
billingRouter.get('/tiers', async (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    tiers: [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        tokens: 50_000,
        sandboxes: 3,
        projects: 5,
        features: ['Basic AI models', 'Community support', 'Public templates'],
      },
      {
        id: 'pro',
        name: 'Pro',
        price: 19,
        tokens: 500_000,
        sandboxes: 20,
        projects: 50,
        features: ['All AI models', 'Priority support', 'Custom templates', 'Team sharing (2 seats)'],
      },
      {
        id: 'team',
        name: 'Team',
        price: 49,
        tokens: 2_000_000,
        sandboxes: 50,
        projects: 200,
        features: ['All Pro features', 'Unlimited team seats', 'SSO', 'Admin dashboard', 'Custom integrations'],
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        price: -1, // custom pricing
        tokens: -1,
        sandboxes: -1,
        projects: -1,
        features: ['Unlimited everything', 'SLA', 'Dedicated support', 'On-premise option', 'Custom AI fine-tuning'],
      },
    ],
  });
});
