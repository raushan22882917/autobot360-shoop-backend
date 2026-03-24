import { supabaseAdmin } from '../../config/supabase';
import { HttpError, handleSupabaseError, assertFound } from '../../utils/errors';
import { calculateOrderTotal, incrementCouponUsage } from './calculateOrderTotal';
import { isShopOpen } from '../shop/hoursService';
import { haversineDistance } from '../location/locationService';
import { decrementStock } from '../product/productService';
import type { OrderStatus } from '../../types';

const INDIAN_PHONE_REGEX = /^(\+91)?[6-9]\d{9}$/;
const PINCODE_REGEX = /^[0-9]{6}$/;

const VALID_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled'];

function validateOrderPhone(phone: string) {
  if (!INDIAN_PHONE_REGEX.test(phone.replace(/\s+/g, ''))) {
    throw new HttpError(422, 'INVALID_PHONE', 'customer_phone must be a valid 10-digit Indian phone number');
  }
}

function validateCustomerName(name: string) {
  if (!name || name.trim().length === 0 || name.length > 100) {
    throw new HttpError(422, 'INVALID_NAME', 'customer_name must be 1–100 characters');
  }
}

export async function createOrder(data: {
  shop_id: string;
  customer_name: string;
  customer_phone: string;
  customer_message?: string;
  items: Array<{ productId: string; quantity: number; price: number }>;
  coupon_code?: string;
  payment_mode: 'online' | 'cod';
  delivery_address: {
    address_line: string;
    city: string;
    pincode: string;
    latitude: number;
    longitude: number;
  };
}) {
  validateCustomerName(data.customer_name);
  validateOrderPhone(data.customer_phone);

  // Validate delivery address
  const addr = data.delivery_address;
  if (addr.latitude < -90 || addr.latitude > 90) {
    throw new HttpError(422, 'INVALID_LATITUDE', 'delivery_latitude must be between -90 and 90');
  }
  if (addr.longitude < -180 || addr.longitude > 180) {
    throw new HttpError(422, 'INVALID_LONGITUDE', 'delivery_longitude must be between -180 and 180');
  }
  if (!PINCODE_REGEX.test(addr.pincode)) {
    throw new HttpError(422, 'INVALID_PINCODE', 'delivery_pincode must be exactly 6 digits');
  }

  // Fetch shop
  const { data: shop } = await supabaseAdmin
    .from('shops')
    .select('*, shop_hours(*)')
    .eq('id', data.shop_id)
    .eq('is_active', true)
    .single();

  if (!shop) throw new HttpError(422, 'SHOP_NOT_FOUND', 'Shop not found or inactive');

  // Check delivery radius
  const distanceKm = haversineDistance(
    { latitude: shop.latitude, longitude: shop.longitude },
    { latitude: addr.latitude, longitude: addr.longitude }
  );
  if (distanceKm > shop.delivery_radius_km) {
    throw new HttpError(
      422,
      'OUTSIDE_DELIVERY_RADIUS',
      `This shop only delivers within ${shop.delivery_radius_km} km. Your address is ${distanceKm.toFixed(2)} km away.`
    );
  }

  // Check business hours
  const { isOpen, nextOpenTime } = isShopOpen(shop.shop_hours ?? []);
  if (!isOpen) {
    const msg = nextOpenTime
      ? `Shop is currently closed. Next opening: ${nextOpenTime}`
      : 'Shop is currently closed';
    throw new HttpError(422, 'SHOP_CLOSED', msg);
  }

  // Check products are in stock
  for (const item of data.items) {
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('out_of_stock, name')
      .eq('id', item.productId)
      .single();

    if (!product) throw new HttpError(422, 'PRODUCT_NOT_FOUND', `Product ${item.productId} not found`);
    if (product.out_of_stock) {
      throw new HttpError(422, 'OUT_OF_STOCK', `${product.name} is currently out of stock`);
    }
  }

  // Calculate order total
  const calculation = await calculateOrderTotal(
    {
      items: data.items,
      shopId: data.shop_id,
      couponCode: data.coupon_code,
      paymentMode: data.payment_mode,
    },
    supabaseAdmin
  );

  // Create order record
  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .insert({
      shop_id: data.shop_id,
      customer_name: data.customer_name.trim(),
      customer_phone: data.customer_phone,
      customer_message: data.customer_message ?? null,
      status: 'pending',
      payment_status: 'pending',
      payment_mode: calculation.payment_mode,
      delivery_address_line: addr.address_line,
      delivery_city: addr.city,
      delivery_pincode: addr.pincode,
      delivery_latitude: addr.latitude,
      delivery_longitude: addr.longitude,
      payment_snapshot: calculation,
      platform_commission_rate: calculation.platform_commission_rate,
      platform_commission_amount: calculation.platform_commission_amount,
      shop_settlement_amount: calculation.shop_settlement_amount,
      coupon_id: calculation.coupon_id ?? null,
    })
    .select()
    .single();

  if (error) handleSupabaseError(error);

  // Increment coupon usage
  if (calculation.coupon_id) {
    await incrementCouponUsage(calculation.coupon_id, supabaseAdmin);
  }

  // Decrement stock and check low-stock alerts
  for (const item of data.items) {
    const { newStock, threshold, outOfStock } = await decrementStock(item.productId);

    if (newStock <= threshold && newStock > 0) {
      // Trigger low-stock notification (non-blocking)
      const { data: product } = await supabaseAdmin
        .from('products')
        .select('name')
        .eq('id', item.productId)
        .single();

      if (product) {
        import('../notification/notificationService').then(({ sendWhatsApp }) => {
          sendWhatsApp(shop.whatsapp_number ?? '', 'LOW_STOCK', {
            productName: product.name,
            stockCount: String(newStock),
          }, shop.language_code ?? 'en').catch(console.error);
        });
      }
    }
  }

  // Increment shop analytics orders count
  const today = new Date().toISOString().split('T')[0];
  await supabaseAdmin
    .from('shop_analytics')
    .upsert({ shop_id: data.shop_id, date: today, views: 0, orders: 1 }, { onConflict: 'shop_id,date' });

  // Notify shop owner (non-blocking)
  if (shop.whatsapp_number) {
    const firstItem = data.items[0];
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('name')
      .eq('id', firstItem.productId)
      .single();

    import('../notification/notificationService').then(({ sendWhatsApp }) => {
      sendWhatsApp(shop.whatsapp_number!, 'ORDER_RECEIVED', {
        orderId: order!.id,
        customerName: data.customer_name,
        customerPhone: data.customer_phone,
        productName: product?.name ?? 'Product',
        message: data.customer_message ?? '',
      }, 'en').catch(console.error);
    });
  }

  return order;
}

export async function updateOrderStatus(orderId: string, userId: string, status: OrderStatus) {
  if (!VALID_STATUSES.includes(status)) {
    throw new HttpError(422, 'INVALID_STATUS', `Status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  // Verify ownership
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('shop_id')
    .eq('id', orderId)
    .single();

  if (!order) throw new HttpError(404, 'NOT_FOUND', 'Order not found');

  const { data: shop } = await supabaseAdmin
    .from('shops')
    .select('id')
    .eq('id', order.shop_id)
    .eq('user_id', userId)
    .single();

  if (!shop) throw new HttpError(403, 'FORBIDDEN', 'Access denied');

  const { data: updated, error } = await supabaseAdmin
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .select()
    .single();

  if (error) handleSupabaseError(error);
  return assertFound(updated, 'Order');
}

export async function listOrders(shopId: string, userId: string) {
  // Verify shop ownership
  const { data: shop } = await supabaseAdmin
    .from('shops')
    .select('id')
    .eq('id', shopId)
    .eq('user_id', userId)
    .single();

  if (!shop) throw new HttpError(403, 'FORBIDDEN', 'Access denied');

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false });

  if (error) handleSupabaseError(error);
  return data ?? [];
}

export async function getOrder(orderId: string) {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (error) handleSupabaseError(error);
  return assertFound(data, 'Order');
}

export async function getOrderSummary(orderId: string) {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('id, payment_snapshot, payment_mode, payment_status, razorpay_order_id')
    .eq('id', orderId)
    .single();

  if (error) handleSupabaseError(error);
  if (!data) throw new HttpError(404, 'NOT_FOUND', 'Order not found');

  return {
    order_id: data.id,
    payment_mode: data.payment_mode,
    payment_status: data.payment_status,
    razorpay_order_id: data.razorpay_order_id,
    ...data.payment_snapshot,
  };
}
