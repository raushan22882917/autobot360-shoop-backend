# DukaanLive Backend

A Node.js + TypeScript + Fastify backend API for DukaanLive.

## Railway Deployment

This project is configured for Railway deployment with the following setup:

### Required Environment Variables

Set these in your Railway project settings:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# Google APIs
GOOGLE_GEMINI_API_KEY=your-gemini-api-key
GOOGLE_CLOUD_TRANSLATION_API_KEY=your-translation-api-key
GOOGLE_CLOUD_NL_API_KEY=your-nl-api-key
GOOGLE_MAPS_API_KEY=your-maps-api-key

# Razorpay
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your-key-secret
RAZORPAY_WEBHOOK_SECRET=your-webhook-secret
RAZORPAY_SUBSCRIPTION_WEBHOOK_SECRET=your-subscription-webhook-secret

# Redis
REDIS_URL=redis://your-redis-url

# App
NODE_ENV=production
PORT=3000
API_BASE_URL=https://your-railway-app-url.railway.app
JWT_SECRET=your-jwt-secret-for-agent-tokens
PLATFORM_COMMISSION_RATE=2
MIN_SETTLEMENT_THRESHOLD=100

# Cron
DELAY_CHECK_INTERVAL_SECONDS=60
SESSION_EXPIRY_MINUTES=30
```

### Deployment Steps

1. Install Railway CLI:
   ```bash
   npm install -g @railway/cli
   ```

2. Login to Railway:
   ```bash
   railway login
   ```

3. Initialize Railway project:
   ```bash
   cd dukaanlive-backend
   railway init
   ```

4. Deploy:
   ```bash
   railway up
   ```

### Alternative: GitHub Integration

1. Push your code to GitHub
2. Connect your GitHub repository to Railway
3. Railway will automatically deploy on push

### Health Check

The app exposes a health check endpoint at `/health`

### Build Process

- Uses Nixpacks for building
- Installs dependencies with `npm ci`
- Builds TypeScript with `npm run build`
- Starts with `npm start`
