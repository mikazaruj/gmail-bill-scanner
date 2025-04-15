-- Table: public.email_sources

-- Comment: Trusted email sources

CREATE TABLE IF NOT EXISTS public.email_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  email_address TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS email_sources_user_id_idx ON public.email_sources (user_id);
CREATE INDEX IF NOT EXISTS email_sources_email_address_idx ON public.email_sources (email_address);

-- Enable RLS
ALTER TABLE public.email_sources ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own email sources" ON public.email_sources
  FOR SELECT USING (auth.uid()::text = user_id::text OR 
    user_id IN (SELECT id FROM public.users WHERE google_user_id = get_google_user_id()));

CREATE POLICY "Users can insert their own email sources" ON public.email_sources
  FOR INSERT WITH CHECK (auth.uid()::text = user_id::text OR 
    user_id IN (SELECT id FROM public.users WHERE google_user_id = get_google_user_id()));

CREATE POLICY "Users can update their own email sources" ON public.email_sources
  FOR UPDATE USING (auth.uid()::text = user_id::text OR 
    user_id IN (SELECT id FROM public.users WHERE google_user_id = get_google_user_id()));

CREATE POLICY "Users can delete their own email sources" ON public.email_sources
  FOR DELETE USING (auth.uid()::text = user_id::text OR 
    user_id IN (SELECT id FROM public.users WHERE google_user_id = get_google_user_id()));
