import { logAudit } from "@/lib/audit";
import { supabase } from "@/lib/supabase";
import { publishAccountRealtimeInvalidation } from "@/lib/realtimeInvalidation";

export interface AdviserTransferResult {
  transfer_id: number;
  outgoing_adviser_id: number;
  incoming_adviser_id: number;
  grade: string;
  section: string;
  completed: boolean;
  failure_reason: string | null;
}

/**
 * Completes due adviser handovers using one database transaction per transfer.
 * It is called by the daily worker and on ICT reads as a safe fallback, so a
 * scheduled transfer never depends solely on an open browser tab.
 */
export async function processDueAdviserTransfers() {
  const { data, error } = await supabase.rpc("process_due_adviser_transfers");

  // Deployments that have not received the matching migration can still use
  // the immediate transfer fallback. Do not let that prevent User Management
  // from loading.
  if (error && /function .*process_due_adviser_transfers|does not exist|schema cache/i.test(error.message)) {
    return { completed: [] as AdviserTransferResult[], failed: [] as AdviserTransferResult[], unavailable: true };
  }
  if (error) throw error;

  const results = (data ?? []) as AdviserTransferResult[];
  const completed = results.filter((item) => item.completed);
  const failed = results.filter((item) => !item.completed);

  await Promise.all([
    ...completed.map((item) => logAudit({
      action: "Adviser Transfer Completed",
      performedBy: "Adviser Transfer Worker",
      performedByRole: "System",
      targetUser: `Grade ${item.grade} – ${item.section}`,
      targetRole: "Adviser",
      targetType: "adviser_transfer",
      targetId: item.transfer_id,
      module: "User Management",
      details: `Transferred Grade ${item.grade} – ${item.section} from adviser ${item.outgoing_adviser_id} to adviser ${item.incoming_adviser_id}.`,
      metadata: { transferId: item.transfer_id, outgoingAdviserId: item.outgoing_adviser_id, incomingAdviserId: item.incoming_adviser_id },
    })),
    ...failed.map((item) => logAudit({
      action: "Adviser Transfer Failed",
      performedBy: "Adviser Transfer Worker",
      performedByRole: "System",
      targetUser: `Grade ${item.grade} – ${item.section}`,
      targetRole: "Adviser",
      targetType: "adviser_transfer",
      targetId: item.transfer_id,
      module: "User Management",
      details: item.failure_reason ?? "The scheduled adviser transfer could not be completed.",
      metadata: { transferId: item.transfer_id, outgoingAdviserId: item.outgoing_adviser_id, incomingAdviserId: item.incoming_adviser_id },
    })),
  ]);

  if (completed.length) {
    await publishAccountRealtimeInvalidation(
      completed.flatMap((item) => [
        { role: "adviser" as const, id: Number(item.outgoing_adviser_id) },
        { role: "adviser" as const, id: Number(item.incoming_adviser_id) },
      ]),
    );
  }

  return { completed, failed, unavailable: false };
}
