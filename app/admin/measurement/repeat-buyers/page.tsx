import { AdminSessionGate } from "@/components/admin/AdminSessionGate";
import { RepeatBuyerPanel } from "@/components/admin/RepeatBuyerPanel";

export const dynamic = "force-dynamic";
export default function RepeatBuyersPage() {
  return <AdminSessionGate><RepeatBuyerPanel staging={process.env.FIREBASE_PROJECT_ID === "sendmynotes-staging"} /></AdminSessionGate>;
}
