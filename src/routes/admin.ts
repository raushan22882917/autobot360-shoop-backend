import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  getUnsettledOrders,
  bulkSettle,
  getSettlementHistory,
  getPlatformEarnings,
  listUsers,
  updateUserRole,
} from '../services/admin/adminService';
import { triggerSettlement } from '../services/payment/paymentService';
import { supabaseAdmin } from '../config/supabase';
import { handleSupabaseError } from '../utils/errors';

interface GetSettlementHistoryQuery {
  shop_id?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  date_from?: string;
  date_to?: string;
  page?: string;
  limit?: string;
}

interface ListUsersQuery {
  page?: string;
  limit?: string;
}

interface UpdateRoleParams {
  id: string;
}

interface UpdateRoleBody {
  role: 'admin' | 'shop_owner' | 'user';
}

interface TriggerSettlementBody {
  shop_owner_id: string;
}

export async function adminRoutes(app: FastifyInstance) {
  // All admin routes require auth + admin role
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', requireRole('admin'));

  // GET /admin/orders/unsettled — all unsettled paid orders grouped by shop
  app.get('/admin/orders/unsettled', async (_req, reply) => {
    const unsettled = await getUnsettledOrders();
    reply.send(unsettled);
  });

  // POST /admin/settlements/trigger — trigger settlement for a specific shop owner
  app.post('/admin/settlements/trigger', async (req, reply) => {
    const body = req.body as TriggerSettlementBody;
    if (!body?.shop_owner_id) {
      reply.status(400).send({ error: { code: 'MISSING_FIELD', message: 'shop_owner_id is required' } });
      return;
    }
    const result = await triggerSettlement(body.shop_owner_id);
    reply.send(result);
  });

  // POST /admin/settlements/bulk — bulk settlement for all eligible shops
  app.post('/admin/settlements/bulk', async (_req, reply) => {
    const result = await bulkSettle();
    reply.send(result);
  });

  // GET /admin/settlements — settlement history with filters
  app.get('/admin/settlements', async (req, reply) => {
    const query = req.query as GetSettlementHistoryQuery;
    const settlements = await getSettlementHistory({
      shop_id: query.shop_id,
      status: query.status,
      date_from: query.date_from,
      date_to: query.date_to,
    });
    reply.send(settlements);
  });

  // GET /admin/earnings — platform earnings dashboard
  app.get('/admin/earnings', async (_req, reply) => {
    const earnings = await getPlatformEarnings();
    reply.send(earnings);
  });

  // GET /admin/users — list all users
  app.get('/admin/users', async (req, reply) => {
    const query = req.query as ListUsersQuery;
    const page = parseInt(query.page || '1');
    const limit = Math.min(parseInt(query.limit || '50'), 100);

    if (page < 1) {
      reply.status(400).send({ error: { code: 'INVALID_PAGE', message: 'Page must be >= 1' } });
      return;
    }

    const result = await listUsers(page, limit);
    reply.send(result);
  });

  // PATCH /admin/users/:id/role — update user role
  app.patch('/admin/users/:id/role', async (req, reply) => {
    const { id } = req.params as UpdateRoleParams;
    const body = req.body as UpdateRoleBody;

    if (!body?.role || !['admin', 'shop_owner', 'user'].includes(body.role)) {
      reply.status(400).send({ error: { code: 'INVALID_ROLE', message: 'role must be one of: admin, shop_owner, user' } });
      return;
    }

    await updateUserRole(id, body.role, req.user!.id);
    reply.send({ message: 'User role updated successfully' });
  });

  // GET /admin/shops — list all shops
  app.get('/admin/shops', async (req, reply) => {
    const query = req.query as { page?: string; limit?: string };
    const page = parseInt(query.page || '1');
    const limit = Math.min(parseInt(query.limit || '50'), 100);
    const offset = (page - 1) * limit;

    const { data: shops, error, count } = await supabaseAdmin
      .from('shops')
      .select('*, users!inner(name, phone)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) handleSupabaseError(error);

    reply.send({ shops: shops || [], total: count || 0, page, limit });
  });
}
