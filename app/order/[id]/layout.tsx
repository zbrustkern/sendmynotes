import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Order Tracker | sendmynotes",
  description: "Track your handwritten card inking and USPS postal delivery status.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function OrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
