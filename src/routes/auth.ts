import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as authService from '../services/auth/authService';

const sendOtpSchema = z.object({
  phone: z.string().min(10),
});

const verifyOtpSchema = z.object({
  phone: z.string().min(10),
  token: z.string().length(6),
});

const refreshTokenSchema = z.object({
  refresh_token: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  // POST /api/v1/auth/otp/send
  app.post('/otp/send', async (req, reply) => {
    const body = sendOtpSchema.parse(req.body);
    const result = await authService.sendOtp(body.phone);
    reply.status(200).send(result);
  });

  // POST /api/v1/auth/otp/verify
  app.post('/otp/verify', async (req, reply) => {
    const body = verifyOtpSchema.parse(req.body);
    const result = await authService.verifyOtp(body.phone, body.token);
    reply.status(200).send(result);
  });

  // POST /api/v1/auth/token/refresh
  app.post('/token/refresh', async (req, reply) => {
    const body = refreshTokenSchema.parse(req.body);
    const result = await authService.refreshToken(body.refresh_token);
    reply.status(200).send(result);
  });
}
