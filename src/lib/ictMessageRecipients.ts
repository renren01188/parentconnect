import { supabase } from "@/lib/supabase";

export type EligibleIctMessageRecipient = {
  id: number;
  recipientId: `ict:${number}`;
  name: string;
  email: string;
};

type IctRecipientRow = {
  id: number;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  suffix: string | null;
  email: string | null;
};

function fullName(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" ").trim();
}

function mapRecipient(row: IctRecipientRow): EligibleIctMessageRecipient {
  return {
    id: Number(row.id),
    recipientId: `ict:${Number(row.id)}`,
    name: fullName([row.first_name, row.middle_name, row.last_name, row.suffix]) || "ICT Personnel",
    email: String(row.email ?? ""),
  };
}

/**
 * ICT Contact routes use this opaque, account-specific value in the browser.
 * Parsing it strictly prevents a display name or a malformed compound value
 * from being treated as an ICT destination.
 */
export function parseIctMessageRecipientId(value: unknown) {
  const match = typeof value === "string" ? value.match(/^ict:([1-9][0-9]*)$/) : null;
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Lists only ICT accounts that are currently allowed to receive new messages. */
export async function listEligibleIctMessageRecipients(): Promise<EligibleIctMessageRecipient[]> {
  const { data, error } = await supabase
    .from("ict_admins")
    .select("id, first_name, middle_name, last_name, suffix, email")
    .eq("status", "active")
    .eq("archive_status", "active")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as IctRecipientRow[]).map(mapRecipient);
}

/**
 * Re-checks exactly the account selected in New Message immediately before a
 * row is stored. A browser-provided recipient can never substitute another
 * ICT account or revive an inactive/archived account.
 */
export async function findEligibleIctMessageRecipient(
  recipientId: unknown,
): Promise<EligibleIctMessageRecipient | null> {
  const id = parseIctMessageRecipientId(recipientId);
  if (!id) return null;

  const { data, error } = await supabase
    .from("ict_admins")
    .select("id, first_name, middle_name, last_name, suffix, email")
    .eq("id", id)
    .eq("status", "active")
    .eq("archive_status", "active")
    .maybeSingle();

  if (error) throw error;
  return data ? mapRecipient(data as IctRecipientRow) : null;
}
