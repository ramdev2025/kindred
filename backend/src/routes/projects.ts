import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { findOrCreateUser } from '../db/queries';
import * as db from '../db/queries';

export const projectsRouter = Router();

projectsRouter.use(requireAuth as any);

/**
 * GET /api/projects
 * List all projects for the authenticated user
 */
projectsRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await findOrCreateUser(req.clerkId!, req.clerkId + '@user.clerk', undefined);
    const projects = await db.getProjectsByUser(user.id);
    res.json({ projects });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch projects', details: error.message });
  }
});

/**
 * POST /api/projects
 * Create a new project
 */
projectsRouter.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const user = await findOrCreateUser(req.clerkId!, req.clerkId + '@user.clerk', undefined);
    const project = await db.createProject(user.id, name, description);
    res.status(201).json({ project });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create project', details: error.message });
  }
});

/**
 * GET /api/projects/:id
 * Get a specific project
 */
projectsRouter.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const project = await db.getProjectById(req.params.id as string);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ project });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch project', details: error.message });
  }
});

/**
 * PATCH /api/projects/:id
 * Update a project
 */
projectsRouter.patch('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, description, status } = req.body;
    const updates: Record<string, any> = {};
    if (name) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (status) updates.status = status;

    const project = await db.updateProject(req.params.id as string, updates);
    res.json({ project });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update project', details: error.message });
  }
});

/**
 * DELETE /api/projects/:id
 * Delete a project
 */
projectsRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await db.deleteProject(req.params.id as string);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete project', details: error.message });
  }
});
