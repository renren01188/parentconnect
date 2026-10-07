-- Public Contact Us submissions are written only by the server-side Supabase
-- service client. The idempotency key allows exactly one notification attempt
-- per browser submission, including when the browser retries a request.
CREATE TABLE IF NOT EXISTS public.contact_us_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  idempotency_key UUID NOT NULL UNIQUE,
  sender_name TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  sender_phone TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  notification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (notification_status IN ('pending', 'sent', 'failed', 'skipped')),
  notification_error TEXT,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.contact_us_messages ENABLE ROW LEVEL SECURITY;
