-- One-time setup for admin account.
-- Run this in Supabase SQL Editor.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_is_admin ON public.users(is_admin);

INSERT INTO public.users (
  email,
  username,
  password,
  is_admin,
  confirmed_at,
  confirmation_token,
  token_expiry,
  created_at,
  updated_at
)
VALUES (
  'toby@hotunda.com',
  'toby',
  '8d7bdc0c898dd277b3858f2d1e73e3020d49cf69786d6f863b55afc5731de8d7',
  TRUE,
  NOW(),
  NULL,
  NULL,
  NOW(),
  NOW()
)
ON CONFLICT (email)
DO UPDATE SET
  username = EXCLUDED.username,
  password = EXCLUDED.password,
  is_admin = TRUE,
  confirmed_at = NOW(),
  confirmation_token = NULL,
  token_expiry = NULL,
  updated_at = NOW();
