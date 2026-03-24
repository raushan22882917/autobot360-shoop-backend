import { supabaseAdmin } from '../../config/supabase';
import { HttpError, handleSupabaseError } from '../../utils/errors';

const MAX_CUSTOM_CHARGES = 5;

export async function upsertPricing(shopId: string, data: {
  delivery_charge?: number;
  free_delivery?: boolean;
  free_delivery_threshold?: number | null;
  service_charge_type?: 'flat' | 'percentage';
  service_charge_value?: number;
  min_order_value?: number;
}) {
  if (data.delivery_charge !== undefined && data.delivery_charge < 0) {
    throw new HttpError(422, 'INVALID_DELIVERY_CHARGE', 'Delivery charge must be 0 or greater');
  }
  if (data.service_charge_value !== undefined && data.service_charge_value < 0) {
    throw new HttpError(422, 'INVALID_SERVICE_CHARGE', 'Service charge value must be 0 or greater');
  }
  if (data.service_charge_type === 'percentage' && data.service_charge_value !== undefined && data.service_charge_value > 100) {
    throw new HttpError(422, 'INVALID_SERVICE_CHARGE', 'Percentage service charge cannot exceed 100%');
  }
  if (data.min_order_value !== undefined && data.min_order_value < 0) {
    throw new HttpError(422, 'INVALID_MIN_ORDER', 'Minimum order value must be 0 or greater');
  }

  const { data: pricing, error } = await supabaseAdmin
    .from('shop_pricing')
    .upsert(
      { shop_id: shopId, ...data, updated_at: new Date().toISOString() },
      { onConflict: 'shop_id' }
    )
    .select()
    .single();

  if (error) handleSupabaseError(error);
  return pricing;
}

export async function getPricing(shopId: string) {
  const { data, error } = await supabaseAdmin
    .from('shop_pricing')
    .select('*')
    .eq('shop_id', shopId)
    .single();

  if (error && error.code !== 'PGRST116') handleSupabaseError(error);
  return data ?? null;
}

export async function addCustomCharge(shopId: string, data: { name: string; amount: number }) {
  if (!data.name || data.name.trim().length === 0 || data.name.length > 100) {
    throw new HttpError(422, 'INVALID_CHARGE_NAME', 'Charge name must be 1–100 characters');
  }
  if (data.amount <= 0) {
    throw new HttpError(422, 'INVALID_CHARGE_AMOUNT', 'Charge amount must be greater than 0');
  }

  // Enforce max 5 active custom charges
  const { count } = await supabaseAdmin
    .from('shop_custom_charges')
    .select('id', { count: 'exact', head: true })
    .eq('shop_id', shopId)
    .eq('is_active', true);

  if ((count ?? 0) >= MAX_CUSTOM_CHARGES) {
    throw new HttpError(422, 'MAX_CHARGES_REACHED', `Maximum of ${MAX_CUSTOM_CHARGES} active custom charges allowed`);
  }

  const { data: charge, error } = await supabaseAdmin
    .from('shop_custom_charges')
    .insert({ shop_id: shopId, name: data.name.trim(), amount: data.amount })
    .select()
    .single();

  if (error) handleSupabaseError(error);
  return charge;
}

export async function removeCustomCharge(shopId: string, chargeId: string) {
  const { error } = await supabaseAdmin
    .from('shop_custom_charges')
    .update({ is_active: false })
    .eq('id', chargeId)
    .eq('shop_id', shopId);

  if (error) handleSupabaseError(error);
}

export async function getActiveCustomCharges(shopId: string) {
  const { data, error } = await supabaseAdmin
    .from('shop_custom_charges')
    .select('*')
    .eq('shop_id', shopId)
    .eq('is_active', true);

  if (error) handleSupabaseError(error);
  return data ?? [];
}
