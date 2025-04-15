CREATE TABLE IF NOT EXISTS public.user_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  gmail_connected BOOLEAN DEFAULT false,
  gmail_email TEXT,
  gmail_last_connected_at TIMESTAMPTZ,
  gmail_scopes TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS user_connections_user_id_idx ON public.user_connections (user_id);
CREATE INDEX IF NOT EXISTS user_connections_gmail_email_idx ON public.user_connections (gmail_email);

-- Enable RLS
ALTER TABLE public.user_connections ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own connections" ON public.user_connections
  FOR SELECT USING (auth.uid()::text = user_id::text OR 
    user_id IN (SELECT id FROM public.users WHERE google_user_id = get_google_user_id()));

CREATE POLICY "Users can insert their own connections" ON public.user_connections
  FOR INSERT WITH CHECK (auth.uid()::text = user_id::text OR 
    user_id IN (SELECT id FROM public.users WHERE google_user_id = get_google_user_id()));

CREATE POLICY "Users can update their own connections" ON public.user_connections
  FOR UPDATE USING (auth.uid()::text = user_id::text OR 
    user_id IN (SELECT id FROM public.users WHERE google_user_id = get_google_user_id())); 