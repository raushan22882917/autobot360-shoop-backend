import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { razorpaySubscriptionWebhookMiddleware } from '../middleware/razorpayWebhook';
import * as subscriptionService from '../services/subscription/subscriptionService';

export async function subscriptionRoutes(app: FastifyInstance) {
  // GET /subscriptions/plans — public
  app.get('/subscriptions/plans', async (_req, reply) => {
    reply.send(subscriptionService.getAvailablePlans());
  });

  // POST /subscriptions/subscribe
  app.post('/subscriptions/subscribe', { preHandler: [authMiddleware, requireRole('shop_owner')] }, async (req, reply) => {
    const { plan } = z.object({ plan: z.enum(['pro', 'business']) }).parse(req.body);
    const result = await subscriptionService.subscribeToPlan(req.user.id, plan);
    reply.status(201).send(result);
  });

  // POST /subscriptions/webhook
  app.post('/subscriptions/webhook', { preHandler: razorpaySubscriptionWebhookMiddleware }, async (req, reply) => {
    await subscriptionService.handleSubscriptionWebhook(req.body as any);
    reply.status(200).send({ status: 'ok' });
  });

  // GET /subscriptions/status
  app.get('/subscriptions/status', { preHandler: [authMiddleware, requireRole('shop_owner', 'admin')] }, async (req, reply) => {
    const status = await subscriptionService.getSubscriptionStatus(req.user.id);
    reply.send(status);
  });
}
