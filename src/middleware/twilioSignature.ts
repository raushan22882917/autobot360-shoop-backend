import type { FastifyRequest, FastifyReply } from 'fastify';
import twilio from 'twilio';
import { env } from '../config/env';

export async function twilioSignatureMiddleware(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const signature = req.headers['x-twilio-signature'] as string | undefined;

  if (!signature) {
    reply.status(403).send({
      error: { code: 'INVALID_SIGNATURE', message: 'Missing Twilio signature' },
      status: 403,
    });
    return;
  }

  const url = `${env.API_BASE_URL}${req.url}`;
  const params = req.body as Record<string, string>;

  const isValid = twilio.validateRequest(
    env.TWILIO_AUTH_TOKEN,
    signature,
    url,
    params
  );

  if (!isValid) {
    reply.status(403).send({
      error: { code: 'INVALID_SIGNATURE', message: 'Invalid Twilio webhook signature' },
      status: 403,
    });
  }
}
