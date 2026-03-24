import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import type { Role } from '../types';

export function requireRole(...roles: Role[]) {
  return function (
    req: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction
  ): void {
    if (!req.user) {
      reply.status(401).send({
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
        status: 401,
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      reply.status(403).send({
        error: {
          code: 'FORBIDDEN',
          message: `This action requires one of the following roles: ${roles.join(', ')}`,
        },
        status: 403,
      });
      return;
    }

    done();
  };
}
