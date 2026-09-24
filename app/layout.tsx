import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

export const metadata: Metadata = {
  title: "sendmynotes.com | AI-Designed, Real-Pen Handwritten Greeting Cards",
  description:
    "Custom 5x7 folded greeting cards written with real robotic pen inking on heavy cardstock. No account required. Mailed anywhere in the US for $9.00 flat.",
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
          href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Cormorant+Garamond:wght@400;500;600;700&family=Dancing+Script:wght@600;700&family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,600;1,600&display=swap"
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
                "Physical 5x7 greeting cards penned with real ballpoint ink by robotic plotters on 120 lb archival cardstock. Mailed via USPS First Class.",
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
      </head>
      <body className="min-h-screen bg-[#FAF8F5] text-stone-900 antialiased selection:bg-amber-100 selection:text-amber-900">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
