CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  price_monthly INTEGER NOT NULL,
  price_yearly INTEGER NOT NULL,
  features JSONB DEFAULT '{}',
  max_trusted_sources INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS subscription_plans_name_idx ON public.subscription_plans (name);

-- Enable RLS
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can read subscription plans" ON public.subscription_plans
  FOR SELECT USING (true);

CREATE POLICY "Only service role can modify plans" ON public.subscription_plans
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Default plans
INSERT INTO public.subscription_plans (name, display_name, price_monthly, price_yearly, max_trusted_sources, features)
VALUES 
  ('free', 'Free Tier', 0, 0, 3, '{"max_bills": 50, "support": "community"}'),
  ('pro', 'Pro Plan', 999, 9990, 20, '{"max_bills": 500, "support": "email", "attachments": true, "schedule": true}'),
  ('business', 'Business Plan', 2499, 24990, 100, '{"max_bills": 5000, "support": "priority", "attachments": true, "schedule": true, "api_access": true}')
ON CONFLICT (name) DO NOTHING; 