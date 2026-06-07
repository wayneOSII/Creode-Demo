import { initializePaddle } from '@paddle/paddle-js';

let paddleInstance: Awaited<ReturnType<typeof initializePaddle>> | null = null;

export async function getPaddle() {
  if (paddleInstance) return paddleInstance;

  const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN || '';
  paddleInstance = await initializePaddle({
    token,
    environment: import.meta.env.PROD ? 'production' : 'sandbox',
  });

  return paddleInstance;
}

export async function openCheckout(priceId: string, userId: string) {
  const paddle = await getPaddle();
  if (!paddle) throw new Error('Paddle not initialized');

  paddle.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customData: { user_id: userId },
  });
}
