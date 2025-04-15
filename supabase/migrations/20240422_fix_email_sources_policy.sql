-- Drop all existing email_sources policies and disable RLS
DROP POLICY IF EXISTS "Users can view their own email sources" ON public.email_sources;
DROP POLICY IF EXISTS "Users can insert their own email sources" ON public.email_sources;
DROP POLICY IF EXISTS "Users can update their own email sources" ON public.email_sources;
DROP POLICY IF EXISTS "Users can delete their own email sources" ON public.email_sources;
DROP POLICY IF EXISTS "Users can manage their own email sources with Google ID" ON public.email_sources;
DROP POLICY IF EXISTS "Users can manage their own email sources" ON public.email_sources;
DROP POLICY IF EXISTS "Users can access their own email sources" ON public.email_sources;
DROP POLICY IF EXISTS "Authenticated users can access their own email sources" ON public.email_sources;
DROP POLICY IF EXISTS "Email sources are accessible by owner" ON public.email_sources;
DROP POLICY IF EXISTS "Email sources direct lookup policy" ON public.email_sources;
DROP POLICY IF EXISTS "Email sources effective user policy" ON public.email_sources;
DROP POLICY IF EXISTS "Email sources flexible policy" ON public.email_sources;
DROP POLICY IF EXISTS "Email sources google_id or auth policy" ON public.email_sources;
DROP POLICY IF EXISTS "Debug allow all for email sources" ON public.email_sources;

-- Completely disable RLS for debugging
ALTER TABLE public.email_sources DISABLE ROW LEVEL SECURITY; 