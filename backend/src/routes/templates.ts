/**
 * Templates API Routes (Phase 6.4)
 *
 * Provides CRUD endpoints for the built-in template marketplace.
 * Templates allow one-click project creation from pre-built starters.
 */
import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { getTemplates, getTemplateById, incrementTemplateUseCount } from '../db/sqlite';
import * as db from '../db/queries';

export const templatesRouter = Router();

/**
 * GET /api/templates
 * List all public templates. Optional ?category= filter.
 */
templatesRouter.get('/', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const category = _req.query.category as string | undefined;
    const templates = getTemplates(category);

    // Parse JSON fields for client
    const parsed = (templates as any[]).map((t) => ({
      ...t,
      tech_stack: typeof t.tech_stack === 'string' ? JSON.parse(t.tech_stack) : t.tech_stack,
      files: typeof t.files === 'string' ? JSON.parse(t.files) : t.files,
    }));

    res.json({ templates: parsed });
  } catch (err: any) {
    console.error('[Templates] list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/templates/:id
 * Get a single template by ID.
 */
templatesRouter.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const template = getTemplateById(req.params.id as string) as any;
    if (!template) return res.status(404).json({ error: 'Template not found' });

    template.tech_stack = typeof template.tech_stack === 'string' ? JSON.parse(template.tech_stack) : template.tech_stack;
    template.files = typeof template.files === 'string' ? JSON.parse(template.files) : template.files;

    res.json({ template });
  } catch (err: any) {
    console.error('[Templates] get error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/templates/:id/use
 * Clone a template into a new project. Requires auth.
 * Body: { projectName?: string, customPrompt?: string }
 */
templatesRouter.post('/:id/use', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const template = getTemplateById(req.params.id as string) as any;
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const user = await db.getUserByClerkId(req.clerkId!);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const { projectName, customPrompt } = req.body as { projectName?: string; customPrompt?: string };

    // Create a new project from the template
    const name = projectName || `${template.name} Project`;
    const description = template.description || '';
    const techStack = typeof template.tech_stack === 'string' ? JSON.parse(template.tech_stack) : template.tech_stack;

    const project = await db.createProject(user.id, name, description);

    // Update project with tech stack from template
    if (project) {
      await db.updateProject(project.id, { tech_stack: JSON.stringify(techStack) });
    }

    // Track template usage
    incrementTemplateUseCount(template.id);

    // Build the initial prompt for the chat
    const files = typeof template.files === 'string' ? JSON.parse(template.files) : template.files;
    const templatePrompt = files.prompt || `Create a ${template.name} project`;
    const finalPrompt = customPrompt
      ? `${templatePrompt}\n\nAdditional requirements: ${customPrompt}`
      : templatePrompt;

    res.json({
      project,
      initialPrompt: finalPrompt,
      template: {
        id: template.id,
        name: template.name,
        category: template.category,
      },
    });
  } catch (err: any) {
    console.error('[Templates] use error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
