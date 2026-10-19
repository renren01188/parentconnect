import { NextResponse } from "next/server";
import { getActiveIct } from "@/lib/apiAuthorization";
import { supabase } from "@/lib/supabase";

type ConflictRow = {
  employee_id: string;
  account_count: number;
  accounts: Array<{ role: string; accountId: number }>;
};

// This is deliberately read-only. Existing duplicate IDs are shown to ICT for
// review, never repaired automatically.
export async function GET() {
  try {
    if (!(await getActiveIct())) {
      return NextResponse.json(
        { success: false, message: "ICT administrator access is required." },
        { status: 403 },
      );
    }

    const { data, error } = await supabase
      .from("staff_employee_id_conflicts")
      .select("employee_id, account_count, accounts")
      .order("employee_id", { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      conflicts: (data ?? []) as ConflictRow[],
    });
  } catch (error: unknown) {
    console.error("GET /api/ict/staff-employee-id-conflicts error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Unable to load Employee ID conflicts." },
      { status: 500 },
    );
  }
}
