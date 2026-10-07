-- M-02: shared, server-side rate limiting for public report and OTP routes.
CREATE TABLE IF NOT EXISTS public.public_api_rate_limits (
  scope text NOT NULL,
  subject_hash text NOT NULL CHECK (char_length(subject_hash) = 64),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, subject_hash)
);

ALTER TABLE public.public_api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.public_api_rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_public_api_rate_limit(
  p_scope text,
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS TABLE(allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_row public.public_api_rate_limits%ROWTYPE;
  elapsed_seconds integer;
BEGIN
  IF p_scope !~ '^[a-z0-9_-]{1,80}$' OR char_length(p_subject_hash) <> 64
     OR p_limit < 1 OR p_limit > 1000 OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid rate-limit arguments';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_scope || ':' || p_subject_hash, 0));
  SELECT * INTO current_row FROM public.public_api_rate_limits
  WHERE scope = p_scope AND subject_hash = p_subject_hash FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.public_api_rate_limits(scope, subject_hash, request_count)
    VALUES (p_scope, p_subject_hash, 1);
    RETURN QUERY SELECT true, 0;
    RETURN;
  END IF;

  elapsed_seconds := floor(extract(epoch FROM now() - current_row.window_started_at));
  IF elapsed_seconds >= p_window_seconds THEN
    UPDATE public.public_api_rate_limits
    SET window_started_at = now(), request_count = 1, updated_at = now()
    WHERE scope = p_scope AND subject_hash = p_subject_hash;
    RETURN QUERY SELECT true, 0;
    RETURN;
  END IF;

  IF current_row.request_count >= p_limit THEN
    RETURN QUERY SELECT false, greatest(1, p_window_seconds - elapsed_seconds);
    RETURN;
  END IF;

  UPDATE public.public_api_rate_limits
  SET request_count = request_count + 1, updated_at = now()
  WHERE scope = p_scope AND subject_hash = p_subject_hash;
  RETURN QUERY SELECT true, 0;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_public_api_rate_limit(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_public_api_rate_limit(text, text, integer, integer) TO service_role;
