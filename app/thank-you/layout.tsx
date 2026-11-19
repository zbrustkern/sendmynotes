import { notFound } from "next/navigation";
import "./wedding.css";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Wedding thank-you notes | SendMyNotes",
  robots: { index: false, follow: false },
};
export default function ThankYouLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.NEXT_PUBLIC_WEDDING_PORTAL_ENABLED !== "true") notFound();
  return children;
}
