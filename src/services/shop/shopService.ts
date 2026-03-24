import { supabaseAdmin } from '../../config/supabase';
import { HttpError, handleSupabaseError, assertFound } from '../../utils/errors';
import { enforcePlanLimit } from '../../middleware/planEnforcement';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PINCODE_REGEX = /^[0-9]{6}$/;

function validateShopFields(data: {
  slug?: string;
  latitude?: number;
  longitude?: number;
  pincode?: string;
  delivery_radius_km?: number;
}) {
  if (data.slug !== undefined && !SLUG_REGEX.test(data.slug)) {
    throw new HttpError(422, 'INVALID_SLUG', 'Slug must contain only lowercase letters, numbers, and hyphens');
  }
  if (data.latitude !== undefined && (data.latitude < -90 || data.latitude > 90)) {
    throw new HttpError(422, 'INVALID_LATITUDE', 'Latitude must be between -90 and 90');
  }
  if (data.longitude !== undefined && (data.longitude < -180 || data.longitude > 180)) {
    throw new HttpError(422, 'INVALID_LONGITUDE', 'Longitude must be between -180 and 180');
  }
  if (data.pincode !== undefined && !PINCODE_REGEX.test(data.pincode)) {
    throw new HttpError(422, 'INVALID_PINCODE', 'Pincode must be exactly 6 digits');
  }
  if (data.delivery_radius_km !== undefined && (data.delivery_radius_km < 1 || data.delivery_radius_km > 5)) {
    throw new HttpError(422, 'INVALID_DELIVERY_RADIUS', 'Delivery radius must be between 1 and 5 km');
  }
}

export async function createShop(userId: string, data: {
  name: string;
  slug: string;
  category: string;
  latitude: number;
  longitude: number;
  address: string;
  city: string;
  pincode: string;
  state: string;
  description?: string;
  logo_url?: string;
  whatsapp_number?: string;
}) {
  validateShopFields(data);
  await enforcePlanLimit(userId, 'shop_count', supabaseAdmin);

  const { data: shop, error } = await supabaseAdmin
    .from('shops')
    .insert({ ...data, user_id: userId })
    .select()
    .single();

  if (error) handleSupabaseError(error);
  return shop;
}

export async function listShops(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('shops')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) handleSupabaseError(error);
  return data ?? [];
}

export async function getShop(shopId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('shops')
    .select('*')
    .eq('id', shopId)
    .eq('user_id', userId)
    .single();

  if (error) handleSupabaseError(error);
  return assertFound(data, 'Shop');
}

export async function getShopBySlug(slug: string) {
  const { data, error } = await supabaseAdmin
    .from('shops')
    .select('*, shop_pricing(*), shop_hours(*)')
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  if (error) handleSupabaseError(error);
  return assertFound(data, 'Shop');
}

export async function updateShop(shopId: string, userId: string, data: Partial<{
  name: string;
  slug: string;
  category: string;
  latitude: number;
  longitude: number;
  address: string;
  city: string;
  pincode: string;
  state: string;
  description: string;
  logo_url: string;
  is_active: boolean;
  online_payment_enabled: boolean;
  whatsapp_number: string;
}>) {
  validateShopFields(data);

  const { data: shop, error } = await supabaseAdmin
    .from('shops')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', shopId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) handleSupabaseError(error);
  return assertFound(shop, 'Shop');
}

export async function deleteShop(shopId: string, userId: string) {
  const { error } = await supabaseAdmin
    .from('shops')
    .delete()
    .eq('id', shopId)
    .eq('user_id', userId);

  if (error) handleSupabaseError(error);
}

export async function updateDeliveryRadius(shopId: string, userId: string, delivery_radius_km: number) {
  validateShopFields({ delivery_radius_km });

  const { data, error } = await supabaseAdmin
    .from('shops')
    .update({ delivery_radius_km, updated_at: new Date().toISOString() })
    .eq('id', shopId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) handleSupabaseError(error);
  return assertFound(data, 'Shop');
}

export async function getShopWithCurrentStatus(shopId: string) {
  const { data: shop, error } = await supabaseAdmin
    .from('shops')
    .select('*, shop_hours(*)')
    .eq('id', shopId)
    .single();

  if (error) handleSupabaseError(error);
  if (!shop) throw new HttpError(404, 'NOT_FOUND', 'Shop not found');

  const now = new Date();
  const dayOfWeek = now.getDay();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const todayHours = (shop.shop_hours as any[])?.find((h: any) => h.day_of_week === dayOfWeek);
  const isOpen = todayHours
    ? !todayHours.is_closed && currentTime >= todayHours.open_time && currentTime <= todayHours.close_time
    : true; // no hours configured = always open

  return { ...shop, is_currently_open: isOpen, today_hours: todayHours ?? null };
}
