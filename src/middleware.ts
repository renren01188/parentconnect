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
      return NextResponse.redirect(new URL("/login/adviser", req.url));
    }

    try {
      await jwtVerify(token, SECRET);
      return NextResponse.next();
    } catch {
      // Token expired or invalid
      const res = NextResponse.redirect(new URL("/login/adviser", req.url));
      res.cookies.delete("adviser_token");
      return res;
    }
  }

  if (pathname.startsWith("/dashboard/guidance")) {
    const token = req.cookies.get("guidance_token")?.value;

    if (!token) {
      return NextResponse.redirect(new URL("/login/guidance", req.url));
    }

    try {
      const verified = await jwtVerify(token, SECRET);
      if (verified.payload.passwordSet === false) {
        return NextResponse.redirect(new URL("/set-password/guidance", req.url));
      }
      return NextResponse.next();
    } catch {
      const res = NextResponse.redirect(new URL("/login/guidance", req.url));
      res.cookies.delete("guidance_token");
      return res;
    }
  }

  if (pathname.startsWith("/dashboard/principal")) {
    const token = req.cookies.get("principal_token")?.value;

    if (!token) {
      return NextResponse.redirect(new URL("/login/principal", req.url));
    }

    try {
      const verified = await jwtVerify(token, SECRET);
      if (verified.payload.passwordSet === false) {
        return NextResponse.redirect(new URL("/set-password/principal", req.url));
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (supabaseUrl && supabaseKey) {
        const activePrincipal = await fetch(
          `${supabaseUrl}/rest/v1/principals?id=eq.${verified.payload.id}&is_active=eq.true&select=id,auth_version`,
          {
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
            },
            cache: "no-store",
          }
        );

        const rows = await activePrincipal.json();
        if (
          !activePrincipal.ok ||
          !Array.isArray(rows) ||
          rows.length === 0 ||
          rows[0].auth_version !== verified.payload.authVersion
        ) {
          const res = NextResponse.redirect(new URL("/login/principal", req.url));
          res.cookies.delete("principal_token");
          return res;
        }
      }

      return NextResponse.next();
    } catch {
      const res = NextResponse.redirect(new URL("/login/principal", req.url));
      res.cookies.delete("principal_token");
      return res;
    }
  }

  if (pathname.startsWith("/dashboard/ict")) {
    const token = req.cookies.get("ict_token")?.value;

    if (!token) {
      return NextResponse.redirect(new URL("/login/ict", req.url));
    }

    try {
      const verified = await jwtVerify(token, SECRET);
      if (verified.payload.passwordSet === false) {
        return NextResponse.redirect(new URL("/set-password/ict", req.url));
      }
      return NextResponse.next();
    } catch {
      const res = NextResponse.redirect(new URL("/login/ict", req.url));
      res.cookies.delete("ict_token");
      return res;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/adviser/:path*", "/dashboard/guidance/:path*", "/dashboard/principal/:path*", "/dashboard/ict/:path*"],
};
