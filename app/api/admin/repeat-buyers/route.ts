import { NextRequest } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { repeatBuyerGet } from "@/lib/repeat-buyers/handler";
import { readRepeatBuyers, reportEnvironment } from "@/lib/repeat-buyers/source";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: NextRequest) {
  return repeatBuyerGet(req, { authorize: () => verifyAdminAuth(req), read: readRepeatBuyers, environment: reportEnvironment });
}
