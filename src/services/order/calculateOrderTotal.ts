import Decimal from 'decimal.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from '../../utils/errors';

Decimal.set({ rounding: Decimal.ROUND_HALF_EVEN }); // banker's rounding

export interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

export interface OrderCalculationInput {
  items: OrderItem[];
  shopId: string;
  couponCode?: string;
  paymentMode: 'online' | 'cod';
}

export interface OrderCalculationResult {
  original_subtotal: number;
  coupon_code: string | null;
  coupon_id: string | null;
  coupon_discount_amount: number;
  discounted_subtotal: number;
  delivery_charge: number;
  is_free_delivery: boolean;
  service_charge_type: 'flat' | 'percentage';
  service_charge_value: number;
  service_charge_amount: number;
  custom_charges: Array<{ name: string; amount: number }>;
  custom_charges_total: number;
  grand_total: number;
  platform_commission_rate: number;
  platform_commission_amount: number;
  shop_settlement_amount: number;
  payment_mode: 'online' | 'cod';
  razorpay_order_id: string | null;
}

async function validateCoupon(code: string, shopId: string, db: SupabaseClient) {
  const { data: coupon } = await db
    .from('shop_coupons')
    .select('*')
    .eq('shop_id', shopId)
    .eq('code', code.toUpperCase())
    .eq('is_active', true)
    .single();

  if (!coupon) {
    throw new HttpError(422, 'INVALID_COUPON', 'Coupon code is invalid or not applicable to this shop');
  }
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    throw new HttpError(422, 'COUPON_EXPIRED', 'This coupon has expired');
  }
  if (coupon.max_usage !== null && coupon.used_count >= coupon.max_usage) {
    throw new HttpError(422, 'COUPON_LIMIT_REACHED', 'This coupon has reached its maximum usage limit');
  }
  return coupon;
}

async function getShopPricing(shopId: string, db: SupabaseClient) {
  const { data } = await db
    .from('shop_pricing')
    .select('*')
    .eq('shop_id', shopId)
    .single();

  // Return defaults if no pricing configured
  return data ?? {
    delivery_charge: 0,
    free_delivery: false,
    free_delivery_threshold: null,
    service_charge_type: 'flat',
    service_charge_value: 0,
    min_order_value: 0,
  };
}

async function getActiveCustomCharges(shopId: string, db: SupabaseClient) {
  const { data } = await db
    .from('shop_custom_charges')
    .select('name, amount')
    .eq('shop_id', shopId)
    .eq('is_active', true);
  return data ?? [];
}

async function getPlatformCommissionRate(db: SupabaseClient): Promise<number> {
  const { data } = await db
    .from('platform_settings')
    .select('value')
    .eq('key', 'platform_commission_rate')
    .single();
  return parseFloat(data?.value ?? '2');
}

export async function calculateOrderTotal(
  input: OrderCalculationInput,
  db: SupabaseClient
): Promise<OrderCalculationResult> {
  // Step 1 — Product subtotal
  const original_subtotal = input.items.reduce(
    (sum, item) => sum.plus(new Decimal(item.price).times(item.quantity)),
    new Decimal(0)
  );

  // Step 2 — Coupon discount
  let coupon_discount_amount = new Decimal(0);
  let coupon_code: string | null = null;
  let coupon_id: string | null = null;

  if (input.couponCode) {
    const coupon = await validateCoupon(input.couponCode, input.shopId, db);
    coupon_code = coupon.code;
    coupon_id = coupon.id;
    if (coupon.discount_type === 'flat') {
      coupon_discount_amount = new Decimal(coupon.discount_value);
    } else {
      coupon_discount_amount = original_subtotal
        .times(coupon.discount_value)
        .dividedBy(100)
        .toDecimalPlaces(2);
    }
  }

  // Step 3 — Discounted subtotal (floor at 0)
  const discounted_subtotal = Decimal.max(
    original_subtotal.minus(coupon_discount_amount),
    new Decimal(0)
  );

  const pricing = await getShopPricing(input.shopId, db);

  // Min order value check
  if (pricing.min_order_value > 0 && discounted_subtotal.lt(pricing.min_order_value)) {
    throw new HttpError(
      422,
      'BELOW_MIN_ORDER',
      `Minimum order value is ₹${pricing.min_order_value}. Your current subtotal is ₹${discounted_subtotal.toFixed(2)}.`
    );
  }

  // Step 4 — Delivery charge
  const is_free_delivery =
    pricing.free_delivery ||
    (pricing.free_delivery_threshold !== null &&
      discounted_subtotal.gte(pricing.free_delivery_threshold));
  const delivery_charge = is_free_delivery
    ? new Decimal(0)
    : new Decimal(pricing.delivery_charge);

  // Step 5 — Service charge
  let service_charge_amount: Decimal;
  if (pricing.service_charge_type === 'flat') {
    service_charge_amount = new Decimal(pricing.service_charge_value);
  } else {
    service_charge_amount = discounted_subtotal
      .times(pricing.service_charge_value)
      .dividedBy(100)
      .toDecimalPlaces(2);
  }

  // Step 6 — Custom charges
  const customCharges = await getActiveCustomCharges(input.shopId, db);
  const custom_charges_total = customCharges.reduce(
    (sum, c) => sum.plus(c.amount),
    new Decimal(0)
  );

  // Step 7 — Grand total
  const grand_total = discounted_subtotal
    .plus(delivery_charge)
    .plus(service_charge_amount)
    .plus(custom_charges_total)
    .toDecimalPlaces(2);

  // Step 8 — Platform commission
  const commissionRate = await getPlatformCommissionRate(db);
  const platform_commission_amount = grand_total
    .times(commissionRate)
    .dividedBy(100)
    .toDecimalPlaces(2);

  // Step 9 — Shop settlement amount
  const shop_settlement_amount = grand_total.minus(platform_commission_amount);

  // Auto-downgrade to COD if grand_total <= 0
  const payment_mode = grand_total.lte(0) ? 'cod' : input.paymentMode;

  return {
    original_subtotal: original_subtotal.toDecimalPlaces(2).toNumber(),
    coupon_code,
    coupon_id,
    coupon_discount_amount: coupon_discount_amount.toDecimalPlaces(2).toNumber(),
    discounted_subtotal: discounted_subtotal.toDecimalPlaces(2).toNumber(),
    delivery_charge: delivery_charge.toDecimalPlaces(2).toNumber(),
    is_free_delivery,
    service_charge_type: pricing.service_charge_type,
    service_charge_value: pricing.service_charge_value,
    service_charge_amount: service_charge_amount.toDecimalPlaces(2).toNumber(),
    custom_charges: customCharges.map((c) => ({ name: c.name, amount: Number(c.amount) })),
    custom_charges_total: custom_charges_total.toDecimalPlaces(2).toNumber(),
    grand_total: grand_total.toNumber(),
    platform_commission_rate: commissionRate,
    platform_commission_amount: platform_commission_amount.toNumber(),
    shop_settlement_amount: shop_settlement_amount.toDecimalPlaces(2).toNumber(),
    payment_mode,
    razorpay_order_id: null,
  };
}

export async function incrementCouponUsage(couponId: string, db: SupabaseClient) {
  await db.rpc('increment_coupon_usage', { p_coupon_id: couponId });
}
