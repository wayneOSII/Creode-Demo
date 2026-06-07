import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;
let _initError: Error | null = null;

function getClient(): SupabaseClient {
  if (_initError) throw _initError;
  if (_client) return _client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    _initError = new Error(
      'Supabase 未設定。請建立 frontend/.env 檔案並設定 VITE_SUPABASE_URL 與 VITE_SUPABASE_ANON_KEY。'
    );
    throw _initError;
  }

  try {
    _client = createClient(url, key, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
    return _client;
  } catch (err) {
    _initError = err instanceof Error ? err : new Error(String(err));
    throw _initError;
  }
}

/**
 * Supabase client — lazy-initialized singleton.
 * Throws a descriptive error if VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing.
 * Works as a drop-in replacement for a top-level `createClient(...)` call.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: SupabaseClient = new Proxy({} as any, {
  get(_target, prop: string) {
    const client = getClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (client as any)[prop];
    // Bind methods so `this` works correctly
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
