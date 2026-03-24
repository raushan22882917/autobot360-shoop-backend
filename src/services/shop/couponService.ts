import { supabaseAdmin } from '../../config/supabase';
import { handleSupabaseError, assertFound, HttpError } from '../../utils/errors';

export interface CreateCouponInput {
  shop_id: string;
  code: string;
  discount_type: 'flat' | 'percentage';
  discount_value: number;
  max_usage?: number;
  expires_at?: string;
}

export async function createCoupon(userId: string, input: CreateCouponInput) {
  const { shop_id, code, discount_type, discount_value, max_usage, expires_at } = input;

  // Verify shop ownership
  const { data: shop, error: shopError } = await supabaseAdmin
    .from('shops')
    .select('id')
    .eq('id', shop_id)
    .eq('user_id', userId)
    .single();

  if (shopError || !shop) {
    throw new HttpError(403, 'FORBIDDEN', 'Shop not found or access denied');
  }

  const { data: coupon, error } = await supabaseAdmin
    .from('shop_coupons')
    .insert({
      shop_id,
      code: code.toUpperCase().trim(),
      discount_type,
      discount_value,
      max_usage: max_usage ?? null,
      expires_at: expires_at ? new Date(expires_at).toISOString() : null,
    })
    .select()
    .single();

  if (error) handleSupabaseError(error);
  return coupon;
}

export async function listCoupons(userId: string, shopId: string) {
  // Verify shop ownership
  const { data: shop, error: shopError } = await supabaseAdmin
    .from('shops')
    .select('id')
    .eq('id', shopId)
    .eq('user_id', userId)
    .single();

  if (shopError || !shop) {
    throw new HttpError(403, 'FORBIDDEN', 'Shop not found or access denied');
  }

  const { data: coupons, error } = await supabaseAdmin
    .from('shop_coupons')
    .select('*')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false });

  if (error) handleSupabaseError(error);
  return coupons ?? [];
}

export async function deleteCoupon(userId: string, couponId: string) {
  // Get coupon and verify shop ownership
  const { data: coupon, error: couponError } = await supabaseAdmin
    .from('shop_coupons')
    .select('shop_id')
    .eq('id', couponId)
    .single();

  assertFound(coupon, 'Coupon');

  const { data: shop, error: shopError } = await supabaseAdmin
    .from('shops')
    .select('id')
    .eq('id', coupon!.shop_id)
    .eq('user_id', userId)
    .single();

  if (shopError || !shop) {
    throw new HttpError(403, 'FORBIDDEN', 'Access denied');
  }

  const { error: deleteError } = await supabaseAdmin
    .from('shop_coupons')
    .delete()
    .eq('id', couponId);

  if (deleteError) handleSupabaseError(deleteError);
}
