/** Environment bindings for Cloudflare Workers */
export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  OPENAI_API_KEY: string;
  PADDLE_API_KEY: string;
  PADDLE_WEBHOOK_SECRET: string;
}
