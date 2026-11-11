-- A target may have only one recoverable deletion request at a time. The API
-- preflight provides a friendly message, while this constraint closes the
-- concurrent-request race between that read and the insert.

BEGIN;

-- Do not silently change existing history if an older deployment already has
-- duplicate active requests. Resolve those records deliberately before retrying
-- this migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.scheduled_deletions
    WHERE status IN ('PendingICT', 'Scheduled')
    GROUP BY target_type, target_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'Cannot enforce one active scheduled deletion per target while duplicate active requests exist.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS scheduled_deletions_one_active_target_idx
  ON public.scheduled_deletions (target_type, target_id)
  WHERE status IN ('PendingICT', 'Scheduled');

COMMIT;
