-- Fix RLS policies for email_sources table
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own email sources" ON public.email_sources;
DROP POLICY IF EXISTS "Users can insert their own email sources" ON public.email_sources;
DROP POLICY IF EXISTS "Users can update their own email sources" ON public.email_sources;
DROP POLICY IF EXISTS "Users can delete their own email sources" ON public.email_sources;

-- Recreate policies with simplified conditions and using get_google_user_id() function
CREATE POLICY "Users can view their own email sources" ON public.email_sources
  FOR SELECT USING (
    auth.uid()::text = user_id::text 
    OR user_id IN (
      SELECT id FROM public.users 
      WHERE google_user_id = get_google_user_id()
    )
  );

CREATE POLICY "Users can insert their own email sources" ON public.email_sources
  FOR INSERT WITH CHECK (
    auth.uid()::text = user_id::text 
    OR user_id IN (
      SELECT id FROM public.users 
      WHERE google_user_id = get_google_user_id()
    )
  );

CREATE POLICY "Users can update their own email sources" ON public.email_sources
  FOR UPDATE USING (
    auth.uid()::text = user_id::text 
    OR user_id IN (
      SELECT id FROM public.users 
      WHERE google_user_id = get_google_user_id()
    )
  );

CREATE POLICY "Users can delete their own email sources" ON public.email_sources
  FOR DELETE USING (
    auth.uid()::text = user_id::text 
    OR user_id IN (
      SELECT id FROM public.users 
      WHERE google_user_id = get_google_user_id()
    )
  ); 