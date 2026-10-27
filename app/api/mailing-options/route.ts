import { NextResponse } from "next/server";
import { mailingOptionsResponse } from "@/lib/mailing-destinations";

/** Safe public capability response. Destinations remain unavailable until supplier IDs are verified. */
export async function GET() {
  return NextResponse.json(mailingOptionsResponse(), { headers: { "Cache-Control": "no-store" } });
}
