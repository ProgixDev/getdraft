-- 011: Phone signup support
--
-- Allow users to register with a phone number only (no email). Adds
-- a nullable phone column, makes email nullable, and enforces that
-- AT LEAST ONE contact method is set. The handle_new_user trigger
-- is updated to copy both columns from auth.users.

ALTER TABLE public.users
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique
  ON public.users(phone)
  WHERE phone IS NOT NULL;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_email_or_phone;
ALTER TABLE public.users
  ADD CONSTRAINT users_email_or_phone
  CHECK (email IS NOT NULL OR phone IS NOT NULL);

-- Refresh the trigger to populate phone too.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, phone, role, name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    COALESCE(NEW.raw_user_meta_data->>'role', 'athlete'),
    COALESCE(NEW.raw_user_meta_data->>'name', '')
  );
  INSERT INTO public.subscriptions (user_id, plan_id, daily_swipe_limit)
  VALUES (NEW.id, 'basic', 10);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
