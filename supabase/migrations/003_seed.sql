-- ============================================================
-- DukaanLive — Seed Data
-- ============================================================

INSERT INTO public.platform_settings (key, value, updated_at) VALUES
  ('platform_commission_rate', '2', now()),
  ('min_settlement_threshold', '100', now())
ON CONFLICT (key) DO NOTHING;
