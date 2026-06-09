import { jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

export interface AdviserPayload {
  id: number;
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string;
  grade: string | null;
  section: string | null;
  sections: string[];          // all sections this adviser handles
  role: string;
}

export async function getAdviserFromToken(): Promise<AdviserPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("adviser_token")?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as AdviserPayload;
  } catch {
    return null;
  }
}