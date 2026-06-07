import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { getSupabaseAdmin } from '../lib/supabase';
import type { AppContext } from '../index';

export const settingsRoutes = new Hono<AppContext>();
settingsRoutes.use('*', requireAuth);

// ──── GET /api/settings ────
settingsRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const supabase = getSupabaseAdmin(c.env);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('profiles')
    .select('settings')
    .eq('id', userId)
    .single();

  if (error) {
    return c.json({ error: 'Failed to fetch settings' }, 500);
  }

  return c.json({ settings: data?.settings || {} });
});

// ──── PUT /api/settings ────
settingsRoutes.put('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ settings: Record<string, unknown> }>();
  const supabase = getSupabaseAdmin(c.env);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('profiles')
    .update({ settings: body.settings })
    .eq('id', userId);

  if (error) {
    return c.json({ error: 'Failed to save settings' }, 500);
  }

  return c.json({ ok: true });
});

// ──── GET /api/settings/project/:projectId ────
settingsRoutes.get('/project/:projectId', async (c) => {
  const userId = c.get('userId');
  const projectId = c.req.param('projectId');
  const supabase = getSupabaseAdmin(c.env);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('projects')
    .select('node_prompts')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();

  if (error) {
    return c.json({ error: 'Failed to fetch project prompts' }, 500);
  }

  return c.json({ node_prompts: data?.node_prompts || {} });
});

// ──── PUT /api/settings/project/:projectId ────
settingsRoutes.put('/project/:projectId', async (c) => {
  const userId = c.get('userId');
  const projectId = c.req.param('projectId');
  const body = await c.req.json<{ node_prompts: Record<string, string> }>();
  const supabase = getSupabaseAdmin(c.env);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('projects')
    .update({ node_prompts: body.node_prompts })
    .eq('id', projectId)
    .eq('user_id', userId);

  if (error) {
    return c.json({ error: 'Failed to save project prompts' }, 500);
  }

  return c.json({ ok: true });
});
