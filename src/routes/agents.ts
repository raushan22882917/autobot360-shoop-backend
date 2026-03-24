import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { supabaseAdmin } from '../config/supabase';
import { handleSupabaseError, assertFound, HttpError } from '../utils/errors';

// Indian phone: 10 digits starting with 6-9, optionally prefixed with +91
const INDIAN_PHONE_REGEX = /^(\+91)?[6-9]\d{9}$/;

const createAgentSchema = z.object({
  shop_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  phone: z.string(),
});

const updateAgentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().optional(),
  is_active: z.boolean().optional(),
});

function generateAgentToken() {
  return randomBytes(32).toString('hex'); // 64-char hex
}

function tokenExpiry() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
}

async function verifyShopOwnership(shopId: string, userId: string) {
  const { data: shop, error } = await supabaseAdmin
    .from('shops')
    .select('id')
    .eq('id', shopId)
    .eq('user_id', userId)
    .single();

  if (error || !shop) {
    throw new HttpError(403, 'FORBIDDEN', 'Shop not found or access denied');
  }
  return shop;
}

export async function agentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // POST /agents — shop owner creates a delivery agent
  app.post('/agents', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const body = createAgentSchema.parse(req.body);
    const { shop_id, name, phone } = body;

    await verifyShopOwnership(shop_id, req.user.id);

    if (!INDIAN_PHONE_REGEX.test(phone)) {
      return reply.status(422).send({
        error: { code: 'INVALID_PHONE', message: 'Phone must be a valid Indian number (10 digits, optionally prefixed with +91)' },
      });
    }

    const agent_token = generateAgentToken();
    const agent_token_expires_at = tokenExpiry().toISOString();

    const { data: agent, error } = await supabaseAdmin
      .from('delivery_agents')
      .insert({
        shop_id,
        name: name.trim(),
        phone,
        agent_token,
        agent_token_expires_at,
      })
      .select()
      .single();

    if (error) handleSupabaseError(error);

    reply.status(201).send({ ...agent, agent_token });
  });

  // GET /agents?shopId= — shop owner lists agents for a shop
  app.get('/agents', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const { shopId } = req.query as { shopId?: string };
    if (!shopId) {
      return reply.status(400).send({ error: { code: 'MISSING_SHOP_ID', message: 'shopId query param required' } });
    }

    await verifyShopOwnership(shopId, req.user.id);

    const { data: agents, error } = await supabaseAdmin
      .from('delivery_agents')
      .select('id, shop_id, name, phone, is_active, current_latitude, current_longitude, last_location_updated_at, agent_token_expires_at, created_at')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (error) handleSupabaseError(error);
    reply.send(agents ?? []);
  });

  // PATCH /agents/:id — shop owner updates an agent
  app.patch('/agents/:id', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const updates = updateAgentSchema.parse(req.body);

    const { data: agent, error: fetchError } = await supabaseAdmin
      .from('delivery_agents')
      .select('shop_id')
      .eq('id', id)
      .single();

    assertFound(agent, 'Agent');

    await verifyShopOwnership(agent!.shop_id, req.user.id);

    if (updates.phone !== undefined && !INDIAN_PHONE_REGEX.test(updates.phone)) {
      return reply.status(422).send({
        error: { code: 'INVALID_PHONE', message: 'Phone must be a valid Indian number (10 digits, optionally prefixed with +91)' },
      });
    }

    const updatePayload: Record<string, unknown> = {};
    if (updates.name !== undefined) updatePayload.name = updates.name.trim();
    if (updates.phone !== undefined) updatePayload.phone = updates.phone;
    if (updates.is_active !== undefined) updatePayload.is_active = updates.is_active;

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('delivery_agents')
      .update(updatePayload)
      .eq('id', id)
      .select('id, shop_id, name, phone, is_active, current_latitude, current_longitude, last_location_updated_at, agent_token_expires_at, created_at')
      .single();

    if (updateError) handleSupabaseError(updateError);
    reply.send(updated);
  });

  // DELETE /agents/:id — shop owner deletes an agent
  app.delete('/agents/:id', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const { data: agent, error: fetchError } = await supabaseAdmin
      .from('delivery_agents')
      .select('shop_id')
      .eq('id', id)
      .single();

    assertFound(agent, 'Agent');

    await verifyShopOwnership(agent!.shop_id, req.user.id);

    const { error: deleteError } = await supabaseAdmin
      .from('delivery_agents')
      .delete()
      .eq('id', id);

    if (deleteError) handleSupabaseError(deleteError);
    reply.status(204).send();
  });
}
