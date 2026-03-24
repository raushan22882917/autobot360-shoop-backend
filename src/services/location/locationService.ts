import { supabaseAdmin } from '../../config/supabase';
import { HttpError, handleSupabaseError } from '../../utils/errors';

interface Location {
  latitude: number;
  longitude: number;
}

interface NearbyShop {
  id: string;
  name: string;
  slug: string;
  category: string;
  description?: string;
  logo_url?: string;
  address: string;
  city: string;
  pincode: string;
  state: string;
  whatsapp_number?: string;
  distance_km: number;
  delivery_radius_km: number;
  is_active: boolean;
  online_payment_enabled: boolean;
}

interface ShopSearchResult {
  id: string;
  name: string;
  slug: string;
  category: string;
  description?: string;
  logo_url?: string;
  address: string;
  city: string;
  pincode: string;
  state: string;
  whatsapp_number?: string;
  delivery_radius_km: number;
  is_active: boolean;
  online_payment_enabled: boolean;
}

export function haversineDistance(loc1: Location, loc2: Location): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(loc2.latitude - loc1.latitude);
  const dLon = toRadians(loc2.longitude - loc1.longitude);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(loc1.latitude)) * Math.cos(toRadians(loc2.latitude)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export async function findNearbyShops(
  latitude: number,
  longitude: number,
  radius: number = 5
): Promise<NearbyShop[]> {
  // Validate inputs
  if (latitude < -90 || latitude > 90) {
    throw new HttpError(422, 'INVALID_LATITUDE', 'Latitude must be between -90 and 90');
  }
  if (longitude < -180 || longitude > 180) {
    throw new HttpError(422, 'INVALID_LONGITUDE', 'Longitude must be between -180 and 180');
  }
  if (radius < 0.1 || radius > 5) {
    throw new HttpError(422, 'INVALID_RADIUS', 'Radius must be between 0.1 and 5 km');
  }

  const userLocation: Location = { latitude, longitude };

  // Get all active shops
  const { data: shops, error } = await supabaseAdmin
    .from('shops')
    .select(`
      id,
      name,
      slug,
      category,
      description,
      logo_url,
      address,
      city,
      pincode,
      state,
      whatsapp_number,
      latitude,
      longitude,
      delivery_radius_km,
      is_active,
      online_payment_enabled
    `)
    .eq('is_active', true);

  if (error) handleSupabaseError(error);

  // Calculate distances and filter by radius
  const nearbyShops: NearbyShop[] = [];

  for (const shop of shops || []) {
    const shopLocation: Location = {
      latitude: Number(shop.latitude),
      longitude: Number(shop.longitude),
    };

    const distance = haversineDistance(userLocation, shopLocation);

    // Only include shops within the requested radius
    if (distance <= radius) {
      nearbyShops.push({
        id: shop.id,
        name: shop.name,
        slug: shop.slug,
        category: shop.category,
        description: shop.description,
        logo_url: shop.logo_url,
        address: shop.address,
        city: shop.city,
        pincode: shop.pincode,
        state: shop.state,
        whatsapp_number: shop.whatsapp_number,
        distance_km: Math.round(distance * 100) / 100, // Round to 2 decimal places
        delivery_radius_km: shop.delivery_radius_km,
        is_active: shop.is_active,
        online_payment_enabled: shop.online_payment_enabled,
      });
    }
  }

  // Sort by distance (closest first)
  nearbyShops.sort((a, b) => a.distance_km - b.distance_km);

  return nearbyShops;
}

export async function findByCity(city: string): Promise<ShopSearchResult[]> {
  if (!city || city.trim().length === 0) {
    throw new HttpError(422, 'INVALID_CITY', 'City name is required');
  }

  const { data: shops, error } = await supabaseAdmin
    .from('shops')
    .select(`
      id,
      name,
      slug,
      category,
      description,
      logo_url,
      address,
      city,
      pincode,
      state,
      whatsapp_number,
      delivery_radius_km,
      is_active,
      online_payment_enabled
    `)
    .eq('is_active', true)
    .ilike('city', `%${city.trim()}%`);

  if (error) handleSupabaseError(error);

  return (shops || []).map(shop => ({
    id: shop.id,
    name: shop.name,
    slug: shop.slug,
    category: shop.category,
    description: shop.description,
    logo_url: shop.logo_url,
    address: shop.address,
    city: shop.city,
    pincode: shop.pincode,
    state: shop.state,
    whatsapp_number: shop.whatsapp_number,
    delivery_radius_km: shop.delivery_radius_km,
    is_active: shop.is_active,
    online_payment_enabled: shop.online_payment_enabled,
  }));
}

export async function findByPincode(pincode: string): Promise<ShopSearchResult[]> {
  if (!pincode || pincode.trim().length === 0) {
    throw new HttpError(422, 'INVALID_PINCODE', 'Pincode is required');
  }

  // Validate pincode format (6 digits)
  const pincodeRegex = /^[0-9]{6}$/;
  if (!pincodeRegex.test(pincode.trim())) {
    throw new HttpError(422, 'INVALID_PINCODE_FORMAT', 'Pincode must be exactly 6 digits');
  }

  const { data: shops, error } = await supabaseAdmin
    .from('shops')
    .select(`
      id,
      name,
      slug,
      category,
      description,
      logo_url,
      address,
      city,
      pincode,
      state,
      whatsapp_number,
      delivery_radius_km,
      is_active,
      online_payment_enabled
    `)
    .eq('is_active', true)
    .eq('pincode', pincode.trim());

  if (error) handleSupabaseError(error);

  return (shops || []).map(shop => ({
    id: shop.id,
    name: shop.name,
    slug: shop.slug,
    category: shop.category,
    description: shop.description,
    logo_url: shop.logo_url,
    address: shop.address,
    city: shop.city,
    pincode: shop.pincode,
    state: shop.state,
    whatsapp_number: shop.whatsapp_number,
    delivery_radius_km: shop.delivery_radius_km,
    is_active: shop.is_active,
    online_payment_enabled: shop.online_payment_enabled,
  }));
}

export async function updatePreferredLocation(
  userId: string,
  location: {
    latitude?: number;
    longitude?: number;
    city?: string;
    pincode?: string;
  }
): Promise<void> {
  if (!userId) {
    throw new HttpError(400, 'INVALID_USER', 'User ID is required');
  }

  // Validate coordinates if provided
  if (location.latitude !== undefined) {
    if (location.latitude < -90 || location.latitude > 90) {
      throw new HttpError(422, 'INVALID_LATITUDE', 'Latitude must be between -90 and 90');
    }
  }

  if (location.longitude !== undefined) {
    if (location.longitude < -180 || location.longitude > 180) {
      throw new HttpError(422, 'INVALID_LONGITUDE', 'Longitude must be between -180 and 180');
    }
  }

  // Validate pincode if provided
  if (location.pincode) {
    const pincodeRegex = /^[0-9]{6}$/;
    if (!pincodeRegex.test(location.pincode.trim())) {
      throw new HttpError(422, 'INVALID_PINCODE_FORMAT', 'Pincode must be exactly 6 digits');
    }
  }

  // Build location object
  const locationData: any = {};
  if (location.latitude !== undefined && location.longitude !== undefined) {
    locationData.coordinates = {
      latitude: location.latitude,
      longitude: location.longitude,
    };
  }
  if (location.city) {
    locationData.city = location.city.trim();
  }
  if (location.pincode) {
    locationData.pincode = location.pincode.trim();
  }

  // Update user's preferred location
  const { error } = await supabaseAdmin
    .from('users')
    .update({
      preferred_location: Object.keys(locationData).length > 0 ? locationData : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) handleSupabaseError(error);
}

export async function getPreferredLocation(userId: string): Promise<{
  coordinates?: { latitude: number; longitude: number };
  city?: string;
  pincode?: string;
} | null> {
  if (!userId) {
    throw new HttpError(400, 'INVALID_USER', 'User ID is required');
  }

  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('preferred_location')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') { // Not found
      return null;
    }
    handleSupabaseError(error);
  }

  return user?.preferred_location || null;
}
