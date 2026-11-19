import { WeddingWorkspace } from "@/components/wedding/WeddingWorkspace";
export default function WeddingPage() {
  return (
    <WeddingWorkspace
      purchasingOpen={process.env.WEDDING_CHECKOUT_ENABLED === "true"}
    />
  );
}
