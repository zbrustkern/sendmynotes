import { CompPaymentClient } from "./client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Secure order payment | SendMyNotes",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
};

export default async function CompPaymentPage({ params }: { params: Promise<{ capability: string }> }) {
  const { capability } = await params;
  return <CompPaymentClient capability={capability} />;
}
