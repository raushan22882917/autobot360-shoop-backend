-- ============================================================
-- DukaanLive — RLS Policies
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_custom_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Helper: get current user role
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ===== users =====
CREATE POLICY "admin_all_users" ON public.users FOR ALL
  USING (public.current_user_role() = 'admin');

CREATE POLICY "user_own_profile" ON public.users FOR ALL
  USING (id = auth.uid());

-- ===== shops =====
CREATE POLICY "admin_all_shops" ON public.shops FOR ALL
  USING (public.current_user_role() = 'admin');

CREATE POLICY "owner_own_shops" ON public.shops FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "customer_active_shops" ON public.shops FOR SELECT
  USING (is_active = true);

-- ===== products =====
CREATE POLICY "admin_all_products" ON public.products FOR ALL
  USING (public.current_user_role() = 'admin');

CREATE POLICY "owner_own_products" ON public.products FOR ALL
  USING (
    shop_id IN (SELECT id FROM public.shops WHERE user_id = auth.uid())
  );

CREATE POLICY "customer_active_products" ON public.products FOR SELECT
  USING (
    is_active = true AND
    shop_id IN (SELECT id FROM public.shops WHERE is_active = true)
  );

-- ===== orders =====
CREATE POLICY "admin_all_orders" ON public.orders FOR ALL
  USING (public.current_user_role() = 'admin');

CREATE POLICY "owner_own_orders" ON public.orders FOR ALL
  USING (
    shop_id IN (SELECT id FROM public.shops WHERE user_id = auth.uid())
  );

CREATE POLICY "customer_insert_order" ON public.orders FOR INSERT
  WITH CHECK (true);

CREATE POLICY "customer_own_orders" ON public.orders FOR SELECT
  USING (customer_phone = (SELECT phone FROM public.users WHERE id = auth.uid()));

-- ===== shop_pricing =====
CREATE POLICY "admin_all_pricing" ON public.shop_pricing FOR ALL
  USING (public.current_user_role() = 'admin');

CREATE POLICY "owner_own_pricing" ON public.shop_pricing FOR ALL
  USING (shop_id IN (SELECT id FROM public.shops WHERE user_id = auth.uid()));

CREATE POLICY "customer_active_pricing" ON public.shop_pricing FOR SELECT
  USING (shop_id IN (SELECT id FROM public.shops WHERE is_active = true));

-- ===== shop_custom_charges =====
CREATE POLICY "owner_own_charges" ON public.shop_custom_charges FOR ALL
  USING (shop_id IN (SELECT id FROM public.shops WHERE user_id = auth.uid()));

CREATE POLICY "customer_active_charges" ON public.shop_custom_charges FOR SELECT
  USING (shop_id IN (SELECT id FROM public.shops WHERE is_active = true));

CREATE POLICY "admin_all_charges" ON public.shop_custom_charges FOR ALL
  USING (public.current_user_role() = 'admin');

-- ===== shop_hours =====
CREATE POLICY "owner_own_hours" ON public.shop_hours FOR ALL
  USING (shop_id IN (SELECT id FROM public.shops WHERE user_id = auth.uid()));

CREATE POLICY "public_shop_hours" ON public.shop_hours FOR SELECT
  USING (shop_id IN (SELECT id FROM public.shops WHERE is_active = true));

-- ===== shop_coupons =====
CREATE POLICY "owner_own_coupons" ON public.shop_coupons FOR ALL
  USING (shop_id IN (SELECT id FROM public.shops WHERE user_id = auth.uid()));

CREATE POLICY "admin_all_coupons" ON public.shop_coupons FOR ALL
  USING (public.current_user_role() = 'admin');

-- ===== shop_analytics =====
CREATE POLICY "owner_own_analytics" ON public.shop_analytics FOR ALL
  USING (shop_id IN (SELECT id FROM public.shops WHERE user_id = auth.uid()));

CREATE POLICY "admin_all_analytics" ON public.shop_analytics FOR ALL
  USING (public.current_user_role() = 'admin');

-- ===== shop_settlements =====
CREATE POLICY "admin_all_settlements" ON public.shop_settlements FOR ALL
  USING (public.current_user_role() = 'admin');

CREATE POLICY "owner_own_settlements" ON public.shop_settlements FOR SELECT
  USING (shop_owner_id = auth.uid());

-- ===== delivery_agents =====
CREATE POLICY "owner_own_agents" ON public.delivery_agents FOR ALL
  USING (shop_id IN (SELECT id FROM public.shops WHERE user_id = auth.uid()));

CREATE POLICY "admin_all_agents" ON public.delivery_agents FOR ALL
  USING (public.current_user_role() = 'admin');

-- ===== delivery_tracking =====
CREATE POLICY "admin_all_tracking" ON public.delivery_tracking FOR ALL
  USING (public.current_user_role() = 'admin');

CREATE POLICY "owner_own_tracking" ON public.delivery_tracking FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM public.orders
      WHERE shop_id IN (SELECT id FROM public.shops WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "customer_own_tracking" ON public.delivery_tracking FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM public.orders
      WHERE customer_phone = (SELECT phone FROM public.users WHERE id = auth.uid())
    )
  );

-- ===== whatsapp_sessions =====
-- Service role only — all JWT clients are blocked
CREATE POLICY "service_role_only_sessions" ON public.whatsapp_sessions FOR ALL
  USING (false);

-- ===== onboarding_steps =====
CREATE POLICY "owner_own_onboarding" ON public.onboarding_steps FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "admin_all_onboarding" ON public.onboarding_steps FOR ALL
  USING (public.current_user_role() = 'admin');

-- ===== platform_settings =====
CREATE POLICY "admin_platform_settings" ON public.platform_settings FOR ALL
  USING (public.current_user_role() = 'admin');

CREATE POLICY "service_read_settings" ON public.platform_settings FOR SELECT
  USING (true);
