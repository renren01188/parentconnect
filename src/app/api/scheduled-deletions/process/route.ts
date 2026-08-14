import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { permanentlyDeleteTarget } from "@/lib/permanentDeletion";

export async function POST(req: NextRequest) {
  const expected = process.env.DELETION_CRON_SECRET;
  if (!expected || req.headers.get("authorization") !== `Bearer ${expected}`) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  const { data, error } = await supabase.from("scheduled_deletions").select("*").eq("status", "Scheduled").lte("delete_after", new Date().toISOString());
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  const deleted: number[] = [];
  for (const item of data ?? []) {
    await permanentlyDeleteTarget(item);
    await supabase.from("scheduled_deletions").update({ status: "Deleted" }).eq("id", item.id);
    deleted.push(item.id);
  }
  return NextResponse.json({ success: true, deleted });
}
