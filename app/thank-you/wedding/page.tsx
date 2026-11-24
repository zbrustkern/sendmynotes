import type { Metadata } from "next";
import { cookies } from "next/headers";
import { WeddingWorkspace } from "@/components/wedding/WeddingWorkspace";
import { ADMIN_COOKIE_NAME } from "@/lib/admin-auth";
import { getWeddingPageMetadata } from "@/lib/wedding/metadata";
import { isWeddingFounderCohortCookie } from "@/lib/wedding/server";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return getWeddingPageMetadata();
}

export default async function WeddingPage() {
  const cookieStore = await cookies();
  const isFounderCohort = isWeddingFounderCohortCookie(
    cookieStore.get(ADMIN_COOKIE_NAME)?.value,
  );
  return (
    <WeddingWorkspace
      purchasingOpen={process.env.WEDDING_CHECKOUT_ENABLED === "true" || isFounderCohort}
      stagingReviewOnly={process.env.STAGING_REVIEW_ONLY === "true"}
    />
  );
}
