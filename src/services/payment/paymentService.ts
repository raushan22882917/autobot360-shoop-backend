import Razorpay from 'razorpay';
import crypto from 'crypto';
import { env } from '../../config/env';
import { supabaseAdmin } from '../../config/supabase';
import { HttpError, handleSupabaseError } from '../../utils/errors';
import { sendWhatsApp } from '../notification/notificationService';

const IFSC_REGEX = /^[A-Z0-9]{11}$/;
const UPI_REGEX = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/;

const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

export async function createRazorpayOrder(
  orderId: string,
  amountRupees: number
): Promise<{ razorpay_order_id: string; amount_paise: number }> {
  const amountPaise = Math.round(amountRupees * 100);

  const rzpOrder = await razorpay.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt: orderId,
    notes: { dukaanlive_order_id: orderId },
  });

  // Store razorpay_order_id on order
  await supabaseAdmin
    .from('orders')
    .update({ razorpay_order_id: rzpOrder.id, updated_at: new Date().toISOString() })
    .eq('id', orderId);

  return { razorpay_order_id: rzpOrder.id, amount_paise: amountPaise };
}

export async function handlePaymentWebhook(payload: {
  event: string;
  payload: {
    payment?: { entity: Record<string, any> };
  };
}): Promise<void> {
  const event = payload.event;
  const payment = payload.payload?.payment?.entity;

  if (!payment) return;

  if (event === 'payment.captured') {
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, shop_id, payment_snapshot')
      .eq('razorpay_order_id', payment.order_id)
      .single();

    if (!order) return;

    await supabaseAdmin
      .from('orders')
      .update({
        payment_status: 'paid',
        razorpay_payment_id: payment.id,
        razorpay_signature: payment.id, // stored for reference
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    // Notify shop owner
    const { data: shop } = await supabaseAdmin
      .from('shops')
      .select('whatsapp_number, user_id')
      .eq('id', order.shop_id)
      .single();

    if (shop?.whatsapp_number) {
      const amount = (order.payment_snapshot as any)?.grand_total ?? 0;
      await sendWhatsApp(shop.whatsapp_number, 'PAYMENT_RECEIVED', {
        orderId: order.id,
        amount: String(amount),
      }, 'en');
    }
  }

  if (event === 'payment.failed') {
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, customer_phone')
      .eq('razorpay_order_id', payment.order_id)
      .single();

    if (!order) return;

    await supabaseAdmin
      .from('orders')
      .update({ payment_status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', order.id);

    await sendWhatsApp(order.customer_phone, 'PAYMENT_FAILED', { orderId: order.id }, 'en');
  }
}

export async function initiateRefund(orderId: string): Promise<void> {
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('razorpay_payment_id, payment_status, settlement_id')
    .eq('id', orderId)
    .single();

  if (!order) throw new HttpError(404, 'NOT_FOUND', 'Order not found');
  if (order.payment_status !== 'paid' && order.payment_status !== 'settled') {
    throw new HttpError(422, 'CANNOT_REFUND', 'Only paid or settled orders can be refunded');
  }
  if (!order.razorpay_payment_id) {
    throw new HttpError(422, 'NO_PAYMENT', 'No payment found for this order');
  }

  await razorpay.payments.refund(order.razorpay_payment_id, {});

  await supabaseAdmin
    .from('orders')
    .update({ payment_status: 'refunded', updated_at: new Date().toISOString() })
    .eq('id', orderId);

  // Reverse pending settlement if exists
  if (order.settlement_id) {
    await supabaseAdmin
      .from('shop_settlements')
      .update({ status: 'failed' })
      .eq('id', order.settlement_id)
      .eq('status', 'pending');
  }
}

export async function triggerSettlement(shopOwnerId: string): Promise<{
  settlement_id: string;
  settled_amount: number;
  order_count: number;
}> {
  // Fetch user's payout account
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('razorpay_account_id, phone')
    .eq('id', shopOwnerId)
    .single();

  if (!user?.razorpay_account_id) {
    throw new HttpError(422, 'NO_PAYOUT_ACCOUNT', 'Shop owner has not linked a payout account');
  }

  // Fetch all paid unsettled orders for this shop owner
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('id, shop_id, payment_snapshot, platform_commission_amount, shop_settlement_amount')
    .eq('payment_status', 'paid')
    .is('settlement_id', null)
    .in('shop_id', supabaseAdmin.from('shops').select('id').eq('user_id', shopOwnerId) as any);

  if (!orders || orders.length === 0) {
    throw new HttpError(422, 'NO_ORDERS', 'No unsettled paid orders found');
  }

  const totalOrderAmount = orders.reduce((sum, o) => sum + Number((o.payment_snapshot as any)?.grand_total ?? 0), 0);
  const commissionAmount = orders.reduce((sum, o) => sum + Number(o.platform_commission_amount), 0);
  const settledAmount = totalOrderAmount - commissionAmount;

  // Check minimum threshold
  const { data: settings } = await supabaseAdmin
    .from('platform_settings')
    .select('value')
    .eq('key', 'min_settlement_threshold')
    .single();

  const minThreshold = parseFloat(settings?.value ?? '100');
  if (settledAmount < minThreshold) {
    throw new HttpError(422, 'BELOW_THRESHOLD', `Settlement amount ₹${settledAmount.toFixed(2)} is below minimum threshold ₹${minThreshold}`);
  }

  // Create settlement record
  const { data: settlement, error: settlementError } = await supabaseAdmin
    .from('shop_settlements')
    .insert({
      shop_id: orders[0].shop_id,
      shop_owner_id: shopOwnerId,
      total_order_amount: totalOrderAmount,
      commission_amount: commissionAmount,
      settled_amount: settledAmount,
      status: 'processing',
      order_ids: orders.map((o) => o.id),
    })
    .select()
    .single();

  if (settlementError) handleSupabaseError(settlementError);

  // Trigger Razorpay Route transfer
  try {
    const transfer = await (razorpay as any).transfers.create({
      account: user.razorpay_account_id,
      amount: Math.round(settledAmount * 100),
      currency: 'INR',
      on_hold: false,
      notes: { settlement_id: settlement!.id },
    });

    // Update settlement and orders on success
    await supabaseAdmin
      .from('shop_settlements')
      .update({
        status: 'completed',
        razorpay_transfer_id: transfer.id,
        settled_at: new Date().toISOString(),
      })
      .eq('id', settlement!.id);

    await supabaseAdmin
      .from('orders')
      .update({ payment_status: 'settled', settlement_id: settlement!.id })
      .in('id', orders.map((o) => o.id));

    // Notify shop owner
    await sendWhatsApp(user.phone, 'SETTLEMENT_DONE', {
      amount: settledAmount.toFixed(2),
      transferRef: transfer.id,
    }, 'en');

    return { settlement_id: settlement!.id, settled_amount: settledAmount, order_count: orders.length };
  } catch (err: any) {
    await supabaseAdmin
      .from('shop_settlements')
      .update({ status: 'failed' })
      .eq('id', settlement!.id);

    throw new HttpError(502, 'TRANSFER_FAILED', `Razorpay transfer failed: ${err.message}`);
  }
}

export async function linkPayoutAccount(
  userId: string,
  method: 'bank' | 'upi',
  details: {
    account_number?: string;
    ifsc?: string;
    account_holder_name?: string;
    upi_id?: string;
  }
): Promise<void> {
  if (method === 'bank') {
    if (!details.ifsc || !IFSC_REGEX.test(details.ifsc.toUpperCase())) {
      throw new HttpError(422, 'INVALID_IFSC', 'IFSC code must be exactly 11 alphanumeric characters');
    }
  } else {
    if (!details.upi_id || !UPI_REGEX.test(details.upi_id)) {
      throw new HttpError(422, 'INVALID_UPI', 'UPI ID must be in format: alphanumeric@provider');
    }
  }

  // Create Razorpay Linked Account
  const accountPayload: Record<string, any> = {
    email: `${userId}@dukaanlive.com`,
    profile: { category: 'individual', subcategory: 'retail' },
    legal_business_name: details.account_holder_name ?? 'Shop Owner',
    business_type: 'individual',
  };

  if (method === 'bank') {
    accountPayload.bank_account = {
      name: details.account_holder_name,
      ifsc: details.ifsc?.toUpperCase(),
      account_number: details.account_number,
    };
  }

  const account = await (razorpay as any).accounts.create(accountPayload);

  // Mask payout details for storage
  const maskedDetails = method === 'bank'
    ? { account_number: `****${details.account_number?.slice(-4)}`, ifsc: details.ifsc?.toUpperCase() }
    : { upi_id: details.upi_id };

  await supabaseAdmin
    .from('users')
    .update({
      razorpay_account_id: account.id,
      payout_method: method,
      payout_details: maskedDetails,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
}
