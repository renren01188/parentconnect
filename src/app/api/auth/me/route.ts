import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("adviser_token")?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, message: "Not authenticated." },
        { status: 401 }
      );
    }

    const { payload } = await jwtVerify(token, SECRET);

    return NextResponse.json({ success: true, adviser: payload });

  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: "Session expired. Please log in again." },
      { status: 401 }
    );
  }
}