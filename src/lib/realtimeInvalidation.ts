import { createHmac } from "node:crypto";
import { supabase } from "@/lib/supabase";

export type RealtimeRecipientRole = "parent" | "adviser" | "guidance" | "principal" | "ict";

export type RealtimeRecipient = {
  role: RealtimeRecipientRole;
  id: number;
};

const realtimeRecipientTable: Record<RealtimeRecipientRole, string> = {
  parent: "parents",
  adviser: "advisers",
  guidance: "guidance_counselors",
  principal: "principals",
  ict: "ict_admins",
};

/** Resolves account IDs for a role without sending any data to the browser. */
export async function recipientsForRoles(roles: RealtimeRecipientRole[]) {
  const uniqueRoles = [...new Set(roles)];
  const results = await Promise.all(uniqueRoles.map(async (role) => {
    try {
      const { data, error } = await supabase.from(realtimeRecipientTable[role]).select("id");
      if (error) {
        console.warn(`Unable to resolve Realtime ${role} recipients:`, error.message);
        return [] as RealtimeRecipient[];
      }
      return (data ?? [])
        .map((account) => Number(account.id))
        .filter((id) => Number.isSafeInteger(id) && id > 0)
        .map((id) => ({ role, id }));
    } catch (error) {
      console.warn(`Unable to resolve Realtime ${role} recipients:`, error);
      return [] as RealtimeRecipient[];
    }
  }));
  return results.flat();
}

function channelSecret() {
  // Keep the client-visible topic independent of the custom-session secret.
  // The service key is already required server-side and is high entropy; a
  // dedicated value may be supplied later if key rotation needs separation.
  const secret = process.env.REALTIME_CHANNEL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("A strong server-side Realtime channel secret must be configured.");
  }
  return secret;
}

/**
 * A channel name is an opaque, per-account capability. Broadcast payloads
 * contain no school data; recipients always fetch their own authorized data
 * from a server API route after receiving an invalidation signal.
 */
export function realtimeChannelTopic(recipient: RealtimeRecipient) {
  if (!Number.isSafeInteger(recipient.id) || recipient.id <= 0) {
    throw new Error("A valid account identifier is required for Realtime.");
  }

  const digest = createHmac("sha256", channelSecret())
    .update(`parentconnect-realtime:${recipient.role}:${recipient.id}`)
    .digest("base64url");

  return `parentconnect-${digest}`;
}

/**
 * Sends a data-free invalidation to the selected accounts. Delivery failures
 * intentionally do not fail the saved action: every affected page also uses a
 * visibility-aware API refresh as its recovery path.
 */
export async function publishRealtimeInvalidation(
  recipients: RealtimeRecipient[],
  scope: "reports" | "staff-messages" | "notifications" | "announcements",
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return;

  const uniqueRecipients = Array.from(
    new Map(
      recipients
        .filter((recipient) => Number.isSafeInteger(recipient.id) && recipient.id > 0)
        .map((recipient) => [`${recipient.role}:${recipient.id}`, recipient]),
    ).values(),
  );
  if (!uniqueRecipients.length) return;

  try {
    const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: uniqueRecipients.map((recipient) => ({
          topic: realtimeChannelTopic(recipient),
          event: "invalidate",
          payload: { scope },
        })),
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn("Unable to send Realtime invalidation:", response.status);
    }
  } catch (error) {
    console.warn("Unable to send Realtime invalidation:", error);
  }
}

/** Publishes a report refresh to every account that is allowed to monitor it. */
export async function publishReportRealtimeInvalidation({
  parentId,
  adviserId,
  includeGuidance = false,
}: {
  parentId?: number | null;
  adviserId?: number | null;
  includeGuidance?: boolean;
}) {
  const [principalsResult, guidanceResult] = await Promise.all([
    supabase.from("principals").select("id").eq("status", "active").eq("is_active", true).neq("archive_status", "archived"),
    includeGuidance
      ? supabase.from("guidance_counselors").select("id").eq("status", "active").neq("archive_status", "archived")
      : Promise.resolve({ data: [], error: null }),
  ]);

  const recipients: RealtimeRecipient[] = [];
  if (Number.isSafeInteger(Number(parentId)) && Number(parentId) > 0) {
    recipients.push({ role: "parent", id: Number(parentId) });
  }
  if (Number.isSafeInteger(Number(adviserId)) && Number(adviserId) > 0) {
    recipients.push({ role: "adviser", id: Number(adviserId) });
  }
  if (!principalsResult.error) {
    recipients.push(...(principalsResult.data ?? []).map((principal) => ({ role: "principal" as const, id: Number(principal.id) })));
  }
  if (!guidanceResult.error) {
    recipients.push(...(guidanceResult.data ?? []).map((guidance) => ({ role: "guidance" as const, id: Number(guidance.id) })));
  }

  await publishRealtimeInvalidation(recipients, "reports");
}
