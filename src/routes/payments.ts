import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { razorpayWebhookMiddleware } from '../middleware/razorpayWebhook';
import * as paymentService from '../services/payment/paymentService';
import { supabaseAdmin } from '../config/supabase';

export async function paymentRoutes(app: FastifyInstance) {
  // POST /payments/create — create Razorpay order
  app.post('/payments/create', { preHandler: authMiddleware }, async (req, reply) => {
    const { order_id } = z.object({ order_id: z.string().uuid() }).parse(req.body);

    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, payment_snapshot, payment_mode')
      .eq('id', order_id)
      .single();

    if (!order) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Order not found' } });
    if (order.payment_mode !== 'online') {
      return reply.status(422).send({ error: { code: 'COD_ORDER', message: 'This order uses cash on delivery' } });
    }

    const grandTotal = (order.payment_snapshot as any)?.grand_total ?? 0;
    const result = await paymentService.createRazorpayOrder(order_id, grandTotal);
    reply.send(result);
  });

  // POST /payments/webhook — Razorpay webhook
  app.post('/payments/webhook', { preHandler: razorpayWebhookMiddleware }, async (req, reply) => {
    await paymentService.handlePaymentWebhook(req.body as any);
    reply.status(200).send({ status: 'ok' });
  });

  // POST /payments/link-account
  app.post('/payments/link-account', { preHandler: [authMiddleware, requireRole('shop_owner')] }, async (req, reply) => {
    const body = z.object({
      method: z.enum(['bank', 'upi']),
      account_number: z.string().optional(),
      ifsc: z.string().optional(),
      account_holder_name: z.string().optional(),
      upi_id: z.string().optional(),
    }).parse(req.body);

    await paymentService.linkPayoutAccount(req.user.id, body.method, body);
    reply.send({ message: 'Payout account linked successfully' });
  });

  // GET /payments/settlements
  app.get('/payments/settlements', { preHandler: [authMiddleware, requireRole('shop_owner', 'admin')] }, async (req, reply) => {
    const { data, error } = await supabaseAdmin
      .from('shop_settlements')
      .select('*')
      .eq('shop_owner_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) return reply.status(500).send({ error: { code: 'DB_ERROR', message: error.message } });
    reply.send(data ?? []);
  });
}
