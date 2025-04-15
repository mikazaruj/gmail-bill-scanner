-- Table: public.users

-- Comment: Users table

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  auth_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  plan TEXT DEFAULT 'free',
  quota_bills_monthly INTEGER DEFAULT 50,
  quota_bills_used INTEGER DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  google_user_id TEXT
);

-- Add indexes
CREATE INDEX IF NOT EXISTS users_email_idx ON public.users (email);
CREATE INDEX IF NOT EXISTS users_google_user_id_idx ON public.users (google_user_id);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own data" ON public.users
  FOR SELECT USING (auth.uid() = id OR google_user_id = get_google_user_id());

CREATE POLICY "Users can update their own data" ON public.users
  FOR UPDATE USING (auth.uid() = id OR google_user_id = get_google_user_id());
