import type { FastifyRequest, FastifyReply } from 'fastify';
import { supabaseAdmin } from '../config/supabase';
import { HttpError } from '../utils/errors';
import type { AuthUser, Role, Plan } from '../types';

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
    language: string;
  }
}

export async function authMiddleware(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    reply.status(401).send({
      error: { code: 'MISSING_TOKEN', message: 'Authorization token required' },
      status: 401,
    });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      reply.status(401).send({
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
        status: 401,
      });
      return;
    }

    // Fetch extended user profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('id, phone, role, plan, language_code, onboarding_complete')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      reply.status(401).send({
        error: { code: 'USER_NOT_FOUND', message: 'User profile not found' },
        status: 401,
      });
      return;
    }

    req.user = {
      id: profile.id,
      phone: profile.phone,
      role: profile.role as Role,
      plan: profile.plan as Plan,
      language_code: profile.language_code,
      onboarding_complete: profile.onboarding_complete,
    };
  } catch {
    reply.status(401).send({
      error: { code: 'AUTH_ERROR', message: 'Authentication failed' },
      status: 401,
    });
  }
}
