/**
 * Billing & Quota API Routes (Phase 6.1)
 *
 * Provides endpoints for checking usage quotas and (future) billing management.
 */
import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { getUserByClerkIdSQLite, getQuotaSummary, getOrCreateQuota, upgradeUserTier } from '../db/sqlite';

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

// --- PayPal Integration ---

const PAYPAL_API = process.env.PAYPAL_ENVIRONMENT === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

async function generatePayPalAccessToken() {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    body: 'grant_type=client_credentials',
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });
  const data = await response.json() as any;
  if (!response.ok) throw new Error(data.error_description || 'Failed to generate PayPal token');
  return data.access_token;
}

billingRouter.post('/paypal/create-order', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tierId } = req.body;
    
    // Hardcoded prices for now based on tiers array above
    const prices: Record<string, string> = { pro: '19.00', team: '49.00' };
    if (!prices[tierId]) return res.status(400).json({ error: 'Invalid tier for purchase' });

    const accessToken = await generatePayPalAccessToken();
    const response = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: tierId,
          amount: { currency_code: 'USD', value: prices[tierId] },
          description: `Kindred AI Studio - ${tierId.toUpperCase()} Tier`
        }],
      }),
    });

    const data = await response.json() as any;
    if (!response.ok) throw new Error(data.message || 'Failed to create PayPal order');

    res.json({ id: data.id });
  } catch (err: any) {
    console.error('[PayPal] Create order error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

billingRouter.post('/paypal/capture-order', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderID } = req.body;
    const user = getUserByClerkIdSQLite(req.clerkId!) as any;
    if (!user) return res.status(401).json({ error: 'User not found' });

    const accessToken = await generatePayPalAccessToken();
    const response = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = await response.json() as any;
    if (!response.ok) throw new Error(data.message || 'Failed to capture PayPal order');

    // Order successfully captured. Determine which tier was purchased.
    // In a real app we'd verify the amount matches the reference_id, but here we trust the reference_id 
    // from our own create-order purchase_units.
    const tierId = data.purchase_units[0].reference_id as 'pro' | 'team';
    
    // Upgrade the user in the database
    upgradeUserTier(user.id, tierId);

    res.json({ success: true, tier: tierId });
  } catch (err: any) {
    console.error('[PayPal] Capture order error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
