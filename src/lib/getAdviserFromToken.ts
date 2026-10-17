import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { getJwtSecret } from "@/lib/authSecret";
import { isPasswordSessionRevoked } from "@/lib/passwordSessionRevocationStore";

const SECRET = getJwtSecret();

export interface AdviserPayload {
  id: number;
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string;
  grade: string | null;
  section: string | null;
  sections: string[];          // all sections this adviser handles
  notifications_last_seen_at: string | null;
  role: string;
}

export async function getAdviserFromToken(): Promise<AdviserPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("adviser_token")?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, SECRET);
    const tokenAdviser = payload as unknown as AdviserPayload;
    if (tokenAdviser.role !== "adviser") return null;

    // Grade and section are authorisation data, not just display data.  A JWT can
    // outlive an ICT-approved assignment change, so always resolve these fields
    // from the official adviser record before an adviser-scoped query is run.
    const { data, error } = await supabase
      .from("advisers")
      .select("id, employee_id, first_name, last_name, email, grade, section, sections, notifications_last_seen_at, status, archive_status")
      .eq("id", tokenAdviser.id)
      .maybeSingle();

    if (error || !data || data.status !== "active" || data.archive_status === "archived") return null;
    if (await isPasswordSessionRevoked({ role: "adviser", accountId: data.id, payload })) return null;

    const sections = Array.isArray(data.sections) && data.sections.length > 0
      ? data.sections
      : data.section ? [data.section] : [];

    return {
      ...tokenAdviser,
      id: data.id,
      employee_id: data.employee_id,
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      grade: data.grade,
      section: data.section,
      sections,
      notifications_last_seen_at: data.notifications_last_seen_at ?? null,
    };
  } catch {
    return null;
  }
}
