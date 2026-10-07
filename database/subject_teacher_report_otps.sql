-- Subject Teacher report verification. Apply once through the Supabase SQL Editor.
-- This table is server-only; OTP values are HMAC hashes and never stored in plaintext.
CREATE TABLE IF NOT EXISTS public.subject_teacher_report_otps (
  email text PRIMARY KEY,
  otp_hash text NOT NULL CHECK (char_length(otp_hash) = 64),
  expires_at timestamptz NOT NULL,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
  requested_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subject_teacher_report_otps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.subject_teacher_report_otps FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS subject_teacher_report_otps_expires_at_idx
  ON public.subject_teacher_report_otps (expires_at);
