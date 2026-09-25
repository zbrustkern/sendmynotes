import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { AttributionTracker } from "@/components/AttributionTracker";
import { fontHwAdam, fontHwCharity, fontHwChase, fontHwDavid, fontHwKate, fontHwWill } from "@/lib/fonts";
import { GOOGLE_ADS_ID } from "@/lib/google-ads";

export const metadata: Metadata = {
  metadataBase: new URL("https://sendmynotes.com"),
  title: {
    default: "sendmynotes.com | Real Handwritten Cards, Mailed for You",
    template: "%s | sendmynotes.com",
  },
  description:
    "Send real pen-on-paper handwritten greeting cards in minutes. Written with real ballpoint ink on 120 lb archival cardstock, stamped, and mailed anywhere in the US for $9.00 flat.",
  applicationName: "sendmynotes",
  authors: [{ name: "Aster & Blanche Press" }],
  creator: "Aster & Blanche Press",
  publisher: "sendmynotes",
  keywords: [
    "handwritten greeting cards",
    "send handwritten card online",
    "real pen handwritten note",
    "handwritten cards mailed for you",
    "custom 5x7 folded cards",
    "handwritten letter service",
  ],
  alternates: {
    canonical: "https://sendmynotes.com",
  },
  openGraph: {
    title: "Real Handwritten Cards, Mailed for You | sendmynotes.com",
    description:
      "Send a real handwritten card in minutes. Written in real pen and ink on 120 lb archival cardstock, stamped, and mailed directly to their door for $9 flat.",
    url: "https://sendmynotes.com",
    siteName: "sendmynotes.com",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "sendmynotes.com - Real Handwritten Cards, Mailed for You",
        type: "image/png",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Real Handwritten Cards, Mailed for You | sendmynotes.com",
    description:
      "Send a real handwritten card in minutes. Written in real pen and ink on 120 lb archival cardstock, stamped, and mailed directly to their door for $9 flat.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
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
          href="https://fonts.googleapis.com/css2?family=Architects+Daughter&family=Caveat:wght@500;700&family=Cormorant+Garamond:wght@400;500;600;700&family=Dancing+Script:wght@600;700&family=Inter:wght@400;500;600;700&family=Patrick+Hand&family=Playfair+Display:ital,wght@0,600;1,600&display=swap"
          rel="stylesheet"
        />
        {/* Schema.org Semantic Data for AI Agents & Search Engines */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Product",
              name: "Custom Handwritten 5x7 Greeting Card",
              image: "https://sendmynotes.com/aster-blanche-backplate.png",
              description:
                "Physical 5x7 greeting cards written with real ballpoint pen inking on 120 lb archival cardstock. Stamped and mailed via USPS First Class.",
              brand: {
                "@type": "Brand",
                name: "Aster & Blanche Press",
              },
              offers: {
                "@type": "Offer",
                price: "9.00",
                priceCurrency: "USD",
                availability: "https://schema.org/InStock",
                priceValidUntil: "2027-12-31",
                shippingDetails: {
                  "@type": "OfferShippingDetails",
                  shippingRate: {
                    "@type": "MonetaryAmount",
                    value: "0.00",
                    currency: "USD",
                  },
                  deliveryTime: {
                    "@type": "ShippingDeliveryTime",
                    handlingTime: {
                      "@type": "QuantitativeValue",
                      minValue: 1,
                      maxValue: 2,
                      unitCode: "d",
                    },
                    transitTime: {
                      "@type": "QuantitativeValue",
                      minValue: 2,
                      maxValue: 4,
                      unitCode: "d",
                    },
                  },
                },
              },
            }),
          }}
        />
        {/* Google tag (gtag.js) for Google Ads */}
        <Script
          strategy="afterInteractive"
          src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
        />
        <Script
          id="google-ads-gtag-init"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GOOGLE_ADS_ID}');
            `,
          }}
        />
      </head>
      <body
        className={`${fontHwAdam.variable} ${fontHwCharity.variable} ${fontHwChase.variable} ${fontHwDavid.variable} ${fontHwKate.variable} ${fontHwWill.variable} min-h-screen bg-[#FAF8F5] text-stone-900 antialiased selection:bg-amber-100 selection:text-amber-900`}
      >
        <AuthProvider>
          <AttributionTracker />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
