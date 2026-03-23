import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// POST /api/auth/adviser/logout
export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete("adviser_token");
  return NextResponse.json({ success: true });
}