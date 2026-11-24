import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ADMIN_COOKIE_NAME } from "@/lib/admin-auth";
import { getThankYouLayoutMetadata } from "@/lib/wedding/metadata";
import { isWeddingFounderCohortCookie } from "@/lib/wedding/server";
import "./wedding.css";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return getThankYouLayoutMetadata();
}

export default async function ThankYouLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const isFounderCohort = isWeddingFounderCohortCookie(
    cookieStore.get(ADMIN_COOKIE_NAME)?.value,
  );
  if (process.env.NEXT_PUBLIC_WEDDING_PORTAL_ENABLED !== "true" && !isFounderCohort) {
    notFound();
  }
  return children;
}
