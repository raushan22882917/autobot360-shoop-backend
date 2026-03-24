import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import * as orderService from '../services/order/orderService';

const createOrderSchema = z.object({
  shop_id: z.string().uuid(),
  customer_name: z.string().min(1).max(100),
  customer_phone: z.string().min(10),
  customer_message: z.string().optional(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
    price: z.number().positive(),
  })).min(1),
  coupon_code: z.string().optional(),
  payment_mode: z.enum(['online', 'cod']).default('cod'),
  delivery_address: z.object({
    address_line: z.string().min(1),
    city: z.string().min(1).max(100),
    pincode: z.string().length(6),
    latitude: z.number(),
    longitude: z.number(),
  }),
});

export async function orderRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // POST /orders — customer creates order
  app.post('/orders', async (req, reply) => {
    const body = createOrderSchema.parse(req.body);
    const order = await orderService.createOrder(body);
    reply.status(201).send(order);
  });

  // GET /orders?shopId= — shop owner lists orders
  app.get('/orders', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const { shopId } = req.query as { shopId?: string };
    if (!shopId) return reply.status(400).send({ error: { code: 'MISSING_SHOP_ID', message: 'shopId required' } });
    const orders = await orderService.listOrders(shopId, req.user.id);
    reply.send(orders);
  });

  // GET /orders/:id
  app.get('/orders/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const order = await orderService.getOrder(id);
    reply.send(order);
  });

  // PATCH /orders/:id/status
  app.patch('/orders/:id/status', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { status } = z.object({ status: z.string() }).parse(req.body);
    const order = await orderService.updateOrderStatus(id, req.user.id, status as any);
    reply.send(order);
  });

  // GET /orders/:id/summary
  app.get('/orders/:id/summary', async (req, reply) => {
    const { id } = req.params as { id: string };
    const summary = await orderService.getOrderSummary(id);
    reply.send(summary);
  });

  // POST /orders/:id/refund — shop owner initiates refund
  app.post('/orders/:id/refund', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { initiateRefund } = await import('../services/payment/paymentService');
    await initiateRefund(id);
    reply.send({ message: 'Refund initiated successfully' });
  });

  // POST /orders/:id/assign-agent
  app.post('/orders/:id/assign-agent', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { agent_id } = z.object({ agent_id: z.string().uuid() }).parse(req.body);
    const { createDeliveryTracking } = await import('../services/tracking/trackingService');
    const tracking = await createDeliveryTracking(id, agent_id);
    reply.status(201).send(tracking);
  });

  // GET /orders/:id/tracking
  app.get('/orders/:id/tracking', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { getTrackingData } = await import('../services/tracking/trackingService');
    const tracking = await getTrackingData(id);
    reply.send(tracking);
  });

  // POST /orders/:id/tracking/location — agent pushes location
  app.post('/orders/:id/tracking/location', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { latitude, longitude } = z.object({
      latitude: z.number(),
      longitude: z.number(),
    }).parse(req.body);

    const agentToken = (req.headers['x-agent-token'] as string) ?? '';
    const { updateAgentLocation } = await import('../services/tracking/trackingService');
    await updateAgentLocation(id, agentToken, latitude, longitude);
    reply.status(204).send();
  });
}
