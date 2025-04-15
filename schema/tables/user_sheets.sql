CREATE TABLE IF NOT EXISTS public.user_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  sheet_id TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  is_connected BOOLEAN DEFAULT true,
  last_connected_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS user_sheets_user_id_idx ON public.user_sheets (user_id);
CREATE INDEX IF NOT EXISTS user_sheets_sheet_id_idx ON public.user_sheets (sheet_id);

-- Enable RLS
ALTER TABLE public.user_sheets ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own sheets" ON public.user_sheets
  FOR SELECT USING (auth.uid()::text = user_id::text OR 
    user_id IN (SELECT id FROM public.users WHERE google_user_id = get_google_user_id()));

CREATE POLICY "Users can insert their own sheets" ON public.user_sheets
  FOR INSERT WITH CHECK (auth.uid()::text = user_id::text OR 
    user_id IN (SELECT id FROM public.users WHERE google_user_id = get_google_user_id()));

CREATE POLICY "Users can update their own sheets" ON public.user_sheets
  FOR UPDATE USING (auth.uid()::text = user_id::text OR 
    user_id IN (SELECT id FROM public.users WHERE google_user_id = get_google_user_id())); 