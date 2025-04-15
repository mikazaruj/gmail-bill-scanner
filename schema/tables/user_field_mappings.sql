CREATE TABLE IF NOT EXISTS public.user_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  field_id UUID REFERENCES public.field_definitions(id),
  column_mapping TEXT DEFAULT NULL,
  display_order INTEGER NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS user_field_mappings_user_id_idx ON public.user_field_mappings (user_id);
CREATE INDEX IF NOT EXISTS user_field_mappings_field_id_idx ON public.user_field_mappings (field_id);
CREATE INDEX IF NOT EXISTS user_field_mappings_display_order_idx ON public.user_field_mappings (display_order);

-- Enable RLS
ALTER TABLE public.user_field_mappings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own field mappings" ON public.user_field_mappings
  FOR SELECT USING (auth.uid()::text = user_id::text OR 
    user_id IN (SELECT id FROM public.users WHERE google_user_id = get_google_user_id()));

CREATE POLICY "Users can insert their own field mappings" ON public.user_field_mappings
  FOR INSERT WITH CHECK (auth.uid()::text = user_id::text OR 
    user_id IN (SELECT id FROM public.users WHERE google_user_id = get_google_user_id()));

CREATE POLICY "Users can update their own field mappings" ON public.user_field_mappings
  FOR UPDATE USING (auth.uid()::text = user_id::text OR 
    user_id IN (SELECT id FROM public.users WHERE google_user_id = get_google_user_id())); 