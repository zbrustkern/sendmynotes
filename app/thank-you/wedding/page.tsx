import { WeddingWorkspace } from "@/components/wedding/WeddingWorkspace";

export const dynamic = "force-dynamic";

export default function WeddingPage() {
  return (
    <WeddingWorkspace
      purchasingOpen={process.env.WEDDING_CHECKOUT_ENABLED === "true"}
    />
  );
}
