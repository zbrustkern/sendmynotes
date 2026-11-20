import type { Metadata } from "next";
import { WeddingWorkspace } from "@/components/wedding/WeddingWorkspace";
import { getWeddingPageMetadata } from "@/lib/wedding/metadata";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return getWeddingPageMetadata();
}

export default function WeddingPage() {
  return (
    <WeddingWorkspace
      purchasingOpen={process.env.WEDDING_CHECKOUT_ENABLED === "true"}
      stagingReviewOnly={process.env.STAGING_REVIEW_ONLY === "true"}
    />
  );
}
