import { z } from 'zod';

const envSchema = z.object({
  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Twilio
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_WHATSAPP_FROM: z.string().min(1),

  // Google APIs
  GOOGLE_GEMINI_API_KEY: z.string().min(1),
  GOOGLE_CLOUD_TRANSLATION_API_KEY: z.string().min(1),
  GOOGLE_CLOUD_NL_API_KEY: z.string().min(1),
  GOOGLE_MAPS_API_KEY: z.string().min(1),

  // Razorpay
  RAZORPAY_KEY_ID: z.string().min(1),
  RAZORPAY_KEY_SECRET: z.string().min(1),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1),
  RAZORPAY_SUBSCRIPTION_WEBHOOK_SECRET: z.string().min(1),

  // Redis
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_BASE_URL: z.string().url().default('http://localhost:3000'),
  JWT_SECRET: z.string().min(32),
  PLATFORM_COMMISSION_RATE: z.coerce.number().default(2),
  MIN_SETTLEMENT_THRESHOLD: z.coerce.number().default(100),

  // Cron
  DELAY_CHECK_INTERVAL_SECONDS: z.coerce.number().default(60),
  SESSION_EXPIRY_MINUTES: z.coerce.number().default(30),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
