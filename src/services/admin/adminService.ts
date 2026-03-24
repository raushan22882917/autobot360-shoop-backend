import { supabaseAdmin } from '../../config/supabase';
import { HttpError, handleSupabaseError } from '../../utils/errors';
import { triggerSettlement } from '../payment/paymentService';

export interface UnsettledOrdersSummary {
  shop_owner_id: string;
  shop_owner_name: string;
  shop_id: string;
  shop_name: string;
  total_order_amount: number;
  commission_amount: number;
  settled_amount: number;
  order_count: number;
  orders: Array<{
    id: string;
    created_at: string;
    grand_total: number;
  }>;
}

export interface SettlementFilters {
  shop_id?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  date_from?: string;
  date_to?: string;
}

export interface PlatformEarnings {
  total_gmv: number;
  total_commission_earned: number;
  total_settled_to_shops: number;
  total_pending_settlement: number;
  total_orders: number;
  paid_orders: number;
  settled_orders: number;
}

export async function getUnsettledOrders(): Promise<UnsettledOrdersSummary[]> {
  const { data: orders, error } = await supabaseAdmin
    .from('orders')
    .select(`
      id,
      created_at,
      payment_snapshot,
      platform_commission_amount,
      shop_settlement_amount,
      shop_id,
      shops!inner(
        name,
        user_id,
        users!inner(
          name
        )
      )
    `)
    .eq('payment_status', 'paid')
    .is('settlement_id', null)
    .order('created_at', { ascending: false });

  if (error) handleSupabaseError(error);

  // Group by shop owner
  const grouped = new Map<string, UnsettledOrdersSummary>();

  for (const order of orders || []) {
    const shop = order.shops as any;
    const user = shop.users as any;
    const key = shop.user_id;

    if (!grouped.has(key)) {
      grouped.set(key, {
        shop_owner_id: shop.user_id,
        shop_owner_name: user.name || 'Unknown',
        shop_id: order.shop_id,
        shop_name: shop.name,
        total_order_amount: 0,
        commission_amount: 0,
        settled_amount: 0,
        order_count: 0,
        orders: [],
      });
    }

    const summary = grouped.get(key)!;
    const grandTotal = Number((order.payment_snapshot as any)?.grand_total ?? 0);
    
    summary.total_order_amount += grandTotal;
    summary.commission_amount += Number(order.platform_commission_amount);
    summary.settled_amount += Number(order.shop_settlement_amount);
    summary.order_count += 1;
    summary.orders.push({
      id: order.id,
      created_at: order.created_at,
      grand_total: grandTotal,
    });
  }

  return Array.from(grouped.values());
}

export async function bulkSettle(): Promise<{
  settled_shops: number;
  total_amount: number;
  settlements: Array<{
    shop_owner_id: string;
    shop_name: string;
    settlement_id: string;
    settled_amount: number;
    order_count: number;
  }>;
  errors: Array<{
    shop_owner_id: string;
    shop_name: string;
    error: string;
  }>;
}> {
  const unsettled = await getUnsettledOrders();
  
  // Check minimum threshold for each shop
  const { data: settings } = await supabaseAdmin
    .from('platform_settings')
    .select('value')
    .eq('key', 'min_settlement_threshold')
    .single();

  const minThreshold = parseFloat(settings?.value ?? '100');
  
  const eligibleShops = unsettled.filter(shop => shop.settled_amount >= minThreshold);
  
  const settlements: any[] = [];
  const errors: any[] = [];

  for (const shop of eligibleShops) {
    try {
      const result = await triggerSettlement(shop.shop_owner_id);
      settlements.push({
        shop_owner_id: shop.shop_owner_id,
        shop_name: shop.shop_name,
        settlement_id: result.settlement_id,
        settled_amount: result.settled_amount,
        order_count: result.order_count,
      });
    } catch (err: any) {
      errors.push({
        shop_owner_id: shop.shop_owner_id,
        shop_name: shop.shop_name,
        error: err.message || 'Unknown error',
      });
    }
  }

  return {
    settled_shops: settlements.length,
    total_amount: settlements.reduce((sum, s) => sum + s.settled_amount, 0),
    settlements,
    errors,
  };
}

export async function getSettlementHistory(filters: SettlementFilters = {}): Promise<{
  settlements: Array<{
    id: string;
    shop_name: string;
    shop_owner_name: string;
    total_order_amount: number;
    commission_amount: number;
    settled_amount: number;
    status: string;
    settled_at?: string;
    created_at: string;
    order_count: number;
  }>;
  total: number;
}> {
  let query = supabaseAdmin
    .from('shop_settlements')
    .select(`
      *,
      shops!inner(
        name,
        user_id,
        users!inner(
          name
        )
      )
    `, { count: 'exact' });

  if (filters.shop_id) {
    query = query.eq('shop_id', filters.shop_id);
  }

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  if (filters.date_from) {
    query = query.gte('created_at', filters.date_from);
  }

  if (filters.date_to) {
    query = query.lte('created_at', filters.date_to);
  }

  const { data: settlements, error, count } = await query
    .order('created_at', { ascending: false });

  if (error) handleSupabaseError(error);

  const result = (settlements || []).map((settlement: any) => {
    const shop = settlement.shops as any;
    const user = shop.users as any;
    
    return {
      id: settlement.id,
      shop_name: shop.name,
      shop_owner_name: user.name || 'Unknown',
      total_order_amount: Number(settlement.total_order_amount),
      commission_amount: Number(settlement.commission_amount),
      settled_amount: Number(settlement.settled_amount),
      status: settlement.status,
      settled_at: settlement.settled_at,
      created_at: settlement.created_at,
      order_count: Array.isArray(settlement.order_ids) ? settlement.order_ids.length : 0,
    };
  });

  return {
    settlements: result,
    total: count || 0,
  };
}

export async function getPlatformEarnings(): Promise<PlatformEarnings> {
  // Get total orders and GMV
  const { data: ordersStats, error: ordersError } = await supabaseAdmin
    .from('orders')
    .select('payment_snapshot, payment_status');

  if (ordersError) handleSupabaseError(ordersError);

  const totalOrders = ordersStats?.length || 0;
  let totalGMV = 0;
  let paidOrders = 0;

  for (const order of ordersStats || []) {
    const grandTotal = Number((order.payment_snapshot as any)?.grand_total ?? 0);
    totalGMV += grandTotal;
    if (order.payment_status === 'paid') {
      paidOrders++;
    }
  }

  // Get commission and settlement data
  const { data: settlements, error: settlementError } = await supabaseAdmin
    .from('shop_settlements')
    .select('commission_amount, settled_amount, status, order_ids');

  if (settlementError) handleSupabaseError(settlementError);

  let totalCommissionEarned = 0;
  let totalSettledToShops = 0;
  let totalPendingSettlement = 0;
  let settledOrders = 0;

  for (const settlement of settlements || []) {
    totalCommissionEarned += Number(settlement.commission_amount);
    
    if (settlement.status === 'completed') {
      totalSettledToShops += Number(settlement.settled_amount);
      settledOrders += Array.isArray(settlement.order_ids) ? settlement.order_ids.length : 0;
    } else if (settlement.status === 'pending' || settlement.status === 'processing') {
      totalPendingSettlement += Number(settlement.settled_amount);
    }
  }

  return {
    total_gmv: totalGMV,
    total_commission_earned: totalCommissionEarned,
    total_settled_to_shops: totalSettledToShops,
    total_pending_settlement: totalPendingSettlement,
    total_orders: totalOrders,
    paid_orders: paidOrders,
    settled_orders: settledOrders,
  };
}

export async function listUsers(page: number = 1, limit: number = 50): Promise<{
  users: Array<{
    id: string;
    phone: string;
    name?: string;
    role: string;
    plan: string;
    subscription_status?: string;
    onboarding_complete: boolean;
    created_at: string;
  }>;
  total: number;
  page: number;
  limit: number;
}> {
  const offset = (page - 1) * limit;

  const { data: users, error, count } = await supabaseAdmin
    .from('users')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) handleSupabaseError(error);

  return {
    users: users || [],
    total: count || 0,
    page,
    limit,
  };
}

export async function updateUserRole(
  targetId: string,
  newRole: 'admin' | 'shop_owner' | 'user',
  currentUserId: string
): Promise<void> {
  // Prevent self-escalation
  if (targetId === currentUserId) {
    throw new HttpError(403, 'SELF_ESCALATION', 'Cannot modify your own role');
  }

  const { error } = await supabaseAdmin
    .from('users')
    .update({ role: newRole, updated_at: new Date().toISOString() })
    .eq('id', targetId);

  if (error) handleSupabaseError(error);
}
