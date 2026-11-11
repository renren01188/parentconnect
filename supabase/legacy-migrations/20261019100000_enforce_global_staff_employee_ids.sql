-- A staff Employee ID identifies one person across every staff role. PostgreSQL
-- unique indexes cannot span multiple tables, so this registry is maintained by
-- triggers on the four staff account tables. The primary key is the final,
-- concurrent-safe database boundary for Adviser, ICT, Guidance, and Principal
-- account creation and editing.

BEGIN;

CREATE TABLE IF NOT EXISTS public.staff_employee_ids (
  employee_id_key text PRIMARY KEY,
  employee_id text NOT NULL,
  account_role text NOT NULL CHECK (account_role IN ('Adviser', 'ICT', 'Guidance', 'Principal')),
  account_id bigint NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_employee_ids ENABLE ROW LEVEL SECURITY;

-- Re-select an owner after an old record is changed or deleted. This also
-- preserves the protection for a legacy duplicate that we intentionally leave
-- untouched during migration.
CREATE OR REPLACE FUNCTION public.refresh_staff_employee_id_registry(
  p_employee_id_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.staff_employee_ids
  WHERE employee_id_key = p_employee_id_key;

  INSERT INTO public.staff_employee_ids (
    employee_id_key, employee_id, account_role, account_id, updated_at
  )
  SELECT employee_id_key, employee_id, account_role, account_id, now()
  FROM (
    SELECT lower(btrim(employee_id)) AS employee_id_key, btrim(employee_id) AS employee_id,
      'Adviser'::text AS account_role, id::bigint AS account_id, 1 AS role_order
    FROM public.advisers
    WHERE btrim(coalesce(employee_id, '')) <> ''
    UNION ALL
    SELECT lower(btrim(employee_id)), btrim(employee_id), 'ICT'::text, id::bigint, 2
    FROM public.ict_admins
    WHERE btrim(coalesce(employee_id, '')) <> ''
    UNION ALL
    SELECT lower(btrim(employee_id)), btrim(employee_id), 'Guidance'::text, id::bigint, 3
    FROM public.guidance_counselors
    WHERE btrim(coalesce(employee_id, '')) <> ''
    UNION ALL
    SELECT lower(btrim(employee_id)), btrim(employee_id), 'Principal'::text, id::bigint, 4
    FROM public.principals
    WHERE btrim(coalesce(employee_id, '')) <> ''
  ) AS staff_records
  WHERE employee_id_key = p_employee_id_key
  ORDER BY role_order, account_id
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_staff_employee_id_registry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_employee_id_key text;
  old_employee_id_key text;
  existing_role text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    old_employee_id_key := lower(btrim(coalesce(OLD.employee_id, '')));
    IF old_employee_id_key <> '' THEN
      DELETE FROM public.staff_employee_ids
      WHERE employee_id_key = old_employee_id_key
        AND account_role = TG_ARGV[0]
        AND account_id = OLD.id;

      IF FOUND THEN
        PERFORM public.refresh_staff_employee_id_registry(old_employee_id_key);
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  new_employee_id_key := lower(btrim(coalesce(NEW.employee_id, '')));
  old_employee_id_key := '';
  IF TG_OP = 'UPDATE' THEN
    old_employee_id_key := lower(btrim(coalesce(OLD.employee_id, '')));
  END IF;

  -- Legacy blank IDs are not claimed by the registry. New server endpoints
  -- require a non-empty Employee ID before a row can be created or edited.
  IF new_employee_id_key = '' THEN
    IF TG_OP = 'UPDATE' AND old_employee_id_key <> '' THEN
      DELETE FROM public.staff_employee_ids
      WHERE employee_id_key = old_employee_id_key
        AND account_role = TG_ARGV[0]
        AND account_id = OLD.id;
      IF FOUND THEN
        PERFORM public.refresh_staff_employee_id_registry(old_employee_id_key);
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  INSERT INTO public.staff_employee_ids (
    employee_id_key, employee_id, account_role, account_id, updated_at
  ) VALUES (
    new_employee_id_key, btrim(NEW.employee_id), TG_ARGV[0], NEW.id, now()
  )
  ON CONFLICT (employee_id_key) DO UPDATE
  SET employee_id = EXCLUDED.employee_id,
      updated_at = now()
  WHERE public.staff_employee_ids.account_role = EXCLUDED.account_role
    AND public.staff_employee_ids.account_id = EXCLUDED.account_id;

  IF NOT FOUND THEN
    SELECT account_role
    INTO existing_role
    FROM public.staff_employee_ids
    WHERE employee_id_key = new_employee_id_key;

    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = format(
        'Employee ID "%s" is already assigned to a %s account.',
        btrim(NEW.employee_id),
        coalesce(existing_role, 'staff')
      );
  END IF;

  IF TG_OP = 'UPDATE'
    AND old_employee_id_key <> ''
    AND old_employee_id_key <> new_employee_id_key THEN
    DELETE FROM public.staff_employee_ids
    WHERE employee_id_key = old_employee_id_key
      AND account_role = TG_ARGV[0]
      AND account_id = OLD.id;
    IF FOUND THEN
      PERFORM public.refresh_staff_employee_id_registry(old_employee_id_key);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill one deterministic registry owner for every nonblank existing ID.
-- Existing conflicting records are deliberately not updated or deleted; use the
-- read-only conflict view below to review them.
INSERT INTO public.staff_employee_ids (
  employee_id_key, employee_id, account_role, account_id, updated_at
)
SELECT DISTINCT ON (employee_id_key)
  employee_id_key, employee_id, account_role, account_id, now()
FROM (
  SELECT lower(btrim(employee_id)) AS employee_id_key, btrim(employee_id) AS employee_id,
    'Adviser'::text AS account_role, id::bigint AS account_id, 1 AS role_order
  FROM public.advisers
  WHERE btrim(coalesce(employee_id, '')) <> ''
  UNION ALL
  SELECT lower(btrim(employee_id)), btrim(employee_id), 'ICT'::text, id::bigint, 2
  FROM public.ict_admins
  WHERE btrim(coalesce(employee_id, '')) <> ''
  UNION ALL
  SELECT lower(btrim(employee_id)), btrim(employee_id), 'Guidance'::text, id::bigint, 3
  FROM public.guidance_counselors
  WHERE btrim(coalesce(employee_id, '')) <> ''
  UNION ALL
  SELECT lower(btrim(employee_id)), btrim(employee_id), 'Principal'::text, id::bigint, 4
  FROM public.principals
  WHERE btrim(coalesce(employee_id, '')) <> ''
) AS staff_records
ORDER BY employee_id_key, role_order, account_id
ON CONFLICT (employee_id_key) DO NOTHING;

CREATE OR REPLACE VIEW public.staff_employee_id_conflicts AS
SELECT
  employee_id_key,
  min(employee_id) AS employee_id,
  count(*)::integer AS account_count,
  jsonb_agg(
    jsonb_build_object('role', account_role, 'accountId', account_id)
    ORDER BY role_order, account_id
  ) AS accounts
FROM (
  SELECT lower(btrim(employee_id)) AS employee_id_key, btrim(employee_id) AS employee_id,
    'Adviser'::text AS account_role, id::bigint AS account_id, 1 AS role_order
  FROM public.advisers
  WHERE btrim(coalesce(employee_id, '')) <> ''
  UNION ALL
  SELECT lower(btrim(employee_id)), btrim(employee_id), 'ICT'::text, id::bigint, 2
  FROM public.ict_admins
  WHERE btrim(coalesce(employee_id, '')) <> ''
  UNION ALL
  SELECT lower(btrim(employee_id)), btrim(employee_id), 'Guidance'::text, id::bigint, 3
  FROM public.guidance_counselors
  WHERE btrim(coalesce(employee_id, '')) <> ''
  UNION ALL
  SELECT lower(btrim(employee_id)), btrim(employee_id), 'Principal'::text, id::bigint, 4
  FROM public.principals
  WHERE btrim(coalesce(employee_id, '')) <> ''
) AS staff_records
GROUP BY employee_id_key
HAVING count(*) > 1;

DROP TRIGGER IF EXISTS advisers_staff_employee_id_registry ON public.advisers;
CREATE TRIGGER advisers_staff_employee_id_registry
AFTER INSERT OR UPDATE OF employee_id OR DELETE ON public.advisers
FOR EACH ROW EXECUTE FUNCTION public.sync_staff_employee_id_registry('Adviser');

DROP TRIGGER IF EXISTS ict_admins_staff_employee_id_registry ON public.ict_admins;
CREATE TRIGGER ict_admins_staff_employee_id_registry
AFTER INSERT OR UPDATE OF employee_id OR DELETE ON public.ict_admins
FOR EACH ROW EXECUTE FUNCTION public.sync_staff_employee_id_registry('ICT');

DROP TRIGGER IF EXISTS guidance_staff_employee_id_registry ON public.guidance_counselors;
CREATE TRIGGER guidance_staff_employee_id_registry
AFTER INSERT OR UPDATE OF employee_id OR DELETE ON public.guidance_counselors
FOR EACH ROW EXECUTE FUNCTION public.sync_staff_employee_id_registry('Guidance');

DROP TRIGGER IF EXISTS principals_staff_employee_id_registry ON public.principals;
CREATE TRIGGER principals_staff_employee_id_registry
AFTER INSERT OR UPDATE OF employee_id OR DELETE ON public.principals
FOR EACH ROW EXECUTE FUNCTION public.sync_staff_employee_id_registry('Principal');

REVOKE ALL ON TABLE public.staff_employee_ids FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.staff_employee_id_conflicts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_employee_ids TO service_role;
GRANT SELECT ON TABLE public.staff_employee_id_conflicts TO service_role;
REVOKE ALL ON FUNCTION public.refresh_staff_employee_id_registry(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_staff_employee_id_registry() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_staff_employee_id_registry(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_staff_employee_id_registry() TO service_role;

COMMIT;
