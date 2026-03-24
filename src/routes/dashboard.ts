import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getStats, getAnalytics, getEarningsBreakdown, incrementShopView } from '../services/dashboard/dashboardService';
import { supabaseAdmin } from '../config/supabase';

export async function dashboardRoutes(app: FastifyInstance) {
  // GET /dashboard/stats — shop owner stats with optional date range
  app.get(
    '/dashboard/stats',
    { preHandler: [authMiddleware, requireRole('shop_owner', 'admin')] },
    async (req, reply) => {
      const { from, to } = req.query as { from?: string; to?: string };

      const { data: shop } = await supabaseAdmin
        .from('shops')
        .select('id')
        .eq('user_id', req.user.id)
        .single();

      if (!shop) {
        return reply.status(404).send({ error: { code: 'SHOP_NOT_FOUND', message: 'Shop not found' } });
      }

      const stats = await getStats(shop.id, { from, to });
      reply.send(stats);
    }
  );

  // GET /dashboard/analytics — detailed analytics with optional date range
  app.get(
    '/dashboard/analytics',
    { preHandler: [authMiddleware, requireRole('shop_owner', 'admin')] },
    async (req, reply) => {
      const { from, to } = req.query as { from?: string; to?: string };

      const { data: shop } = await supabaseAdmin
        .from('shops')
        .select('id')
        .eq('user_id', req.user.id)
        .single();

      if (!shop) {
        return reply.status(404).send({ error: { code: 'SHOP_NOT_FOUND', message: 'Shop not found' } });
      }

      const analytics = await getAnalytics(shop.id, { from, to });
      reply.send(analytics);
    }
  );

  // GET /dashboard/earnings — earnings breakdown
  app.get(
    '/dashboard/earnings',
    { preHandler: [authMiddleware, requireRole('shop_owner', 'admin')] },
    async (req, reply) => {
      const { data: shop } = await supabaseAdmin
        .from('shops')
        .select('id')
        .eq('user_id', req.user.id)
        .single();

      if (!shop) {
        return reply.status(404).send({ error: { code: 'SHOP_NOT_FOUND', message: 'Shop not found' } });
      }

      const earnings = await getEarningsBreakdown(shop.id);
      reply.send(earnings);
    }
  );

  // POST /shop/:slug/view — public endpoint to increment storefront page view
  app.post('/shop/:slug/view', async (req, reply) => {
    const { slug } = req.params as { slug: string };

    const { data: shop } = await supabaseAdmin
      .from('shops')
      .select('id')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (!shop) {
      return reply.status(404).send({ error: { code: 'SHOP_NOT_FOUND', message: 'Shop not found' } });
    }

    await incrementShopView(shop.id);
    reply.status(204).send();
  });
}
