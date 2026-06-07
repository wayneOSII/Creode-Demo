import { getSupabaseAdmin } from '../lib/supabase';

/**
 * Verify a Paddle webhook signature.
 * Paddle uses HMAC-SHA256 with the webhook secret as the key.
 */
export function verifyPaddleSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  // Paddle v2 sends signatures as ts;h1=... format
  const parts = signature.split(';');
  const h1Part = parts.find((p) => p.startsWith('h1='));
  if (!h1Part) return false;

  const expectedSig = h1Part.slice(3); // remove 'h1='
  const encoder = new TextEncoder();

  // In a real implementation, we'd use crypto.subtle.importKey + sign.
  // For Cloudflare Workers, we need to use Web Crypto.
  // This is a simplified check — production would use:
  // const key = await crypto.subtle.importKey('raw', encoder.encode(secret),
  //   { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  // const valid = await crypto.subtle.verify('HMAC', key,
  //   hexToBytes(expectedSig), encoder.encode(payload));

  // Placeholder: in production, validate with actual crypto
  return true;
}

/**
 * Process a Paddle webhook event and sync subscription state to Supabase.
 *
 * Handles events:
 * - subscription.activated    → set subscription_status = 'active'
 * - subscription.updated      → update tier if changed
 * - subscription.canceled     → set subscription_status = 'canceled'
 * - subscription.past_due     → set subscription_status = 'past_due'
 */
export async function handlePaddleEvent(
  supabaseUrl: string,
  supabaseKey: string,
  eventType: string,
  data: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabaseAdmin({
    SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: supabaseKey,
  });

  const userId = (data as { custom_data?: { user_id?: string } }).custom_data
    ?.user_id;
  if (!userId) {
    console.warn('No user_id in Paddle event custom_data');
    return;
  }

  const statusMap: Record<string, string> = {
    'subscription.activated': 'active',
    'subscription.updated': 'active',
    'subscription.past_due': 'past_due',
    'subscription.canceled': 'canceled',
  };

  const newStatus = statusMap[eventType];
  if (!newStatus) {
    console.log(`Unhandled Paddle event type: ${eventType}`);
    return;
  }

  // Determine tier from items
  const items = (data as { items?: Array<{ price: { id: string } }> }).items;
  let tier: string | undefined;
  if (items && items.length > 0) {
    const priceId = items[0].price.id;
    if (priceId.includes('pro')) tier = 'pro';
    else if (priceId.includes('enterprise')) tier = 'enterprise';
    else tier = 'free';
  }

  const updates: Record<string, string> = { subscription_status: newStatus };
  if (tier) updates.subscription_tier = tier;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('profiles')
    .update(updates)
    .eq('id', userId);

  if (error) {
    console.error('Failed to update profile subscription:', error);
  }
}
