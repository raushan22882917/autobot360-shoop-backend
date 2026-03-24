-- ============================================================
-- DukaanLive — Initial Schema
-- ============================================================

-- ===== users =====
CREATE TABLE public.users (
  id                        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone                     VARCHAR(15) NOT NULL UNIQUE,
  name                      VARCHAR(100),
  role                      VARCHAR(20) NOT NULL DEFAULT 'user'
                              CHECK (role IN ('admin', 'shop_owner', 'user')),
  language_code             VARCHAR(10),
  preferred_location        JSONB,
  plan                      VARCHAR(20) NOT NULL DEFAULT 'free'
                              CHECK (plan IN ('free', 'pro', 'business')),
  subscription_status       VARCHAR(20)
                              CHECK (subscription_status IN ('active','cancelled','past_due','trialing')),
  razorpay_subscription_id  VARCHAR(100),
  plan_expires_at           TIMESTAMPTZ,
  razorpay_account_id       VARCHAR(100),
  payout_method             VARCHAR(10) CHECK (payout_method IN ('bank','upi')),
  payout_details            JSONB,
  onboarding_complete       BOOLEAN NOT NULL DEFAULT false,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== shops =====
CREATE TABLE public.shops (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name                    VARCHAR(200) NOT NULL,
  slug                    VARCHAR(100) NOT NULL UNIQUE,
  category                VARCHAR(100) NOT NULL,
  description             TEXT,
  logo_url                TEXT,
  latitude                NUMERIC NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude               NUMERIC NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  address                 TEXT NOT NULL,
  city                    VARCHAR(100) NOT NULL,
  pincode                 CHAR(6) NOT NULL CHECK (pincode ~ '^[0-9]{6}$'),
  state                   VARCHAR(100) NOT NULL,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  online_payment_enabled  BOOLEAN NOT NULL DEFAULT false,
  delivery_radius_km      INTEGER NOT NULL DEFAULT 1 CHECK (delivery_radius_km BETWEEN 1 AND 5),
  whatsapp_number         VARCHAR(15),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shops_user_id    ON public.shops(user_id);
CREATE INDEX idx_shops_slug       ON public.shops(slug);
CREATE INDEX idx_shops_city       ON public.shops(city);
CREATE INDEX idx_shops_pincode    ON public.shops(pincode);
CREATE INDEX idx_shops_location   ON public.shops(latitude, longitude);
CREATE INDEX idx_shops_is_active  ON public.shops(is_active);

-- ===== products =====
CREATE TABLE public.products (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name                VARCHAR(200) NOT NULL,
  description         TEXT,
  price               NUMERIC NOT NULL CHECK (price > 0),
  image_url           TEXT,
  image_storage_path  TEXT,
  stock_quantity      INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  out_of_stock        BOOLEAN NOT NULL DEFAULT false,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_shop_id   ON public.products(shop_id);
CREATE INDEX idx_products_is_active ON public.products(is_active);

-- ===== shop_pricing =====
CREATE TABLE public.shop_pricing (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                 UUID NOT NULL UNIQUE REFERENCES public.shops(id) ON DELETE CASCADE,
  delivery_charge         NUMERIC NOT NULL DEFAULT 0 CHECK (delivery_charge >= 0),
  free_delivery           BOOLEAN NOT NULL DEFAULT false,
  free_delivery_threshold NUMERIC,
  service_charge_type     VARCHAR(10) NOT NULL DEFAULT 'flat'
                            CHECK (service_charge_type IN ('flat','percentage')),
  service_charge_value    NUMERIC NOT NULL DEFAULT 0 CHECK (service_charge_value >= 0),
  min_order_value         NUMERIC NOT NULL DEFAULT 0 CHECK (min_order_value >= 0),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== shop_custom_charges =====
CREATE TABLE public.shop_custom_charges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id    UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  amount     NUMERIC NOT NULL CHECK (amount > 0),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_custom_charges_shop_id ON public.shop_custom_charges(shop_id);

-- ===== shop_hours =====
CREATE TABLE public.shop_hours (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time   TIME,
  close_time  TIME,
  is_closed   BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (shop_id, day_of_week)
);

-- ===== shop_coupons =====
CREATE TABLE public.shop_coupons (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id        UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  code           VARCHAR(20) NOT NULL,
  discount_type  VARCHAR(10) NOT NULL CHECK (discount_type IN ('flat','percentage')),
  discount_value NUMERIC NOT NULL CHECK (discount_value > 0),
  max_usage      INTEGER,
  used_count     INTEGER NOT NULL DEFAULT 0,
  expires_at     TIMESTAMPTZ,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, code)
);

-- ===== shop_analytics =====
CREATE TABLE public.shop_analytics (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  date    DATE NOT NULL,
  views   INTEGER NOT NULL DEFAULT 0,
  orders  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (shop_id, date)
);

CREATE INDEX idx_shop_analytics_shop_date ON public.shop_analytics(shop_id, date);

-- ===== shop_settlements =====
CREATE TABLE public.shop_settlements (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id              UUID NOT NULL REFERENCES public.shops(id),
  shop_owner_id        UUID NOT NULL REFERENCES public.users(id),
  razorpay_transfer_id VARCHAR(100),
  total_order_amount   NUMERIC NOT NULL,
  commission_amount    NUMERIC NOT NULL,
  settled_amount       NUMERIC NOT NULL,
  status               VARCHAR(20) NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','processing','completed','failed')),
  settled_at           TIMESTAMPTZ,
  order_ids            JSONB NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_settlements_shop_id  ON public.shop_settlements(shop_id);
CREATE INDEX idx_settlements_owner_id ON public.shop_settlements(shop_owner_id);
CREATE INDEX idx_settlements_status   ON public.shop_settlements(status);

-- ===== orders (depends on shop_settlements for FK) =====
CREATE TABLE public.orders (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                    UUID NOT NULL REFERENCES public.shops(id),
  customer_name              VARCHAR(100) NOT NULL,
  customer_phone             VARCHAR(15) NOT NULL,
  customer_message           TEXT,
  status                     VARCHAR(20) NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','confirmed','out_for_delivery','delivered','cancelled')),
  payment_status             VARCHAR(20) NOT NULL DEFAULT 'pending'
                               CHECK (payment_status IN ('pending','paid','failed','refunded','settled')),
  payment_mode               VARCHAR(10) NOT NULL DEFAULT 'cod'
                               CHECK (payment_mode IN ('online','cod')),
  razorpay_order_id          VARCHAR(100),
  razorpay_payment_id        VARCHAR(100),
  razorpay_signature         TEXT,
  settlement_id              UUID REFERENCES public.shop_settlements(id),
  delivery_address_line      TEXT NOT NULL,
  delivery_city              VARCHAR(100) NOT NULL,
  delivery_pincode           CHAR(6) NOT NULL,
  delivery_latitude          NUMERIC NOT NULL,
  delivery_longitude         NUMERIC NOT NULL,
  payment_snapshot           JSONB NOT NULL,
  platform_commission_rate   NUMERIC NOT NULL,
  platform_commission_amount NUMERIC NOT NULL,
  shop_settlement_amount     NUMERIC NOT NULL,
  coupon_id                  UUID REFERENCES public.shop_coupons(id),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_shop_id        ON public.orders(shop_id);
CREATE INDEX idx_orders_customer_phone ON public.orders(customer_phone);
CREATE INDEX idx_orders_status         ON public.orders(status);
CREATE INDEX idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX idx_orders_created_at     ON public.orders(created_at DESC);

-- ===== delivery_agents =====
CREATE TABLE public.delivery_agents (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                  UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name                     VARCHAR(100) NOT NULL,
  phone                    VARCHAR(15) NOT NULL,
  is_active                BOOLEAN NOT NULL DEFAULT true,
  current_latitude         NUMERIC,
  current_longitude        NUMERIC,
  last_location_updated_at TIMESTAMPTZ,
  agent_token              VARCHAR(64),
  agent_token_expires_at   TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agents_shop_id ON public.delivery_agents(shop_id);

-- ===== delivery_tracking =====
CREATE TABLE public.delivery_tracking (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                  UUID NOT NULL UNIQUE REFERENCES public.orders(id),
  delivery_agent_id         UUID NOT NULL REFERENCES public.delivery_agents(id),
  tracking_status           VARCHAR(20) NOT NULL DEFAULT 'assigned'
                              CHECK (tracking_status IN ('assigned','picked_up','out_for_delivery','nearby','delayed','delivered')),
  route_polyline            TEXT,
  total_distance_metres     INTEGER,
  total_duration_seconds    INTEGER,
  remaining_distance_metres INTEGER,
  eta_seconds               INTEGER,
  eta_datetime              TIMESTAMPTZ,
  promised_delivery_at      TIMESTAMPTZ NOT NULL,
  is_delayed                BOOLEAN NOT NULL DEFAULT false,
  picked_up_at              TIMESTAMPTZ,
  delivered_at              TIMESTAMPTZ,
  location_history          JSONB NOT NULL DEFAULT '[]',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tracking_order_id ON public.delivery_tracking(order_id);
CREATE INDEX idx_tracking_agent_id ON public.delivery_tracking(delivery_agent_id);
CREATE INDEX idx_tracking_status   ON public.delivery_tracking(tracking_status);

-- ===== whatsapp_sessions =====
CREATE TABLE public.whatsapp_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone     VARCHAR(15) NOT NULL UNIQUE,
  messages       JSONB NOT NULL DEFAULT '[]',
  language_code  VARCHAR(10) NOT NULL DEFAULT 'en',
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_sessions_phone       ON public.whatsapp_sessions(user_phone);
CREATE INDEX idx_wa_sessions_last_active ON public.whatsapp_sessions(last_active_at);

-- ===== onboarding_steps =====
CREATE TABLE public.onboarding_steps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  create_shop  BOOLEAN NOT NULL DEFAULT false,
  add_product  BOOLEAN NOT NULL DEFAULT false,
  set_pricing  BOOLEAN NOT NULL DEFAULT false,
  go_live      BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ
);

-- ===== platform_settings =====
CREATE TABLE public.platform_settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      VARCHAR(500) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
