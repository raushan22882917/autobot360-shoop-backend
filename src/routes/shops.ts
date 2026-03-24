import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import * as shopService from '../services/shop/shopService';
import * as pricingService from '../services/shop/pricingService';
import * as hoursService from '../services/shop/hoursService';

const createShopSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100),
  category: z.string().min(1).max(100),
  latitude: z.number(),
  longitude: z.number(),
  address: z.string().min(1),
  city: z.string().min(1).max(100),
  pincode: z.string().length(6),
  state: z.string().min(1).max(100),
  description: z.string().optional(),
  logo_url: z.string().url().optional(),
  whatsapp_number: z.string().optional(),
});

const pricingSchema = z.object({
  delivery_charge: z.number().min(0).optional(),
  free_delivery: z.boolean().optional(),
  free_delivery_threshold: z.number().min(0).nullable().optional(),
  service_charge_type: z.enum(['flat', 'percentage']).optional(),
  service_charge_value: z.number().min(0).optional(),
  min_order_value: z.number().min(0).optional(),
});

const customChargeSchema = z.object({
  name: z.string().min(1).max(100),
  amount: z.number().positive(),
});

const hoursSchema = z.array(z.object({
  day_of_week: z.number().int().min(0).max(6),
  open_time: z.string().optional(),
  close_time: z.string().optional(),
  is_closed: z.boolean(),
}));

export async function shopRoutes(app: FastifyInstance) {
  // All shop owner routes require auth
  app.addHook('preHandler', authMiddleware);

  // POST /shops
  app.post('/shops', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const body = createShopSchema.parse(req.body);
    const shop = await shopService.createShop(req.user.id, body);
    reply.status(201).send(shop);
  });

  // GET /shops
  app.get('/shops', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const shops = await shopService.listShops(req.user.id);
    reply.send(shops);
  });

  // GET /shops/slug/:slug — public
  app.get('/shops/slug/:slug', { preHandler: [] }, async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const shop = await shopService.getShopBySlug(slug);
    reply.send(shop);
  });

  // GET /shops/:id
  app.get('/shops/:id', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const shop = await shopService.getShop(id, req.user.id);
    reply.send(shop);
  });

  // PATCH /shops/:id
  app.patch('/shops/:id', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = createShopSchema.partial().parse(req.body);
    const shop = await shopService.updateShop(id, req.user.id, body);
    reply.send(shop);
  });

  // DELETE /shops/:id
  app.delete('/shops/:id', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await shopService.deleteShop(id, req.user.id);
    reply.status(204).send();
  });

  // POST /shops/:id/pricing
  app.post('/shops/:id/pricing', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = pricingSchema.parse(req.body);
    const pricing = await pricingService.upsertPricing(id, body);
    reply.status(200).send(pricing);
  });

  // GET /shops/:id/pricing
  app.get('/shops/:id/pricing', async (req, reply) => {
    const { id } = req.params as { id: string };
    const pricing = await pricingService.getPricing(id);
    reply.send(pricing);
  });

  // POST /shops/:id/custom-charges
  app.post('/shops/:id/custom-charges', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = customChargeSchema.parse(req.body);
    const charge = await pricingService.addCustomCharge(id, body);
    reply.status(201).send(charge);
  });

  // DELETE /shops/:id/custom-charges/:chargeId
  app.delete('/shops/:id/custom-charges/:chargeId', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const { id, chargeId } = req.params as { id: string; chargeId: string };
    await pricingService.removeCustomCharge(id, chargeId);
    reply.status(204).send();
  });

  // POST /shops/:id/hours
  app.post('/shops/:id/hours', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = hoursSchema.parse(req.body);
    const hours = await hoursService.setHours(id, body);
    reply.send(hours);
  });

  // GET /shops/:id/hours
  app.get('/shops/:id/hours', async (req, reply) => {
    const { id } = req.params as { id: string };
    const hours = await hoursService.getHours(id);
    reply.send(hours);
  });

  // PATCH /shops/:id/delivery-radius
  app.patch('/shops/:id/delivery-radius', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { delivery_radius_km } = z.object({ delivery_radius_km: z.number().int().min(1).max(5) }).parse(req.body);
    const shop = await shopService.updateDeliveryRadius(id, req.user.id, delivery_radius_km);
    reply.send(shop);
  });

}
