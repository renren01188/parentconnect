import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { supabase } from "@/lib/supabase";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

async function requirePrincipal() {
  const cookieStore = await cookies();
  const token = cookieStore.get("principal_token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.role !== "principal") return null;
    return { principalId: Number(payload.id) };
  } catch {
    return null;
  }
}

function isMissingTableError(error: { code?: string; message?: string } | null) {
  return Boolean(error && (error.code === "PGRST205" || error.message?.toLowerCase().includes("could not find the table") || error.message?.toLowerCase().includes("schema cache")));
}

// GET — fetch audit log entries with optional server-side filtering
export async function GET(req: NextRequest) {
  try {
    const session = await requirePrincipal();
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search  = searchParams.get("search")  ?? "";
    const action  = searchParams.get("action")  ?? "";
    const role    = searchParams.get("role")    ?? "";
    const user    = searchParams.get("user")    ?? "";
    const date    = searchParams.get("date")    ?? ""; // YYYY-MM-DD
    const page    = Math.max(1, Number(searchParams.get("page")    ?? "1"));
    const perPage = Math.min(100, Math.max(1, Number(searchParams.get("perPage") ?? "50")));

    let query = supabase
      .from("audit_log")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    // Server-side filters
    if (action) query = query.ilike("action",       `%${action}%`);
    if (role)   query = query.ilike("performed_by_role", `%${role}%`);
    if (user)   query = query.ilike("performed_by", `%${user}%`);
    if (search) query = query.or(
      `performed_by.ilike.%${search}%,performed_by_role.ilike.%${search}%,details.ilike.%${search}%,action.ilike.%${search}%`
    );
    if (date) {
      const start = new Date(`${date}T00:00:00.000Z`).toISOString();
      const end   = new Date(`${date}T23:59:59.999Z`).toISOString();
      query = query.gte("created_at", start).lte("created_at", end);
    }

    // Pagination
    const from = (page - 1) * perPage;
    const to   = from + perPage - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error && isMissingTableError(error)) return NextResponse.json({ success: true, auditLog: [], total: 0, page, perPage });
    if (error) throw error;

    const entries = (data ?? []).map((row: any) => ({
      id:             String(row.id),
      action:         row.action             ?? "",
      description:    row.details            ?? "",
      targetUser:     row.target_user        ?? "",
      targetRole:     row.target_role        ?? "",
      targetEmail:    row.target_email       ?? "",
      performedBy:    row.performed_by       ?? "",
      performedByRole:row.performed_by_role  ?? "",
      module:         row.module             ?? "",
      ipAddress:      row.ip_address         ?? "",
      browser:        row.browser            ?? "",
      timestamp: new Date(row.created_at).toLocaleDateString("en-US", {
        month: "short", day: "numeric",
      }) + " · " + new Date(row.created_at).toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit",
      }),
      timestampMs: new Date(row.created_at).getTime(),
      changes: Array.isArray(row.changes) ? row.changes : [],
    }));

    return NextResponse.json({
      success:  true,
      auditLog: entries,
      total:    count ?? 0,
      page,
      perPage,
    });
  } catch (error: unknown) {
    console.error("GET /api/principal/audit-log error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
