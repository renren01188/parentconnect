import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { supabase } from "@/lib/supabase";

const SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET || "fallback_secret_change_this");
export const dynamic = "force-dynamic";

export async function GET() {
  const token = (await cookies()).get("principal_token")?.value;
  if (!token) return new Response("Unauthorized", { status: 401 });
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.role !== "principal") return new Response("Unauthorized", { status: 401 });
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let latestId = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  const { data: latest } = await supabase.from("audit_log").select("id").order("id", { ascending: false }).limit(1);
  latestId = Number(latest?.[0]?.id ?? 0);
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const checkForNewLogs = async () => {
        try {
          const { data, error } = await supabase.from("audit_log").select("*").gt("id", latestId).order("id", { ascending: true });
          if (error) throw error;
          for (const row of data ?? []) { latestId = Number(row.id); send("audit-log", row); }
        } catch (error) { send("error", { message: error instanceof Error ? error.message : "Audit stream failed." }); }
      };
      // Older browser bundles can still reach this endpoint during a rolling
      // deployment. New audit pages use the protected Broadcast instead.
      timer = setInterval(checkForNewLogs, 15_000);
      controller.enqueue(encoder.encode(": connected\n\n"));
    },
    cancel() { if (timer) clearInterval(timer); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
