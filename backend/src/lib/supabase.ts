import { createClient } from '@supabase/supabase-js';

/**
 * Supabase admin client — uses service_role key.
 * Only instantiated when env vars are present (avoids startup errors in dev).
 */
let _adminClient: ReturnType<typeof createClient> | null = null;

export function getSupabaseAdmin(env: {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}) {
  if (!_adminClient) {
    _adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _adminClient;
}

/**
 * Supabase user client — uses the user's JWT.
 */
export function getSupabaseClient(env: {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
