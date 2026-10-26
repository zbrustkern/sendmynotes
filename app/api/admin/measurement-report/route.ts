import { NextRequest } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { handleAdminMeasurementReport } from "@/lib/admin-measurement-handler";
import { readMeasurementSources } from "@/lib/admin-measurement-source";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  return handleAdminMeasurementReport(req, {
    authorize: () => verifyAdminAuth(req),
    readSources: (startUtc, endUtc) => readMeasurementSources(startUtc, endUtc),
  });
}
