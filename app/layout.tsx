import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "sendmynotes.com | AI-Designed, Real-Pen Handwritten Greeting Cards",
  description:
    "Custom 5x7 folded greeting cards written with real robotic pen inking on heavy cardstock. No account required. Mailed anywhere in the US for $6.50 flat.",
  openGraph: {
    title: "sendmynotes.com - Handwritten Cards by Robot Pen",
    description: "Physical 5x7 folded greeting cards with real ballpoint ink. Mailed via USPS First Class.",
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
