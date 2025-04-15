-- Table: public.processed_items

-- Comment: Processed email items

CREATE TABLE IF NOT EXISTS public.processed_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  message_id TEXT NOT NULL,
  source_email TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT now(),
  status TEXT NOT NULL,
  error_message TEXT,
  sheet_id TEXT,
  extracted_data JSONB
);

-- Add indexes
CREATE INDEX IF NOT EXISTS processed_items_user_id_idx ON public.processed_items (user_id);
CREATE INDEX IF NOT EXISTS processed_items_status_idx ON public.processed_items (status);
CREATE INDEX IF NOT EXISTS processed_items_message_id_idx ON public.processed_items (message_id);

-- Enable RLS
ALTER TABLE public.processed_items ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own processed items" ON public.processed_items
  FOR SELECT USING (auth.uid()::text = user_id::text OR 
    user_id IN (SELECT id FROM public.users WHERE google_user_id = get_google_user_id()));

-- Create trigger for bill quota tracking
CREATE TRIGGER on_processed_item_created
  AFTER INSERT ON public.processed_items
  FOR EACH ROW
  EXECUTE FUNCTION increment_bills_used();
