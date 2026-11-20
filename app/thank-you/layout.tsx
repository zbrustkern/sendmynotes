import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getThankYouLayoutMetadata } from "@/lib/wedding/metadata";
import "./wedding.css";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return getThankYouLayoutMetadata();
}

export default function ThankYouLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.NEXT_PUBLIC_WEDDING_PORTAL_ENABLED !== "true") notFound();
  return children;
}
