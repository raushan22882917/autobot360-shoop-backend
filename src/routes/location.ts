import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import * as locationService from '../services/location/locationService';

export async function locationRoutes(app: FastifyInstance) {
  // GET /shops/nearby — public
  app.get('/shops/nearby', { preHandler: [] }, async (req, reply) => {
    const query = req.query as { lat?: string; lng?: string; radius?: string };
    const lat = parseFloat(query.lat ?? '');
    const lng = parseFloat(query.lng ?? '');
    const radius = parseFloat(query.radius ?? '1');
    const shops = await locationService.findNearbyShops(lat, lng, radius);
    reply.send(shops);
  });

  // GET /shops/city — public (supports ?city= or ?pincode=)
  app.get('/shops/city', { preHandler: [] }, async (req, reply) => {
    const query = req.query as { city?: string; pincode?: string };
    let shops: Awaited<ReturnType<typeof locationService.findByCity>>;
    if (query.pincode) {
      shops = await locationService.findByPincode(query.pincode);
    } else if (query.city) {
      shops = await locationService.findByCity(query.city);
    } else {
      shops = [];
    }
    reply.send(shops);
  });

  // PATCH /users/location — authenticated
  app.patch('/users/location', { preHandler: authMiddleware }, async (req, reply) => {
    const body = req.body as {
      latitude?: number;
      longitude?: number;
      city?: string;
      pincode?: string;
    };
    await locationService.updatePreferredLocation(req.user.id, body);
    reply.send({ message: 'Preferred location updated successfully' });
  });
}
