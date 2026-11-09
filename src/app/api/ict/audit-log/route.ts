import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { supabase } from "@/lib/supabase";
import { AUDIT_SECURITY_ALERT_ACTION_VALUES, auditActionDatabaseValues, auditRoleDatabaseValues, auditStatusDatabaseValues, displayGuidanceLabel, normalizeAuditRole } from "@/lib/audit-filter-options";
import { parseAuditArchiveFilter } from "@/lib/auditArchive";
import { auditManilaDateRange, formatAuditTimestamp } from "@/lib/auditPresentation";
import { auditLogRowsToPdf } from "@/lib/auditPdf";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

type AuditLogRow = {
  id: number;
  action: string | null;
  details: string | null;
  target_user: string | null;
  target_role: string | null;
  target_email: string | null;
  performed_by: string | null;
  performed_by_role: string | null;
  module: string | null;
  ip_address: string | null;
  browser: string | null;
  target_type: string | null;
  target_id: string | null;
  previous_status: string | null;
  new_status: string | null;
  related_report_id: string | null;
  related_ticket_id: string | null;
  related_student_id: string | null;
  related_user_id: string | null;
  created_at: string;
  changes: unknown;
};

async function requireIct() {
  const cookieStore = await cookies();
  const token = cookieStore.get("ict_token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.role !== "ict") return null;
    const name = [payload.first_name, payload.middle_name, payload.last_name, payload.suffix]
      .filter((value): value is string => typeof value === "string" && Boolean(value))
      .join(" ") || "ICT Admin";
    return { ictId: Number(payload.id), name };
  } catch {
    return null;
  }
}

// GET — fetch audit log entries with optional server-side filtering
export async function GET(req: NextRequest) {
  try {
    const session = await requireIct();
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search      = searchParams.get("search")     ?? "";
    const action      = searchParams.get("action")     ?? "";
    const role        = searchParams.get("role")       ?? "";
    const user        = searchParams.get("user")       ?? "";
    const moduleFilter = searchParams.get("module")    ?? "";
    const status      = searchParams.get("status")     ?? "";
    const archive     = parseAuditArchiveFilter(searchParams.get("archive"));
    const date        = searchParams.get("date")       ?? ""; // YYYY-MM-DD
    const exportFormat = searchParams.get("export");
    const exportPdf = exportFormat === "pdf";
    const page        = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const perPage     = Math.min(100, Math.max(1, Number(searchParams.get("perPage") ?? "50")));
    const dateRange = date ? auditManilaDateRange(date) : null;

    if (exportFormat && !exportPdf) {
      return NextResponse.json({ success: false, message: "Audit Trail exports are available as PDF only." }, { status: 400 });
    }

    if (exportPdf) {
      if (!dateRange) {
        return NextResponse.json({ success: false, message: "Choose a valid date to export." }, { status: 400 });
      }

      const exportedRows: AuditLogRow[] = [];
      const exportPageSize = 1_000;
      for (let from = 0; ; from += exportPageSize) {
        const { data, error } = await supabase
          .from("audit_log")
          .select("*")
          .gte("created_at", dateRange.start)
          .lt("created_at", dateRange.end)
          .order("created_at", { ascending: false })
          .range(from, from + exportPageSize - 1);
        if (error) throw error;
        const batch = (data ?? []) as AuditLogRow[];
        exportedRows.push(...batch);
        if (batch.length < exportPageSize) break;
      }

      return new NextResponse(auditLogRowsToPdf(exportedRows, date), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="ict-audit-trail-${date}.pdf"`,
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    let query = supabase
      .from("audit_log")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    // Server-side filters
    if (action)  query = query.in("action", [...auditActionDatabaseValues(action)]);
    if (role)    query = query.in("performed_by_role", [...auditRoleDatabaseValues(role)]);
    if (user)    query = query.ilike("performed_by", `%${user}%`);
    if (moduleFilter) query = query.ilike("module", `%${moduleFilter}%`);
    const statusValues = auditStatusDatabaseValues(status);
    if (statusValues.length) {
      query = query.or(statusValues.flatMap((value) => [
        `previous_status.ilike.${value}`,
        `new_status.ilike.${value}`,
      ]).join(","));
    }
    // Archive state is a read-time boundary: Recent contains the last seven
    // days and Archived preserves every older audit row for viewing. This
    // avoids making page loads depend on an optional archival RPC or view.
    const archiveCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    query = archive === "archived"
      ? query.lt("created_at", archiveCutoff)
      : query.gte("created_at", archiveCutoff);
    if (search)  query = query.or(
      `performed_by.ilike.%${search}%,details.ilike.%${search}%,action.ilike.%${search}%`
    );
    if (dateRange) query = query.gte("created_at", dateRange.start).lt("created_at", dateRange.end);

    // The Security Alerts card must represent all recent security events, not
    // merely whichever rows happen to be on the current pagination page.
    let securityQuery = supabase
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .in("action", [...AUDIT_SECURITY_ALERT_ACTION_VALUES]);
    securityQuery = archive === "archived"
      ? securityQuery.lt("created_at", archiveCutoff)
      : securityQuery.gte("created_at", archiveCutoff);
    if (dateRange) securityQuery = securityQuery.gte("created_at", dateRange.start).lt("created_at", dateRange.end);

    // Pagination
    const from = (page - 1) * perPage;
    const to   = from + perPage - 1;
    query = query.range(from, to);

    const [{ data, error, count }, { error: securityError, count: securityTotal }] = await Promise.all([
      query,
      securityQuery,
    ]);
    if (error) throw error;
    if (securityError) throw securityError;

    const entries = ((data ?? []) as AuditLogRow[]).map((row) => ({
      id:          String(row.id),
      action:      row.action             ?? "",
      // Use `details` column as the human-readable description
      description: displayGuidanceLabel(row.details),
      targetUser:  displayGuidanceLabel(row.target_user),
      targetRole:  normalizeAuditRole(row.target_role),
      targetEmail: row.target_email       ?? "",
      performedBy: displayGuidanceLabel(row.performed_by),
      performedByRole: normalizeAuditRole(row.performed_by_role),
      module:      row.module             ?? "",
      ipAddress:   row.ip_address         ?? "",
      browser:     row.browser            ?? "",
      targetType:  row.target_type ?? "",
      targetId:    row.target_id ?? "",
      previousStatus: row.previous_status ?? "",
      newStatus:   row.new_status ?? "",
      relatedReportId: row.related_report_id ?? "",
      relatedTicketId: row.related_ticket_id ?? "",
      relatedStudentId: row.related_student_id ?? "",
      relatedUserId: row.related_user_id ?? "",
      archiveStatus: archive,
      archivedAt:    null,
      timestamp: formatAuditTimestamp(row.created_at),
      timestampMs: new Date(row.created_at).getTime(),
      details:     row.details            ?? "",
      changes:     Array.isArray(row.changes) ? row.changes : [],
    }));

    return NextResponse.json({
      success:  true,
      auditLog: entries,
      total:    count ?? 0,
      securityTotal: securityTotal ?? 0,
      page,
      perPage,
    });
  } catch (error: unknown) {
    console.error("GET /api/ict/audit-log error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}

// POST — write a new audit entry
export async function POST(req: NextRequest) {
  try {
    const session = await requireIct();
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const body = await req.json();
    const {
      action, targetUser, targetRole, targetEmail,
      details, changes, module: mod, ipAddress, browser,
    } = body;

    if (!action) {
      return NextResponse.json(
        { success: false, message: "Missing required audit field (action)." },
        { status: 400 }
      );
    }

    // Build insert — only include new columns if they were added to the table
    const insertPayload: Record<string, unknown> = {
      action,
      target_user:  targetUser  ?? null,
      target_role:  targetRole  ?? null,
      target_email: targetEmail ?? null,
      performed_by: session.name,
      performed_by_role: "ICT",
      details:      details     ?? null,
      changes:      changes     ?? null,
      module:       mod ?? "User Management",
      ip_address:   req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? ipAddress ?? null,
      browser:      req.headers.get("user-agent") ?? browser ?? null,
    };

    // These columns need to be added via SQL first (see docs)

    const { error } = await supabase
      .from("audit_log")
      .insert(insertPayload);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("POST /api/ict/audit-log error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
