import type { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { env } from '../config/env';

export async function razorpayWebhookMiddleware(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const signature = req.headers['x-razorpay-signature'] as string | undefined;

  if (!signature) {
    reply.status(403).send({
      error: { code: 'INVALID_SIGNATURE', message: 'Missing Razorpay signature' },
      status: 403,
    });
    return;
  }

  const body = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest('hex');

  if (signature !== expectedSignature) {
    reply.status(403).send({
      error: { code: 'INVALID_SIGNATURE', message: 'Invalid Razorpay webhook signature' },
      status: 403,
    });
  }
}

export async function razorpaySubscriptionWebhookMiddleware(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const signature = req.headers['x-razorpay-signature'] as string | undefined;

  if (!signature) {
    reply.status(403).send({
      error: { code: 'INVALID_SIGNATURE', message: 'Missing Razorpay signature' },
      status: 403,
    });
    return;
  }

  const body = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', env.RAZORPAY_SUBSCRIPTION_WEBHOOK_SECRET)
    .update(body)
    .digest('hex');

  if (signature !== expectedSignature) {
    reply.status(403).send({
      error: { code: 'INVALID_SIGNATURE', message: 'Invalid Razorpay subscription webhook signature' },
      status: 403,
    });
  }
}
