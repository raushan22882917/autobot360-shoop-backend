import type { SupabaseClient } from '@supabase/supabase-js';
import { PLAN_LIMITS } from '../types';
import { HttpError } from '../utils/errors';
import type { Plan } from '../types';

type PlanFeature = 'product_count' | 'order_count' | 'shop_count' | 'whatsapp_bot' | 'bulk_import' | 'analytics';

export async function enforcePlanLimit(
  userId: string,
  feature: PlanFeature,
  db: SupabaseClient,
  shopId?: string
): Promise<void> {
  const { data: user } = await db
    .from('users')
    .select('plan')
    .eq('id', userId)
    .single();

  if (!user) throw new HttpError(401, 'USER_NOT_FOUND', 'User not found');

  const plan = user.plan as Plan;
  const limits = PLAN_LIMITS[plan];

  switch (feature) {
    case 'product_count': {
      if (!shopId) return;
      const { count } = await db
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('shop_id', shopId)
        .eq('is_active', true);
      if ((count ?? 0) >= limits.maxProducts) {
        throw new HttpError(
          403,
          'PLAN_LIMIT_EXCEEDED',
          `Your ${plan} plan allows a maximum of ${limits.maxProducts} products. Upgrade to add more.`
        );
      }
      break;
    }

    case 'shop_count': {
      const { count } = await db
        .from('shops')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      if ((count ?? 0) >= limits.maxShops) {
        throw new HttpError(
          403,
          'PLAN_LIMIT_EXCEEDED',
          `Your ${plan} plan allows a maximum of ${limits.maxShops} shop(s). Upgrade to add more.`
        );
      }
      break;
    }

    case 'whatsapp_bot': {
      if (!limits.whatsappBot) {
        throw new HttpError(
          403,
          'PLAN_LIMIT_EXCEEDED',
          `WhatsApp bot is not available on the ${plan} plan. Upgrade to Pro or Business.`
        );
      }
      break;
    }

    case 'bulk_import': {
      if (!limits.bulkImport) {
        throw new HttpError(
          403,
          'PLAN_LIMIT_EXCEEDED',
          `Bulk import is not available on the ${plan} plan. Upgrade to Pro or Business.`
        );
      }
      break;
    }

    case 'analytics': {
      if (!limits.analytics) {
        throw new HttpError(
          403,
          'PLAN_LIMIT_EXCEEDED',
          `Analytics is not available on the ${plan} plan. Upgrade to Pro or Business.`
        );
      }
      break;
    }
  }
}
