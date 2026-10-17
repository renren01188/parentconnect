import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getJwtSecret } from "@/lib/authSecret";
import { supabase } from "@/lib/supabase";
import { isCurrentDashboardIdleSession } from "@/lib/dashboardIdleSession";

const SECRET = getJwtSecret();

export interface IctPayload {
  id: number;
  employee_id?: string;
  first_name?: string;
  middle_name?: string | null;
  last_name?: string;
  suffix?: string | null;
  email?: string;
  phone?: string;
  role: "ict";
}

export async function getIctFromToken(): Promise<IctPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("ict_token")?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, SECRET);
    if (payload.role !== "ict" || !isCurrentDashboardIdleSession(payload)) return null;

    const ict = payload as unknown as IctPayload;
    const { data, error } = await supabase.from("ict_admins").select("status, archive_status").eq("id", ict.id).maybeSingle();
    if (error || !data || data.status !== "active" || data.archive_status === "archived") return null;
    return ict;
  } catch {
    return null;
  }
}
