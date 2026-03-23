import { getIronSession, IronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";

// ── Session shape ──────────────────────────────────────────
export interface AdviserSession {
  id: number;
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string;
  grade: string | null;
  section: string | null;
  isLoggedIn: boolean;
}

// ── Iron-session options ───────────────────────────────────
export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET as string,
  cookieName: "parentconnect_adviser_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 8, // 8 hours
  },
};

// ── Server-side helper ─────────────────────────────────────
export async function getAdviserSession(): Promise<IronSession<AdviserSession>> {
  const session = await getIronSession<AdviserSession>(
    await cookies(),
    sessionOptions
  );
  return session;
}