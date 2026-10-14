import { NextResponse } from "next/server";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";

export async function GET() {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json(
        { success: false, message: "Not authenticated." },
        { status: 401 }
      );
    }

    return NextResponse.json({ success: true, adviser });

  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: "Session expired. Please log in again." },
      { status: 401 }
    );
  }
}
