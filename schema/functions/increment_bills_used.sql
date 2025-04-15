CREATE OR REPLACE FUNCTION public.increment_bills_used()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.users
  SET quota_bills_used = quota_bills_used + 1
  WHERE id = NEW.user_id;
  
  RETURN NEW;
END;
$$; 