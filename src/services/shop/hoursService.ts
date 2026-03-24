import { supabaseAdmin } from '../../config/supabase';
import { HttpError, handleSupabaseError } from '../../utils/errors';

export interface ShopHour {
  day_of_week: number; // 0=Sunday, 6=Saturday
  open_time?: string;  // HH:MM
  close_time?: string; // HH:MM
  is_closed: boolean;
}

export async function setHours(shopId: string, hours: ShopHour[]) {
  for (const h of hours) {
    if (h.day_of_week < 0 || h.day_of_week > 6) {
      throw new HttpError(422, 'INVALID_DAY', 'day_of_week must be between 0 (Sunday) and 6 (Saturday)');
    }
  }

  const records = hours.map((h) => ({
    shop_id: shopId,
    day_of_week: h.day_of_week,
    open_time: h.open_time ?? null,
    close_time: h.close_time ?? null,
    is_closed: h.is_closed,
  }));

  const { data, error } = await supabaseAdmin
    .from('shop_hours')
    .upsert(records, { onConflict: 'shop_id,day_of_week' })
    .select();

  if (error) handleSupabaseError(error);
  return data ?? [];
}

export async function getHours(shopId: string) {
  const { data, error } = await supabaseAdmin
    .from('shop_hours')
    .select('*')
    .eq('shop_id', shopId)
    .order('day_of_week');

  if (error) handleSupabaseError(error);
  return data ?? [];
}

export function isShopOpen(hours: ShopHour[], now: Date = new Date()): {
  isOpen: boolean;
  nextOpenTime: string | null;
} {
  const dayOfWeek = now.getDay();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const todayHours = hours.find((h) => h.day_of_week === dayOfWeek);

  if (!todayHours || todayHours.is_closed) {
    // Find next open day
    for (let i = 1; i <= 7; i++) {
      const nextDay = (dayOfWeek + i) % 7;
      const nextHours = hours.find((h) => h.day_of_week === nextDay && !h.is_closed);
      if (nextHours?.open_time) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return { isOpen: false, nextOpenTime: `${dayNames[nextDay]} at ${nextHours.open_time}` };
      }
    }
    return { isOpen: false, nextOpenTime: null };
  }

  if (!todayHours.open_time || !todayHours.close_time) {
    return { isOpen: true, nextOpenTime: null }; // no time set = always open
  }

  const isOpen = currentTime >= todayHours.open_time && currentTime <= todayHours.close_time;
  return { isOpen, nextOpenTime: isOpen ? null : todayHours.open_time };
}
