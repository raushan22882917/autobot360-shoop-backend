import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { env } from './config/env';
import { redis } from './config/redis';
import { HttpError } from './utils/errors';
import type { FastifyRequest, FastifyReply } from 'fastify';

// Route imports (added as services are implemented)
import { authRoutes } from './routes/auth';
import { shopRoutes } from './routes/shops';
import { productRoutes } from './routes/products';
import { orderRoutes } from './routes/orders';
import { paymentRoutes } from './routes/payments';
import { subscriptionRoutes } from './routes/subscriptions';
import { whatsappRoutes } from './routes/whatsapp';
import { adminRoutes } from './routes/admin';
import { onboardingRoutes } from './routes/onboarding';
import { couponRoutes } from './routes/coupons';
import { agentRoutes } from './routes/agents';
import { dashboardRoutes } from './routes/dashboard';
import { locationRoutes } from './routes/location';

const app = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
});

// Global error handler
app.setErrorHandler((error: Error, req: FastifyRequest, reply: FastifyReply) => {
  if (error instanceof HttpError) {
    reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
      status: error.statusCode,
    });
    return;
  }

  // Fastify validation errors
  if ('validation' in error) {
    reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: (error as any).validation,
      },
      status: 400,
    });
    return;
  }

  app.log.error(error);
  reply.status(500).send({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    status: 500,
  });
});

// Accept-Language middleware
app.addHook('preHandler', async (req: FastifyRequest) => {
  const acceptLanguage = req.headers['accept-language'];
  req.language = acceptLanguage?.split(',')[0]?.split('-')[0] ?? 'en';
});

async function bootstrap() {
  // Plugins
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5 MB
    },
  });

  // Routes
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(shopRoutes, { prefix: '/api/v1' });
  await app.register(productRoutes, { prefix: '/api/v1' });
  await app.register(orderRoutes, { prefix: '/api/v1' });
  await app.register(paymentRoutes, { prefix: '/api/v1' });
  await app.register(subscriptionRoutes, { prefix: '/api/v1' });
  await app.register(whatsappRoutes, { prefix: '/api/v1' });
  await app.register(adminRoutes, { prefix: '/api/v1' });
  await app.register(onboardingRoutes, { prefix: '/api/v1' });
  await app.register(couponRoutes, { prefix: '/api/v1' });
  await app.register(agentRoutes, { prefix: '/api/v1' });
  await app.register(dashboardRoutes, { prefix: '/api/v1' });
  await app.register(locationRoutes, { prefix: '/api/v1' });

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Connect Redis
  await redis.connect();

  // Start server
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  console.log(`🚀 DukaanLive API running on port ${env.PORT}`);

  // Start delay checker cron after server boot
  const { startDelayChecker } = await import('./cron/delayChecker');
  startDelayChecker();
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
