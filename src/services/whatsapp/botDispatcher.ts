import { supabaseAdmin } from '../../config/supabase';
import type { BotIntent } from './intentService';

export async function dispatchIntent(
  intent: BotIntent,
  userPhone: string,
  userType: 'shop_owner' | 'customer' | 'unknown'
): Promise<string> {
  switch (intent.type) {
    case 'ADD_PRODUCT':
      return handleAddProduct(intent.params, userPhone);

    case 'LIST_ORDERS':
      return handleListOrders(intent.params, userPhone);

    case 'UPDATE_ORDER':
      return handleUpdateOrder(intent.params, userPhone);

    case 'LIST_PRODUCTS':
      return handleListProducts(userPhone);

    case 'BROWSE_PRODUCTS':
      return handleBrowseProducts(intent.params);

    case 'PLACE_ORDER':
      return 'To place an order, please visit our website or provide: product name, your address, and phone number.';

    case 'CHECK_ORDER':
      return handleCheckOrder(intent.params, userPhone);

    case 'SHOP_HOURS':
      return handleShopHours(intent.params);

    case 'ONBOARDING_STEP':
      return handleOnboarding(userPhone);

    case 'HELP':
      return getHelpMessage(userType);

    case 'UNKNOWN':
    default:
      return userType === 'unknown'
        ? 'Welcome to DukaanLive! Please register at dukaanlive.com to get started.'
        : getHelpMessage(userType);
  }
}

async function handleAddProduct(params: Record<string, unknown>, userPhone: string): Promise<string> {
  const name = String(params.product_name ?? params.name ?? '');
  const price = parseFloat(String(params.price ?? '0'));

  if (!name || price <= 0) {
    return 'To add a product, please say: "Add product [name] [price]"\nExample: "Add product Chai 20"';
  }

  // Get shop owner's default shop
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('phone', userPhone.replace('whatsapp:', '').replace('+91', ''))
    .single();

  if (!user) return 'Please register at dukaanlive.com first.';

  const { data: shop } = await supabaseAdmin
    .from('shops')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (!shop) return 'You don\'t have a shop yet. Create one at dukaanlive.com';

  const { data: product, error } = await supabaseAdmin
    .from('products')
    .insert({ shop_id: shop.id, name, price })
    .select('id, name, price')
    .single();

  if (error) return `Failed to add product: ${error.message}`;

  return `✅ Product added!\nName: ${product.name}\nPrice: ₹${product.price}\nID: ${product.id}`;
}

async function handleListOrders(params: Record<string, unknown>, userPhone: string): Promise<string> {
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('phone', userPhone.replace('whatsapp:', '').replace('+91', ''))
    .single();

  if (!user) return 'Please register at dukaanlive.com first.';

  const { data: shop } = await supabaseAdmin
    .from('shops')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (!shop) return 'You don\'t have a shop yet.';

  let query = supabaseAdmin
    .from('orders')
    .select('id, customer_name, status, created_at')
    .eq('shop_id', shop.id)
    .order('created_at', { ascending: false })
    .limit(10);

  // Date filter support
  if (params.date_filter === 'yesterday') {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    query = query.gte('created_at', `${dateStr}T00:00:00`).lte('created_at', `${dateStr}T23:59:59`);
  }

  const { data: orders } = await query;

  if (!orders || orders.length === 0) return 'No orders found.';

  const lines = orders.map((o: any) =>
    `• #${o.id.slice(0, 8)} — ${o.customer_name} — ${o.status}`
  );
  return `📦 Recent Orders:\n${lines.join('\n')}`;
}

async function handleUpdateOrder(params: Record<string, unknown>, userPhone: string): Promise<string> {
  const orderId = String(params.order_id ?? '');
  const status = String(params.status ?? '');

  if (!orderId || !status) {
    return 'To update an order, say: "Update order [ID] [status]"\nStatuses: confirmed, out_for_delivery, delivered, cancelled';
  }

  const { error } = await supabaseAdmin
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId);

  if (error) return `Failed to update order: ${error.message}`;
  return `✅ Order #${orderId.slice(0, 8)} updated to: ${status}`;
}

async function handleListProducts(userPhone: string): Promise<string> {
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('phone', userPhone.replace('whatsapp:', '').replace('+91', ''))
    .single();

  if (!user) return 'Please register at dukaanlive.com first.';

  const { data: shop } = await supabaseAdmin
    .from('shops')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (!shop) return 'You don\'t have a shop yet.';

  const { data: products } = await supabaseAdmin
    .from('products')
    .select('id, name, price')
    .eq('shop_id', shop.id)
    .eq('is_active', true)
    .limit(20);

  if (!products || products.length === 0) return 'No products in your shop yet.';

  const lines = products.map((p: any) => `• ${p.name} — ₹${p.price} (ID: ${p.id.slice(0, 8)})`);
  return `🛍️ Your Products:\n${lines.join('\n')}`;
}

async function handleBrowseProducts(params: Record<string, unknown>): Promise<string> {
  const shopSlug = String(params.shop_slug ?? '');
  if (!shopSlug) return 'Please specify a shop name to browse products.';

  const { data: shop } = await supabaseAdmin
    .from('shops')
    .select('id, name')
    .eq('slug', shopSlug)
    .eq('is_active', true)
    .single();

  if (!shop) return 'Shop not found.';

  const { data: products } = await supabaseAdmin
    .from('products')
    .select('name, price')
    .eq('shop_id', shop.id)
    .eq('is_active', true)
    .limit(10);

  if (!products || products.length === 0) return `${shop.name} has no products listed yet.`;

  const lines = products.map((p: any) => `• ${p.name} — ₹${p.price}`);
  return `🛍️ Products from ${shop.name}:\n${lines.join('\n')}`;
}

async function handleCheckOrder(params: Record<string, unknown>, userPhone: string): Promise<string> {
  const orderId = String(params.order_id ?? '');
  if (!orderId) return 'Please provide your order ID to check status.';

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, status, payment_status, created_at')
    .eq('id', orderId)
    .single();

  if (!order) return 'Order not found.';
  return `📦 Order #${order.id.slice(0, 8)}\nStatus: ${order.status}\nPayment: ${order.payment_status}`;
}

async function handleShopHours(params: Record<string, unknown>): Promise<string> {
  const shopSlug = String(params.shop_slug ?? '');
  if (!shopSlug) return 'Please specify a shop name.';

  const { data: shop } = await supabaseAdmin
    .from('shops')
    .select('id, name, shop_hours(*)')
    .eq('slug', shopSlug)
    .single();

  if (!shop) return 'Shop not found.';

  const hours = (shop as any).shop_hours ?? [];
  if (hours.length === 0) return `${shop.name} has not set business hours.`;

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const lines = hours.map((h: any) =>
    h.is_closed ? `${days[h.day_of_week]}: Closed` : `${days[h.day_of_week]}: ${h.open_time} – ${h.close_time}`
  );
  return `🕐 ${shop.name} Hours:\n${lines.join('\n')}`;
}

async function handleOnboarding(userPhone: string): Promise<string> {
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('phone', userPhone.replace('whatsapp:', '').replace('+91', ''))
    .single();

  if (!user) return 'Please register at dukaanlive.com first.';

  const { data: steps } = await supabaseAdmin
    .from('onboarding_steps')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!steps) return 'Start your setup at dukaanlive.com';

  const completed = [
    steps.create_shop ? '✅' : '⬜', 'Create shop',
    steps.add_product ? '✅' : '⬜', 'Add product',
    steps.set_pricing ? '✅' : '⬜', 'Set pricing',
    steps.go_live ? '✅' : '⬜', 'Go live',
  ];

  return `📋 Your Setup Progress:\n${completed[0]} ${completed[1]}\n${completed[2]} ${completed[3]}\n${completed[4]} ${completed[5]}\n${completed[6]} ${completed[7]}`;
}

function getHelpMessage(userType: 'shop_owner' | 'customer' | 'unknown'): string {
  if (userType === 'shop_owner') {
    return '📱 Available Commands:\n• Add product [name] [price]\n• List orders\n• Update order [ID] [status]\n• List products\n• My setup progress';
  }
  return '📱 I can help you:\n• Browse products from a shop\n• Check your order status\n• Find shop hours\nJust type naturally!';
}
