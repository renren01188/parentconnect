import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Protect /dashboard/adviser routes ─────────────────
  if (pathname.startsWith("/dashboard/adviser")) {
    const token = req.cookies.get("adviser_token")?.value;

    if (!token) {
      return NextResponse.redirect(new URL("/adviser-login", req.url));
    }

    try {
      await jwtVerify(token, SECRET);
      return NextResponse.next();
    } catch {
      // Token expired or invalid
      const res = NextResponse.redirect(new URL("/adviser-login", req.url));
      res.cookies.delete("adviser_token");
      return res;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/adviser/:path*"],
};