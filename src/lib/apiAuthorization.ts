import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { getIctFromToken } from "@/lib/getIctFromToken";
import { supabase } from "@/lib/supabase";

export async function getActiveIct() {
  const ict = await getIctFromToken();
  if (!ict) return null;

  const { data, error } = await supabase
    .from("ict_admins")
    .select("id, status")
    .eq("id", ict.id)
    .maybeSingle();

  return !error && data?.status === "active" ? ict : null;
}

export async function getActiveAdviser() {
  return getAdviserFromToken();
}
