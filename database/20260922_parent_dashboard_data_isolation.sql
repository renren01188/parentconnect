-- Parent dashboard data isolation.
--
-- Parent authentication is implemented by the application's signed HTTP-only
-- cookie, not Supabase Auth. The browser must therefore have no direct table
-- access; API routes use the service role only after checking the parent ID
-- from that signed session against parent_student_links / parent_id.

do $$
declare
  protected_table text;
  policy_row record;
  protected_tables text[] := array[
    'parents',
    'parent_student_links',
    'attendance_logs',
    'excuse_letters',
    'parent_adviser_reports',
    'parent_adviser_report_messages',
    'parent_report_guidance_tickets',
    'parent_announcement_notifications',
    'parent_attendance_notification_reads'
  ];
begin
  -- Remove only policies that could expose these private tables directly to
  -- anon/authenticated browser clients. Service-only policies are retained.
  for policy_row in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any(protected_tables)
      and roles && array['anon'::name, 'authenticated'::name, 'public'::name]
  loop
    execute format('drop policy if exists %I on public.%I', policy_row.policyname, policy_row.tablename);
  end loop;

  foreach protected_table in array protected_tables
  loop
    execute format('alter table public.%I enable row level security', protected_table);
    execute format('revoke all privileges on table public.%I from anon, authenticated', protected_table);
    execute format('drop policy if exists parent_dashboard_service_role_only on public.%I', protected_table);
    execute format(
      'create policy parent_dashboard_service_role_only on public.%I for all to service_role using (true) with check (true)',
      protected_table
    );
  end loop;
end;
$$;
