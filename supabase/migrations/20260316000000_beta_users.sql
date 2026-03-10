-- Add is_beta flag to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_beta boolean NOT NULL DEFAULT false;

-- Update handle_new_user trigger to set is_beta from signup metadata.
-- When a user signs up via the beta URL, the client passes { data: { is_beta: true } }
-- to supabase.auth.signUp(), which lands in raw_user_meta_data.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, is_beta)
  VALUES (
    new.id,
    COALESCE(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    COALESCE((new.raw_user_meta_data ->> 'is_beta')::boolean, false)
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
