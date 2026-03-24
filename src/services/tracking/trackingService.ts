import axios from 'axios';
import { env } from '../../config/env';
import { supabaseAdmin } from '../../config/supabase';
import { HttpError, handleSupabaseError } from '../../utils/errors';
import { sendWhatsApp } from '../notification/notificationService';
import crypto from 'crypto';

const MAPS_DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';
const MAPS_DISTANCE_MATRIX_URL = 'https://maps.googleapis.com/maps/api/distancematrix/json';
const NEARBY_THRESHOLD_METRES = 100;
const DELIVERY_SLA_MINUTES = 10;
const MAX_LOCATION_HISTORY = 100;

export async function createDeliveryTracking(
  orderId: string,
  agentId: string
): Promise<Record<string, unknown>> {
  // Fetch order with delivery address
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, shop_id, delivery_latitude, delivery_longitude, status')
    .eq('id', orderId)
    .single();

  if (!order) throw new HttpError(404, 'NOT_FOUND', 'Order not found');

  // Fetch shop location
  const { data: shop } = await supabaseAdmin
    .from('shops')
    .select('latitude, longitude, whatsapp_number')
    .eq('id', order.shop_id)
    .single();

  if (!shop) throw new HttpError(404, 'NOT_FOUND', 'Shop not found');

  // Fetch agent
  const { data: agent } = await supabaseAdmin
    .from('delivery_agents')
    .select('id, name, phone, shop_id')
    .eq('id', agentId)
    .single();

  if (!agent) throw new HttpError(404, 'NOT_FOUND', 'Delivery agent not found');

  // Call Google Maps Directions API
  let routePolyline: string | null = null;
  let totalDistanceMetres: number | null = null;
  let totalDurationSeconds: number | null = null;

  try {
    const response = await axios.get(MAPS_DIRECTIONS_URL, {
      params: {
        origin: `${shop.latitude},${shop.longitude}`,
        destination: `${order.delivery_latitude},${order.delivery_longitude}`,
        key: env.GOOGLE_MAPS_API_KEY,
      },
      timeout: 10000,
    });

    const route = response.data?.routes?.[0];
    if (route) {
      routePolyline = route.overview_polyline?.points ?? null;
      const leg = route.legs?.[0];
      totalDistanceMetres = leg?.distance?.value ?? null;
      totalDurationSeconds = leg?.duration?.value ?? null;
    }
  } catch (err: any) {
    console.error('Google Maps Directions API error:', err.message);
    // Non-fatal — continue without route
  }

  const promisedDeliveryAt = new Date(Date.now() + DELIVERY_SLA_MINUTES * 60 * 1000).toISOString();

  // Generate agent token (64-char hex)
  const agentToken = crypto.randomBytes(32).toString('hex');
  const agentTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h

  // Update agent with token
  await supabaseAdmin
    .from('delivery_agents')
    .update({ agent_token: agentToken, agent_token_expires_at: agentTokenExpiresAt })
    .eq('id', agentId);

  // Create tracking record
  const { data: tracking, error } = await supabaseAdmin
    .from('delivery_tracking')
    .insert({
      order_id: orderId,
      delivery_agent_id: agentId,
      tracking_status: 'assigned',
      route_polyline: routePolyline,
      total_distance_metres: totalDistanceMetres,
      total_duration_seconds: totalDurationSeconds,
      promised_delivery_at: promisedDeliveryAt,
      location_history: [],
    })
    .select()
    .single();

  if (error) handleSupabaseError(error);

  // Update order status to out_for_delivery
  await supabaseAdmin
    .from('orders')
    .update({ status: 'out_for_delivery', updated_at: new Date().toISOString() })
    .eq('id', orderId);

  // Notify agent via WhatsApp
  const mapsLink = `https://maps.google.com/?q=${order.delivery_latitude},${order.delivery_longitude}`;
  const { data: orderFull } = await supabaseAdmin
    .from('orders')
    .select('customer_name, delivery_address_line')
    .eq('id', orderId)
    .single();

  if (agent.phone) {
    await sendWhatsApp(agent.phone, 'AGENT_ASSIGNED', {
      orderId,
      customerName: orderFull?.customer_name ?? '',
      customerAddress: orderFull?.delivery_address_line ?? '',
      mapsLink,
    }, 'en');
  }

  return { ...tracking, agent_token: agentToken };
}

export async function updateAgentLocation(
  orderId: string,
  agentToken: string,
  latitude: number,
  longitude: number
): Promise<void> {
  // Validate agent token
  const { data: tracking } = await supabaseAdmin
    .from('delivery_tracking')
    .select('id, delivery_agent_id, order_id, location_history, tracking_status')
    .eq('order_id', orderId)
    .single();

  if (!tracking) throw new HttpError(404, 'NOT_FOUND', 'Tracking record not found');

  const { data: agent } = await supabaseAdmin
    .from('delivery_agents')
    .select('id, agent_token, agent_token_expires_at, phone')
    .eq('id', tracking.delivery_agent_id)
    .single();

  if (!agent || agent.agent_token !== agentToken) {
    throw new HttpError(403, 'INVALID_TOKEN', 'Invalid agent token');
  }
  if (agent.agent_token_expires_at && new Date(agent.agent_token_expires_at) < new Date()) {
    throw new HttpError(403, 'TOKEN_EXPIRED', 'Agent token has expired');
  }

  // Update agent current location
  await supabaseAdmin
    .from('delivery_agents')
    .update({
      current_latitude: latitude,
      current_longitude: longitude,
      last_location_updated_at: new Date().toISOString(),
    })
    .eq('id', agent.id);

  // Append to location history (max 100)
  const history = (tracking.location_history as any[]) ?? [];
  history.push({ lat: latitude, lng: longitude, timestamp: new Date().toISOString() });
  const trimmedHistory = history.slice(-MAX_LOCATION_HISTORY);

  // Fetch customer delivery address
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('delivery_latitude, delivery_longitude, customer_phone, shop_id')
    .eq('id', orderId)
    .single();

  if (!order) return;

  // Recalculate ETA via Google Maps Distance Matrix
  let etaSeconds: number | null = null;
  let remainingDistanceMetres: number | null = null;

  try {
    const response = await axios.get(MAPS_DISTANCE_MATRIX_URL, {
      params: {
        origins: `${latitude},${longitude}`,
        destinations: `${order.delivery_latitude},${order.delivery_longitude}`,
        key: env.GOOGLE_MAPS_API_KEY,
      },
      timeout: 5000,
    });

    const element = response.data?.rows?.[0]?.elements?.[0];
    if (element?.status === 'OK') {
      etaSeconds = element.duration?.value ?? null;
      remainingDistanceMetres = element.distance?.value ?? null;
    }
  } catch (err: any) {
    console.error('Distance Matrix API error:', err.message);
  }

  const etaDatetime = etaSeconds ? new Date(Date.now() + etaSeconds * 1000).toISOString() : null;

  // Check nearby threshold
  let newStatus = tracking.tracking_status;
  if (remainingDistanceMetres !== null && remainingDistanceMetres <= NEARBY_THRESHOLD_METRES) {
    newStatus = 'nearby';
    // Notify customer
    const { data: shop } = await supabaseAdmin
      .from('shops')
      .select('name')
      .eq('id', order.shop_id)
      .single();

    await sendWhatsApp(order.customer_phone, 'ORDER_NEARBY', {
      shopName: shop?.name ?? 'the shop',
      agentName: 'Your delivery agent',
    }, 'en');
  }

  // Update tracking record
  await supabaseAdmin
    .from('delivery_tracking')
    .update({
      location_history: trimmedHistory,
      remaining_distance_metres: remainingDistanceMetres,
      eta_seconds: etaSeconds,
      eta_datetime: etaDatetime,
      tracking_status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tracking.id);

  // Broadcast via Supabase Realtime
  await supabaseAdmin.channel(`tracking:${orderId}`).send({
    type: 'broadcast',
    event: 'location_update',
    payload: {
      agent_lat: latitude,
      agent_lng: longitude,
      eta_seconds: etaSeconds,
      eta_datetime: etaDatetime,
      tracking_status: newStatus,
    },
  });
}

export async function getTrackingData(orderId: string): Promise<Record<string, unknown>> {
  const { data: tracking } = await supabaseAdmin
    .from('delivery_tracking')
    .select(`
      *,
      delivery_agents (
        name,
        phone,
        current_latitude,
        current_longitude,
        last_location_updated_at
      )
    `)
    .eq('order_id', orderId)
    .single();

  if (!tracking) throw new HttpError(404, 'NOT_FOUND', 'Tracking data not found');

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('status, delivery_latitude, delivery_longitude, shop_id')
    .eq('id', orderId)
    .single();

  const { data: shop } = await supabaseAdmin
    .from('shops')
    .select('latitude, longitude')
    .eq('id', order?.shop_id)
    .single();

  const agent = (tracking as any).delivery_agents;

  // Mask agent phone — show only last 4 digits
  const maskedPhone = agent?.phone
    ? `****${agent.phone.slice(-4)}`
    : null;

  return {
    order_id: orderId,
    order_status: order?.status,
    delivery_agent_name: agent?.name,
    delivery_agent_phone: maskedPhone,
    agent_current_latitude: agent?.current_latitude,
    agent_current_longitude: agent?.current_longitude,
    agent_last_updated_at: agent?.last_location_updated_at,
    shop_latitude: shop?.latitude,
    shop_longitude: shop?.longitude,
    customer_latitude: order?.delivery_latitude,
    customer_longitude: order?.delivery_longitude,
    route_polyline: tracking.route_polyline,
    total_distance_metres: tracking.total_distance_metres,
    total_duration_seconds: tracking.total_duration_seconds,
    remaining_distance_metres: tracking.remaining_distance_metres,
    eta_seconds: tracking.eta_seconds,
    eta_datetime: tracking.eta_datetime,
    tracking_status: tracking.tracking_status,
    promised_delivery_at: tracking.promised_delivery_at,
    is_delayed: tracking.is_delayed,
    location_history: tracking.location_history,
  };
}

export async function checkDelayedDeliveries(): Promise<void> {
  const { data: delayed } = await supabaseAdmin
    .from('delivery_tracking')
    .select('id, order_id, delivery_agent_id')
    .not('tracking_status', 'in', '("delivered","delayed")')
    .lt('promised_delivery_at', new Date().toISOString());

  if (!delayed || delayed.length === 0) return;

  for (const record of delayed) {
    await supabaseAdmin
      .from('delivery_tracking')
      .update({ tracking_status: 'delayed', is_delayed: true, updated_at: new Date().toISOString() })
      .eq('id', record.id);

    // Notify shop owner
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('shop_id, customer_name, id')
      .eq('id', record.order_id)
      .single();

    if (order) {
      const { data: shop } = await supabaseAdmin
        .from('shops')
        .select('whatsapp_number')
        .eq('id', order.shop_id)
        .single();

      if (shop?.whatsapp_number) {
        await sendWhatsApp(shop.whatsapp_number, 'DELIVERY_DELAYED', {
          orderId: order.id,
          customerName: order.customer_name,
        }, 'en');
      }
    }
  }
}
