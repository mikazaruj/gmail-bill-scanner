CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  subscription_id UUID REFERENCES public.user_subscriptions(id),
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'usd',
  status TEXT DEFAULT 'pending',
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS payment_transactions_user_id_idx ON public.payment_transactions (user_id);
CREATE INDEX IF NOT EXISTS payment_transactions_subscription_id_idx ON public.payment_transactions (subscription_id);
CREATE INDEX IF NOT EXISTS payment_transactions_status_idx ON public.payment_transactions (status);
CREATE INDEX IF NOT EXISTS payment_transactions_provider_id_idx ON public.payment_transactions (provider_id);

-- Enable RLS
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own payment transactions" ON public.payment_transactions
  FOR SELECT USING (auth.uid()::text = user_id::text OR 
    user_id IN (SELECT id FROM public.users WHERE google_user_id = get_google_user_id()));

CREATE POLICY "Only service role can add transactions" ON public.payment_transactions
  FOR INSERT WITH CHECK (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Only service role can update transactions" ON public.payment_transactions
  FOR UPDATE USING (auth.jwt()->>'role' = 'service_role'); 