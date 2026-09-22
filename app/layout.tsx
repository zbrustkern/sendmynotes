import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "sendmynotes.com | The Internet Vending Machine for Handwritten Cards",
  description:
    "Zero login, zero accounts. AI-designed 5x7 folded cards with robotic pen-on-paper calligraphy, mailed anywhere via USPS for $6.50 flat.",
  openGraph: {
    title: "sendmynotes.com - Handwritten Cards by Robot Pen",
    description: "Coins in, physical card sent. 5x7 folded greeting cards with real pen inking.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Dancing+Script:wght@600;700&family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,600;1,600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[#FAF8F5] text-stone-900 antialiased selection:bg-amber-100 selection:text-amber-900">
        {children}
      </body>
    </html>
  );
}
