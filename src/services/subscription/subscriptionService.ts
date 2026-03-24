import Razorpay from 'razorpay';
import { env } from '../../config/env';
import { supabaseAdmin } from '../../config/supabase';
import { HttpError } from '../../utils/errors';
import { PLAN_LIMITS } from '../../types';
import type { Plan } from '../../types';

const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

// Razorpay plan IDs — configure these in your Razorpay dashboard
const RAZORPAY_PLAN_IDS: Record<string, string> = {
  pro: process.env.RAZORPAY_PRO_PLAN_ID ?? 'plan_pro',
  business: process.env.RAZORPAY_BUSINESS_PLAN_ID ?? 'plan_business',
};

export async function subscribeToPlan(
  userId: string,
  plan: 'pro' | 'business'
): Promise<{ subscription_id: string; payment_link: string }> {
  const planId = RAZORPAY_PLAN_IDS[plan];
  if (!planId) throw new HttpError(422, 'INVALID_PLAN', 'Invalid subscription plan');

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('phone')
    .eq('id', userId)
    .single();

  if (!user) throw new HttpError(404, 'NOT_FOUND', 'User not found');

  const subscription = await (razorpay as any).subscriptions.create({
    plan_id: planId,
    total_count: 12, // 12 billing cycles
    quantity: 1,
    notify_info: { notify_phone: user.phone },
  });

  await supabaseAdmin
    .from('users')
    .update({
      razorpay_subscription_id: subscription.id,
      subscription_status: 'trialing',
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  return {
    subscription_id: subscription.id,
    payment_link: subscription.short_url ?? `https://rzp.io/l/${subscription.id}`,
  };
}

export async function handleSubscriptionWebhook(payload: {
  event: string;
  payload: { subscription?: { entity: Record<string, any> } };
}): Promise<void> {
  const event = payload.event;
  const subscription = payload.payload?.subscription?.entity;
  if (!subscription) return;

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('razorpay_subscription_id', subscription.id)
    .single();

  if (!user) return;

  if (event === 'subscription.activated') {
    const plan = getPlanFromRazorpayPlanId(subscription.plan_id);
    const expiresAt = subscription.current_end
      ? new Date(subscription.current_end * 1000).toISOString()
      : null;

    await supabaseAdmin
      .from('users')
      .update({
        plan,
        subscription_status: 'active',
        plan_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);
  }

  if (event === 'subscription.cancelled' || event === 'subscription.completed') {
    await supabaseAdmin
      .from('users')
      .update({
        plan: 'free',
        subscription_status: 'cancelled',
        plan_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);
  }

  if (event === 'subscription.charged') {
    const expiresAt = subscription.current_end
      ? new Date(subscription.current_end * 1000).toISOString()
      : null;

    await supabaseAdmin
      .from('users')
      .update({
        subscription_status: 'active',
        plan_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);
  }

  if (event === 'subscription.halted') {
    await supabaseAdmin
      .from('users')
      .update({
        subscription_status: 'past_due',
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);
  }
}

function getPlanFromRazorpayPlanId(planId: string): Plan {
  if (planId === RAZORPAY_PLAN_IDS.business) return 'business';
  if (planId === RAZORPAY_PLAN_IDS.pro) return 'pro';
  return 'free';
}

export async function getSubscriptionStatus(userId: string) {
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('plan, subscription_status, plan_expires_at, razorpay_subscription_id')
    .eq('id', userId)
    .single();

  if (!user) throw new HttpError(404, 'NOT_FOUND', 'User not found');

  const plan = user.plan as Plan;
  const limits = PLAN_LIMITS[plan];

  // Get current usage
  const { data: shops } = await supabaseAdmin
    .from('shops')
    .select('id')
    .eq('user_id', userId);

  const shopIds = (shops ?? []).map((s: any) => s.id);

  let productCount = 0;
  if (shopIds.length > 0) {
    const { count } = await supabaseAdmin
      .from('products')
      .select('id', { count: 'exact', head: true })
      .in('shop_id', shopIds)
      .eq('is_active', true);
    productCount = count ?? 0;
  }

  // Orders this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  let orderCount = 0;
  if (shopIds.length > 0) {
    const { count } = await supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .in('shop_id', shopIds)
      .gte('created_at', startOfMonth.toISOString());
    orderCount = count ?? 0;
  }

  return {
    plan: user.plan,
    subscription_status: user.subscription_status,
    plan_expires_at: user.plan_expires_at,
    limits,
    usage: {
      products: productCount,
      orders_this_month: orderCount,
      shops: shopIds.length,
    },
  };
}

export function getAvailablePlans() {
  return [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      currency: 'INR',
      billing_cycle: null,
      features: PLAN_LIMITS.free,
    },
    {
      id: 'pro',
      name: 'Pro',
      price: 999,
      currency: 'INR',
      billing_cycle: 'monthly',
      razorpay_plan_id: RAZORPAY_PLAN_IDS.pro,
      features: PLAN_LIMITS.pro,
    },
    {
      id: 'business',
      name: 'Business',
      price: 2999,
      currency: 'INR',
      billing_cycle: 'monthly',
      razorpay_plan_id: RAZORPAY_PLAN_IDS.business,
      features: PLAN_LIMITS.business,
    },
  ];
}
