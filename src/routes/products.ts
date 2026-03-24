import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { enforcePlanLimit } from '../middleware/planEnforcement';
import { supabaseAdmin } from '../config/supabase';
import * as productService from '../services/product/productService';
import * as storageService from '../services/product/storageService';
import * as csvImportService from '../services/product/csvImportService';
import * as aiService from '../services/ai/aiService';

const createProductSchema = z.object({
  shop_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  price: z.number().positive(),
  description: z.string().optional(),
  stock_quantity: z.number().int().min(0).optional(),
  low_stock_threshold: z.number().int().min(0).optional(),
});

const aiDescriptionSchema = z.object({
  product_name: z.string().min(1),
  category: z.string().min(1),
  language: z.string().optional(),
});

export async function productRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // POST /products
  app.post('/products', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const body = createProductSchema.parse(req.body);
    const product = await productService.createProduct(req.user.id, body);
    reply.status(201).send(product);
  });

  // GET /products?shopId=
  app.get('/products', async (req, reply) => {
    const { shopId } = req.query as { shopId?: string };
    if (!shopId) return reply.status(400).send({ error: { code: 'MISSING_SHOP_ID', message: 'shopId query param required' } });
    const products = await productService.listProducts(shopId);
    reply.send(products);
  });

  // GET /products/:id
  app.get('/products/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const product = await productService.getProduct(id);
    reply.send(product);
  });

  // PATCH /products/:id
  app.patch('/products/:id', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = createProductSchema.partial().omit({ shop_id: true }).parse(req.body);
    const product = await productService.updateProduct(id, req.user.id, body);
    reply.send(product);
  });

  // DELETE /products/:id
  app.delete('/products/:id', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await productService.deleteProduct(id, req.user.id);
    reply.status(204).send();
  });

  // POST /products/:id/image
  app.post('/products/:id/image', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const file = await req.file();
    if (!file) return reply.status(400).send({ error: { code: 'NO_FILE', message: 'No image file provided' } });

    const { url, storagePath } = await storageService.uploadImage(file, req.user.id);
    const product = await productService.attachImage(id, url, storagePath);
    reply.send(product);
  });

  // POST /products/bulk-import
  app.post('/products/bulk-import', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    await enforcePlanLimit(req.user.id, 'bulk_import', supabaseAdmin);

    const { shopId } = req.query as { shopId?: string };
    if (!shopId) return reply.status(400).send({ error: { code: 'MISSING_SHOP_ID', message: 'shopId query param required' } });

    const file = await req.file();
    if (!file) return reply.status(400).send({ error: { code: 'NO_FILE', message: 'No CSV file provided' } });

    const buffer = await file.toBuffer();
    const result = await csvImportService.bulkImportProducts(shopId, req.user.id, buffer);

    const statusCode = result.plan_limit_reached ? 207 : 200;
    reply.status(statusCode).send(result);
  });

  // POST /products/ai-description
  app.post('/products/ai-description', { preHandler: requireRole('shop_owner', 'admin') }, async (req, reply) => {
    const body = aiDescriptionSchema.parse(req.body);
    const description = await aiService.generateDescription(
      body.product_name,
      body.category,
      body.language ?? req.language
    );
    reply.send({ description });
  });
}
