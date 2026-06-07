import { Hono } from 'hono';
import { verifyPaddleSignature, handlePaddleEvent } from '../services/paddle.service';
import type { AppContext } from '../index';

export const webhookRoutes = new Hono<AppContext>();

// ──── POST /api/webhooks/paddle ────
webhookRoutes.post('/paddle', async (c) => {
  const signature = c.req.header('paddle-signature') || '';

  // Read raw body for signature verification
  const rawBody = await c.req.text();

  // Verify signature
  if (!verifyPaddleSignature(rawBody, signature, c.env.PADDLE_WEBHOOK_SECRET)) {
    console.warn('Invalid Paddle signature');
    return c.json({ error: 'Invalid signature' }, 401);
  }

  let body: { event_type?: string; data?: Record<string, unknown> };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.event_type || !body.data) {
    return c.json({ error: 'Missing event_type or data' }, 400);
  }

  try {
    await handlePaddleEvent(
      c.env.SUPABASE_URL,
      c.env.SUPABASE_SERVICE_ROLE_KEY,
      body.event_type,
      body.data
    );

    return c.json({ received: true });
  } catch (err) {
    console.error('Paddle webhook error:', err);
    // Always return 200 to Paddle to prevent retries
    return c.json({ received: true, error: 'Internal processing error' });
  }
});
