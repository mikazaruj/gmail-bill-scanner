-- Create UUID extension if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create field_definitions table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  field_type TEXT DEFAULT 'text',
  default_enabled BOOLEAN DEFAULT true,
  default_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS field_definitions_name_idx ON public.field_definitions (name);
CREATE INDEX IF NOT EXISTS field_definitions_default_order_idx ON public.field_definitions (default_order);

-- Enable RLS
ALTER TABLE public.field_definitions ENABLE ROW LEVEL SECURITY;

-- Create policies
DROP POLICY IF EXISTS "Anyone can read field definitions" ON public.field_definitions;
CREATE POLICY "Anyone can read field definitions" ON public.field_definitions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Only service role can modify field definitions" ON public.field_definitions;
CREATE POLICY "Only service role can modify field definitions" ON public.field_definitions
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Insert default fields if they don't exist
INSERT INTO public.field_definitions (name, display_name, field_type, default_enabled, default_order) 
VALUES
  ('date', 'Date', 'date', true, 1),
  ('amount', 'Amount', 'currency', true, 2),
  ('vendor', 'Vendor', 'text', true, 3),
  ('category', 'Category', 'text', true, 4),
  ('description', 'Description', 'text', true, 5),
  ('invoice_number', 'Invoice Number', 'text', true, 6),
  ('due_date', 'Due Date', 'date', true, 7),
  ('status', 'Status', 'enum', true, 8),
  ('payment_method', 'Payment Method', 'text', false, 9),
  ('notes', 'Notes', 'text', false, 10)
ON CONFLICT (name) DO NOTHING;

-- Create/update user_field_mappings table
CREATE TABLE IF NOT EXISTS public.user_field_mappings (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID NOT NULL,
  field_id UUID NOT NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  column_mapping TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT user_field_mappings_user_id_column_mapping_key UNIQUE (user_id, column_mapping),
  CONSTRAINT user_field_mappings_user_id_field_id_key UNIQUE (user_id, field_id),
  CONSTRAINT user_field_mappings_field_id_fkey FOREIGN KEY (field_id) REFERENCES public.field_definitions (id) ON DELETE CASCADE,
  CONSTRAINT user_field_mappings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS user_field_mappings_user_id_idx ON public.user_field_mappings (user_id);
CREATE INDEX IF NOT EXISTS user_field_mappings_field_id_idx ON public.user_field_mappings (field_id);

-- Add RLS policies
ALTER TABLE public.user_field_mappings ENABLE ROW LEVEL SECURITY;

-- Users can read their own field mappings
DROP POLICY IF EXISTS "Users can read their own field mappings" ON public.user_field_mappings;
CREATE POLICY "Users can read their own field mappings" 
ON public.user_field_mappings FOR SELECT 
USING (user_id = auth.uid());

-- Users can update their own field mappings
DROP POLICY IF EXISTS "Users can update their own field mappings" ON public.user_field_mappings;
CREATE POLICY "Users can update their own field mappings" 
ON public.user_field_mappings FOR UPDATE 
USING (user_id = auth.uid());

-- Users can insert their own field mappings
DROP POLICY IF EXISTS "Users can insert their own field mappings" ON public.user_field_mappings;
CREATE POLICY "Users can insert their own field mappings" 
ON public.user_field_mappings FOR INSERT 
WITH CHECK (user_id = auth.uid());

-- Users can delete their own field mappings
DROP POLICY IF EXISTS "Users can delete their own field mappings" ON public.user_field_mappings;
CREATE POLICY "Users can delete their own field mappings" 
ON public.user_field_mappings FOR DELETE 
USING (user_id = auth.uid());

-- Service role can do anything with field mappings
DROP POLICY IF EXISTS "Service role can manage all field mappings" ON public.user_field_mappings;
CREATE POLICY "Service role can manage all field mappings" 
ON public.user_field_mappings FOR ALL 
USING (auth.jwt()->>'role' = 'service_role');

-- Recreate the field_mapping_view to ensure it's up to date
DROP VIEW IF EXISTS public.field_mapping_view;
CREATE VIEW public.field_mapping_view AS
SELECT 
  ufm.user_id,
  ufm.id AS mapping_id,
  fd.id AS field_id,
  fd.name,
  fd.display_name,
  fd.field_type,
  ufm.column_mapping,
  ufm.display_order,
  ufm.is_enabled
FROM public.user_field_mappings ufm
  JOIN public.field_definitions fd ON ufm.field_id = fd.id
ORDER BY ufm.display_order; 