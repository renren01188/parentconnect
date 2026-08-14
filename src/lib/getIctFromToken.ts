import { jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

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
    if (payload.role !== "ict") return null;

    return payload as unknown as IctPayload;
  } catch {
    return null;
  }
}
