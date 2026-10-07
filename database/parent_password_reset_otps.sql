-- Guardian password-reset email OTPs. Apply once through the Supabase SQL editor.
-- Server routes access this table with the service-role key only.
CREATE TABLE IF NOT EXISTS public.parent_password_reset_otps (
  parent_id integer PRIMARY KEY REFERENCES public.parents(id) ON DELETE CASCADE,
  otp_hash text NOT NULL CHECK (char_length(otp_hash) = 64),
  expires_at timestamptz NOT NULL,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
  requested_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.parent_password_reset_otps ENABLE ROW LEVEL SECURITY;

-- Browser clients do not need access; the server uses SUPABASE_SERVICE_ROLE_KEY.
CREATE INDEX IF NOT EXISTS parent_password_reset_otps_expires_at_idx
  ON public.parent_password_reset_otps (expires_at);
