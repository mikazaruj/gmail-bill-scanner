CREATE TABLE IF NOT EXISTS public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  last_digits TEXT,
  expiry_month INTEGER,
  expiry_year INTEGER,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS payment_methods_user_id_idx ON public.payment_methods (user_id);
CREATE INDEX IF NOT EXISTS payment_methods_provider_id_idx ON public.payment_methods (provider_id);

-- Enable RLS
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own payment methods" ON public.payment_methods
  FOR SELECT USING (auth.uid()::text = user_id::text OR 
    user_id IN (SELECT id FROM public.users WHERE google_user_id = get_google_user_id()));

CREATE POLICY "Only service role can add payment methods" ON public.payment_methods
  FOR INSERT WITH CHECK (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Only service role can update payment methods" ON public.payment_methods
  FOR UPDATE USING (auth.jwt()->>'role' = 'service_role'); 