import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { getOnboardingStatus, markStep } from '../services/onboarding/onboardingService';

const VALID_STEPS = ['create_shop', 'add_product', 'set_pricing', 'go_live'] as const;
type OnboardingStep = typeof VALID_STEPS[number];

export async function onboardingRoutes(app: FastifyInstance) {
  // GET /onboarding — get onboarding step status
  app.get(
    '/onboarding',
    { preHandler: [authMiddleware] },
    async (req, reply) => {
      const status = await getOnboardingStatus(req.user.id);
      reply.send(status);
    }
  );

  // POST /onboarding/step — mark a step as complete
  app.post(
    '/onboarding/step',
    { preHandler: [authMiddleware] },
    async (req, reply) => {
      const { step } = req.body as { step: OnboardingStep };

      if (!VALID_STEPS.includes(step)) {
        return reply.status(422).send({
          error: {
            code: 'INVALID_STEP',
            message: `step must be one of: ${VALID_STEPS.join(', ')}`,
          },
        });
      }

      const result = await markStep(req.user.id, step);
      reply.send(result);
    }
  );
}
