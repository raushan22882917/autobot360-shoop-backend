export type Role = 'admin' | 'shop_owner' | 'user';
export type Plan = 'free' | 'pro' | 'business';
export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'trialing';
export type OrderStatus = 'pending' | 'confirmed' | 'out_for_delivery' | 'delivered' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'settled';
export type PaymentMode = 'online' | 'cod';
export type ServiceChargeType = 'flat' | 'percentage';
export type DiscountType = 'flat' | 'percentage';
export type SettlementStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type TrackingStatus = 'assigned' | 'picked_up' | 'out_for_delivery' | 'nearby' | 'delayed' | 'delivered';
export type PayoutMethod = 'bank' | 'upi';

export interface AuthUser {
  id: string;
  phone: string;
  role: Role;
  plan: Plan;
  language_code?: string;
  onboarding_complete: boolean;
}

export interface PlanLimits {
  maxProducts: number;
  maxOrdersPerMonth: number;
  maxShops: number;
  whatsappBot: boolean;
  analytics: false | 'basic' | 'advanced';
  bulkImport: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    maxProducts: 10,
    maxOrdersPerMonth: 50,
    maxShops: 1,
    whatsappBot: false,
    analytics: false,
    bulkImport: false,
  },
  pro: {
    maxProducts: 100,
    maxOrdersPerMonth: 500,
    maxShops: 1,
    whatsappBot: true,
    analytics: 'basic',
    bulkImport: true,
  },
  business: {
    maxProducts: Infinity,
    maxOrdersPerMonth: Infinity,
    maxShops: 5,
    whatsappBot: true,
    analytics: 'advanced',
    bulkImport: true,
  },
};

export const SUPPORTED_LANGUAGES = [
  'hi', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa', 'or', 'ur', 'en',
] as const;

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];
