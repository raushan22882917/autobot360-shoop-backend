import type { FastifyInstance } from 'fastify';
import { twilioSignatureMiddleware } from '../middleware/twilioSignature';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { handleInboundMessage } from '../services/whatsapp/whatsAppBotService';
import { supabaseAdmin } from '../config/supabase';

export async function whatsappRoutes(app: FastifyInstance) {
  // POST /whatsapp/webhook — Twilio inbound
  app.post('/whatsapp/webhook', {
    preHandler: twilioSignatureMiddleware,
  }, async (req, reply) => {
    const payload = req.body as Record<string, string>;
    // Handle async — respond to Twilio immediately
    handleInboundMessage(payload as any).catch((err) => {
      app.log.error({ err }, 'WhatsApp bot error');
    });
    // Twilio expects 200 with empty TwiML or plain text
    reply.status(200).type('text/xml').send('<Response></Response>');
  });

  // GET /whatsapp/activity?shopId= — WhatsApp activity feed
  app.get('/whatsapp/activity', {
    preHandler: [authMiddleware, requireRole('shop_owner', 'admin')],
  }, async (req, reply) => {
    const { shopId } = req.query as { shopId?: string };
    if (!shopId) return reply.status(400).send({ error: { code: 'MISSING_SHOP_ID', message: 'shopId required' } });

    // Return recent orders created via WhatsApp (customer_message present)
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('id, customer_name, customer_phone, customer_message, status, created_at')
      .eq('shop_id', shopId)
      .not('customer_message', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return reply.status(500).send({ error: { code: 'DB_ERROR', message: error.message } });
    reply.send(data ?? []);
  });
}
