import { NextRequest, NextResponse } from "next/server";
import { getActiveIct } from "@/lib/apiAuthorization";
import {
  findActiveParentNameSuggestions,
  findLinkedFamilyNameSuggestions,
  isParentFamilyRole,
} from "@/lib/activeParentLinkCandidates";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";

/**
 * Returns minimally identifying active Parent-name suggestions while an
 * Adviser types, or family names already recorded for a selected Parent.
 * Saving a link always repeats exact server validation; this endpoint never
 * authorizes a link by itself.
 */
export async function GET(request: NextRequest) {
  const [adviser, ict] = await Promise.all([getAdviserFromToken(), getActiveIct()]);
  if (!adviser && !ict) {
    return NextResponse.json({ success: false, message: "Adviser or ICT authorization is required." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");
    const firstName = searchParams.get("firstName")?.trim() ?? "";
    const lastName = searchParams.get("lastName")?.trim() ?? "";
    const selectedParentId = searchParams.get("selectedParentId");

    if (selectedParentId) {
      const familySuggestions = await findLinkedFamilyNameSuggestions(selectedParentId);
      return NextResponse.json({ success: true, familySuggestions });
    }

    if (!isParentFamilyRole(role) || (!firstName && !lastName)) {
      return NextResponse.json({ success: true, candidates: [] });
    }

    const candidates = await findActiveParentNameSuggestions({ role, firstName, lastName });
    return NextResponse.json({ success: true, candidates });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Could not look up active Parent accounts." },
      { status: 500 },
    );
  }
}
