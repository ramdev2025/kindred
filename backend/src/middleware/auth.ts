import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@clerk/backend';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  clerkId?: string;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    const token = authHeader.split(' ')[1];
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });

    if (!payload.sub) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.clerkId = payload.sub;
    next();
  } catch (error) {
    console.error('[Auth] Token verification failed:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}
