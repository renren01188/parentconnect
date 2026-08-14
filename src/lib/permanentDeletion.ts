import { supabase } from "@/lib/supabase";

export async function permanentlyDeleteTarget(item: { target_type: string; target_id: string }) {
  if (item.target_type === "student") {
    const { data: student, error } = await supabase.from("students").select("id, student_id").eq("id", Number(item.target_id)).single();
    if (error || !student) throw new Error("Student record no longer exists.");
    await supabase.from("student_family_members").delete().eq("student_db_id", student.id);
    await supabase.from("attendance_logs").delete().eq("student_db_id", student.id);
    await supabase.from("parent_student_links").delete().eq("student_id", student.student_id);
    const { error: deleteError } = await supabase.from("students").delete().eq("id", student.id);
    if (deleteError) throw deleteError;
    return;
  }
  if (item.target_type === "parent") {
    const parentId = Number(item.target_id);
    const { data: links, error: linksError } = await supabase.from("parent_student_links").select("student_id").eq("parent_id", parentId);
    if (linksError) throw linksError;
    for (const link of links ?? []) {
      const { data: student } = await supabase.from("students").select("id").eq("student_id", link.student_id).maybeSingle();
      if (student) await permanentlyDeleteTarget({ target_type: "student", target_id: String(student.id) });
    }
    await supabase.from("parent_student_links").delete().eq("parent_id", parentId);
    const { error } = await supabase.from("parents").delete().eq("id", parentId);
    if (error) throw error;
    return;
  }
  const table = item.target_type === "adviser" ? "advisers" : item.target_type === "ict" ? "ict_admins" : null;
  if (!table) throw new Error("Unsupported deletion target.");
  const { error } = await supabase.from(table).delete().eq("id", Number(item.target_id));
  if (error) throw error;
}
