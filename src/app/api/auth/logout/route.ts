import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// POST /api/auth/logout
export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete("parent_token");
  return NextResponse.json({ success: true });
}