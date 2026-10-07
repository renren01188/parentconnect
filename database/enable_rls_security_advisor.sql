-- Lock down the tables reported by Supabase Security Advisor.
--
-- ParentConnect authorizes data access in its protected Next.js API routes,
-- which use the server-only service-role key.  This migration deliberately
-- creates no anon/authenticated policies: direct browser Data API access is
-- denied by default, while service-role server operations continue to work.

begin;

alter table public.principal_notification_reads enable row level security;
alter table public.attendance_logs enable row level security;
alter table public.guidance_notification_reads enable row level security;
alter table public.principal_staff_messages enable row level security;
alter table public.advisers enable row level security;
alter table public.student_reports enable row level security;
alter table public.sections enable row level security;
alter table public.adviser_principal_messages enable row level security;
alter table public.staff_messages enable row level security;
alter table public.student_family_members enable row level security;
alter table public.students enable row level security;
alter table public.school_year_config enable row level security;
alter table public.adviser_notification_reads enable row level security;
alter table public.principal_announcements enable row level security;
alter table public.parents enable row level security;

revoke all privileges on table
  public.principal_notification_reads,
  public.attendance_logs,
  public.guidance_notification_reads,
  public.principal_staff_messages,
  public.advisers,
  public.student_reports,
  public.sections,
  public.adviser_principal_messages,
  public.staff_messages,
  public.student_family_members,
  public.students,
  public.school_year_config,
  public.adviser_notification_reads,
  public.principal_announcements,
  public.parents
from anon, authenticated;

commit;
