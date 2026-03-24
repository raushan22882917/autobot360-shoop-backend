import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import * as couponService from '../services/shop/couponService';

const createCouponSchema = z.object({
  shop_id: z.string().uuid(),
  code: z.string().min(1).max(50),
  discount_type: z.enum(['flat', 'percentage']),
  discount_value: z.number().positive(),
  max_usage: z.number().int().positive().optional(),
  expires_at: z.string().datetime().optional(),
});

export async function couponRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // POST /coupons — shop owner creates a coupon
  app.post('/coupons', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const body = createCouponSchema.parse(req.body);
    const coupon = await couponService.createCoupon(req.user.id, body);
    reply.status(201).send(coupon);
  });

  // GET /coupons?shopId= — shop owner lists coupons for a shop
  app.get('/coupons', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const { shopId } = req.query as { shopId?: string };
    if (!shopId) {
      return reply.status(400).send({ error: { code: 'MISSING_SHOP_ID', message: 'shopId query param required' } });
    }
    const coupons = await couponService.listCoupons(req.user.id, shopId);
    reply.send(coupons);
  });

  // DELETE /coupons/:id — shop owner deletes a coupon
  app.delete('/coupons/:id', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await couponService.deleteCoupon(req.user.id, id);
    reply.status(204).send();
  });
}
