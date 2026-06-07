import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { aiRoutes } from './routes/ai';
import { webhookRoutes } from './routes/webhooks';
import { settingsRoutes } from './routes/settings';
import type { Env } from './types/env';

export type AppContext = { Bindings: Env; Variables: { userId: string } };
const app = new Hono<AppContext>();

// ──── Global middleware ────
app.use('*', cors({
  origin: ['http://localhost:5173', 'https://creode.pages.dev'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// ──── Health check ────
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

// ──── Routes ────
app.route('/api/ai', aiRoutes);
app.route('/api/webhooks', webhookRoutes);
app.route('/api/settings', settingsRoutes);

export default app;
