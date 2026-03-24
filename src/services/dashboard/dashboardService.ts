import { supabaseAdmin } from '../../config/supabase';
import { HttpError, handleSupabaseError } from '../../utils/errors';

export interface DashboardStats {
  total_products: number;
  total_orders: number;
  total_earnings: number;
  orders_by_status: {
    pending: number;
    confirmed: number;
    out_for_delivery: number;
    delivered: number;
    cancelled: number;
  };
}

export interface AnalyticsData {
  top_products: Array<{
    id: string;
    name: string;
    total_quantity: number;
    total_revenue: number;
  }>;
  revenue_by_day: Array<{
    date: string;
    revenue: number;
    orders: number;
  }>;
  peak_hours: Array<{
    hour: number;
    orders: number;
  }>;
  fulfilment_rate: number;
  new_vs_returning_customers: {
    new_customers: number;
    returning_customers: number;
  };
}

export interface EarningsBreakdown {
  gross_revenue: number;
  coupon_discounts: number;
  delivery_collected: number;
  service_charge_collected: number;
  custom_charges_collected: number;
  commission_deducted: number;
  net_earnings: number;
}

export async function getStats(
  shopId: string,
  dateRange: { from?: string; to?: string } = {}
): Promise<DashboardStats> {
  let query = supabaseAdmin
    .from('products')
    .select('id', { count: 'exact' })
    .eq('shop_id', shopId)
    .eq('is_active', true);

  const { count: totalProducts, error: productError } = await query;
  if (productError) handleSupabaseError(productError);

  // Get orders in date range
  let ordersQuery = supabaseAdmin
    .from('orders')
    .select('status, payment_snapshot')
    .eq('shop_id', shopId);

  if (dateRange.from) {
    ordersQuery = ordersQuery.gte('created_at', dateRange.from);
  }
  if (dateRange.to) {
    ordersQuery = ordersQuery.lte('created_at', dateRange.to);
  }

  const { data: orders, error: ordersError } = await ordersQuery;
  if (ordersError) handleSupabaseError(ordersError);

  const totalOrders = orders?.length || 0;
  let totalEarnings = 0;
  const ordersByStatus = {
    pending: 0,
    confirmed: 0,
    out_for_delivery: 0,
    delivered: 0,
    cancelled: 0,
  };

  for (const order of orders || []) {
    const grandTotal = Number((order.payment_snapshot as any)?.grand_total ?? 0);
    
    if (order.status === 'delivered') {
      totalEarnings += grandTotal;
    }
    
    if (order.status in ordersByStatus) {
      ordersByStatus[order.status as keyof typeof ordersByStatus]++;
    }
  }

  return {
    total_products: totalProducts || 0,
    total_orders: totalOrders,
    total_earnings: totalEarnings,
    orders_by_status: ordersByStatus,
  };
}

export async function getAnalytics(
  shopId: string,
  dateRange: { from?: string; to?: string } = {}
): Promise<AnalyticsData> {
  const toDate = dateRange.to || new Date().toISOString();
  const fromDate = dateRange.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days ago

  // Get top products
  const { data: orderItems, error: itemsError } = await supabaseAdmin
    .from('orders')
    .select(`
      payment_snapshot,
      created_at
    `)
    .eq('shop_id', shopId)
    .gte('created_at', fromDate)
    .lte('created_at', toDate)
    .eq('status', 'delivered');

  if (itemsError) handleSupabaseError(itemsError);

  // Extract product data from payment snapshots
  const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();

  for (const order of orderItems || []) {
    const snapshot = order.payment_snapshot as any;
    const items = snapshot?.items || [];
    
    for (const item of items) {
      const productId = item.product_id;
      const existing = productMap.get(productId) || { name: item.name, quantity: 0, revenue: 0 };
      
      existing.quantity += item.quantity;
      existing.revenue += Number(item.total_price);
      productMap.set(productId, existing);
    }
  }

  const topProducts = Array.from(productMap.entries())
    .map(([id, data]) => ({ id, name: data.name, total_quantity: data.quantity, total_revenue: data.revenue }))
    .sort((a, b) => b.total_revenue - a.total_revenue)
    .slice(0, 5);

  // Get revenue by day for last 30 days
  const revenueByDay: Array<{ date: string; revenue: number; orders: number }> = [];
  const dayMap = new Map<string, { revenue: number; orders: number }>();

  for (const order of orderItems || []) {
    const day = order.created_at.split('T')[0];
    const grandTotal = Number((order.payment_snapshot as any)?.grand_total ?? 0);
    
    const existing = dayMap.get(day) || { revenue: 0, orders: 0 };
    existing.revenue += grandTotal;
    existing.orders += 1;
    dayMap.set(day, existing);
  }

  // Fill missing days with zero values
  const start = new Date(fromDate);
  const end = new Date(toDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.toISOString().split('T')[0];
    const data = dayMap.get(day) || { revenue: 0, orders: 0 };
    revenueByDay.push({ date: day, revenue: data.revenue, orders: data.orders });
  }

  // Get peak hours (0-23)
  const hourMap = new Map<number, number>();
  for (const order of orderItems || []) {
    const hour = new Date(order.created_at).getHours();
    hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
  }

  const peakHours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    orders: hourMap.get(hour) || 0,
  })).sort((a, b) => b.orders - a.orders).slice(0, 6);

  // Calculate fulfilment rate
  const { data: allOrders, error: allOrdersError } = await supabaseAdmin
    .from('orders')
    .select('status')
    .eq('shop_id', shopId)
    .gte('created_at', fromDate)
    .lte('created_at', toDate);

  if (allOrdersError) handleSupabaseError(allOrdersError);

  const totalOrdersCount = allOrders?.length || 0;
  const deliveredOrders = allOrders?.filter(o => o.status === 'delivered').length || 0;
  const fulfilmentRate = totalOrdersCount > 0 ? (deliveredOrders / totalOrdersCount) * 100 : 0;

  // Get new vs returning customers
  const { data: customerOrders, error: customerError } = await supabaseAdmin
    .from('orders')
    .select('customer_phone, created_at')
    .eq('shop_id', shopId)
    .gte('created_at', fromDate)
    .lte('created_at', toDate);

  if (customerError) handleSupabaseError(customerError);

  const customerOrderCount = new Map<string, number>();
  for (const order of customerOrders || []) {
    customerOrderCount.set(order.customer_phone, (customerOrderCount.get(order.customer_phone) || 0) + 1);
  }

  const newCustomers = Array.from(customerOrderCount.values()).filter(count => count === 1).length;
  const returningCustomers = Array.from(customerOrderCount.values()).filter(count => count > 1).length;

  return {
    top_products: topProducts,
    revenue_by_day: revenueByDay,
    peak_hours: peakHours,
    fulfilment_rate: Math.round(fulfilmentRate * 100) / 100,
    new_vs_returning_customers: {
      new_customers: newCustomers,
      returning_customers: returningCustomers,
    },
  };
}

export async function getEarningsBreakdown(shopId: string): Promise<EarningsBreakdown> {
  const { data: orders, error } = await supabaseAdmin
    .from('orders')
    .select('payment_snapshot, platform_commission_amount, status')
    .eq('shop_id', shopId)
    .eq('status', 'delivered');

  if (error) handleSupabaseError(error);

  let grossRevenue = 0;
  let couponDiscounts = 0;
  let deliveryCollected = 0;
  let serviceChargeCollected = 0;
  let customChargesCollected = 0;
  let commissionDeducted = 0;

  for (const order of orders || []) {
    const snapshot = order.payment_snapshot as any;
    const grandTotal = Number(snapshot?.grand_total ?? 0);
    const subtotal = Number(snapshot?.subtotal ?? 0);
    const discountAmount = Number(snapshot?.discount_amount ?? 0);
    const deliveryCharge = Number(snapshot?.delivery_charge ?? 0);
    const serviceCharge = Number(snapshot?.service_charge ?? 0);
    const customCharges = Number(snapshot?.custom_charges?.reduce((sum: number, charge: any) => sum + Number(charge.amount), 0) ?? 0);

    grossRevenue += grandTotal;
    couponDiscounts += discountAmount;
    deliveryCollected += deliveryCharge;
    serviceChargeCollected += serviceCharge;
    customChargesCollected += customCharges;
    commissionDeducted += Number(order.platform_commission_amount);
  }

  const netEarnings = grossRevenue - commissionDeducted;

  return {
    gross_revenue: grossRevenue,
    coupon_discounts: couponDiscounts,
    delivery_collected: deliveryCollected,
    service_charge_collected: serviceChargeCollected,
    custom_charges_collected: customChargesCollected,
    commission_deducted: commissionDeducted,
    net_earnings: netEarnings,
  };
}

export async function incrementShopView(shopId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  // Upsert row for today, then increment views atomically
  const { data: existing } = await supabaseAdmin
    .from('shop_analytics')
    .select('id, views')
    .eq('shop_id', shopId)
    .eq('date', today)
    .single();

  if (existing) {
    await supabaseAdmin
      .from('shop_analytics')
      .update({ views: existing.views + 1 })
      .eq('shop_id', shopId)
      .eq('date', today);
  } else {
    await supabaseAdmin
      .from('shop_analytics')
      .insert({ shop_id: shopId, date: today, views: 1, orders: 0 });
  }
}
