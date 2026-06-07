import type { Context, Next } from 'hono';
import { getSupabaseAdmin } from '../lib/supabase';
import type { AppContext } from '../index';

/**
 * Optional auth middleware — extracts user from Bearer token.
 * Sets `c.set('userId', ...)` if token is valid.
 * Does NOT block requests — routes decide whether auth is required.
 */
export async function authMiddleware(c: Context<AppContext>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const supabase = getSupabaseAdmin(c.env);
    const { data } = await supabase.auth.getUser(token);
    if (data.user) {
      c.set('userId', data.user.id);
    }
  }
  await next();
}

/** Require auth — returns 401 if no valid user */
export async function requireAuth(c: Context<AppContext>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing authorization header' }, 401);
  }

  const token = authHeader.slice(7);
  const supabase = getSupabaseAdmin(c.env);
  const { data } = await supabase.auth.getUser(token);

  if (!data.user) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  c.set('userId', data.user.id);
  await next();
}
