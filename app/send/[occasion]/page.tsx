import React, { Suspense } from "react";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  getScenariosByOccasion,
  normalizeOccasionSlug,
  OCCASION_ALIASES,
  OCCASION_METADATA,
} from "@/lib/seo-scenarios";
import { VendingMachineBuilder } from "@/components/VendingMachineBuilder";
import {
  PenTool,
  CheckCircle2,
  ShieldCheck,
  Mail,
  ChevronRight,
  Sparkles,
  ArrowRight,
  HelpCircle,
} from "lucide-react";

interface PageProps {
  params: Promise<{
    occasion: string;
  }>;
}

// Allow dynamic resolution on-demand for occasion variations without registering separate pages
export const dynamicParams = true;

export async function generateStaticParams() {
  return [
    { occasion: "thank-you" },
    { occasion: "sympathy" },
    { occasion: "congratulations" },
    { occasion: "birthday" },
    { occasion: "anniversary" },
    { occasion: "get-well" },
    { occasion: "thinking-of-you" },
  ];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { occasion } = await params;
  const normOccasion = normalizeOccasionSlug(occasion);
  const meta = OCCASION_METADATA[normOccasion];

  if (!meta) {
    return { title: "Cards | sendmynotes" };
  }

  const canonicalUrl = `https://sendmynotes.com/send/${normOccasion}`;

  return {
    title: `${meta.metaTitle} | sendmynotes`,
    description: meta.metaDescription,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: meta.metaTitle,
      description: meta.metaDescription,
      url: canonicalUrl,
      siteName: "sendmynotes",
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: meta.headline,
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: meta.metaTitle,
      description: meta.metaDescription,
      images: ["/og-image.png"],
    },
  };
}

export default async function OccasionPage({ params }: PageProps) {
  const { occasion } = await params;
  const normOccasion = normalizeOccasionSlug(occasion);
  const meta = OCCASION_METADATA[normOccasion];
  const scenarios = getScenariosByOccasion(normOccasion);

  if (!meta || scenarios.length === 0) {
    notFound();
  }

  const primaryScenario = scenarios[0];
  const canonicalUrl = `https://sendmynotes.com/send/${normOccasion}`;

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://sendmynotes.com",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Send",
        item: "https://sendmynotes.com/send",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: meta.name,
        item: canonicalUrl,
      },
    ],
  };

  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: meta.headline,
    image: primaryScenario.coverUrl,
    description: meta.description,
    brand: {
      "@type": "Brand",
      name: "sendmynotes",
    },
    offers: {
      "@type": "Offer",
      price: "9.00",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: canonicalUrl,
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: {
          "@type": "MonetaryAmount",
          value: "0.00",
          currency: "USD",
        },
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          transitTime: {
            "@type": "QuantitativeValue",
            minValue: 2,
            maxValue: 5,
            unitCode: "DAY",
          },
        },
      },
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />

      <div className="min-h-screen bg-[#FAF8F5] text-stone-900 pb-24">
        {/* HEADER / NAVIGATION */}
        <header className="border-b border-stone-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
            <Link
              href="/"
              className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-stone-900 hover:text-amber-700 transition"
            >
              sendmynotes
            </Link>

            <nav aria-label="Breadcrumb" className="hidden sm:flex items-center text-xs text-stone-500">
              <Link href="/" className="hover:text-stone-900 transition">
                Home
              </Link>
              <ChevronRight className="w-3 h-3 mx-1.5 text-stone-400" />
              <Link href="/send" className="hover:text-stone-900 transition">
                Send
              </Link>
              <ChevronRight className="w-3 h-3 mx-1.5 text-stone-400" />
              <span className="text-amber-900 font-semibold">{meta.name}</span>
            </nav>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100/80 text-amber-900 border border-amber-300/60">
                $9.00 Flat All-Inclusive
              </span>
            </div>
          </div>
        </header>

        {/* HERO SECTION */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-10 pb-6 text-center space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-amber-700" />
            <span>{meta.name} Cards</span>
          </div>

          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-stone-950 tracking-tight leading-tight">
            {meta.headline}
          </h1>

          <p className="text-base sm:text-lg text-stone-600 max-w-2xl mx-auto leading-relaxed">
            {meta.description}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2 text-xs font-medium text-stone-600">
            <span className="flex items-center gap-1 px-3 py-1 rounded-xl bg-white border border-stone-200 shadow-xs">
              <PenTool className="w-3.5 h-3.5 text-amber-600" />
              Written in Real Pen &amp; Ink
            </span>
            <span className="flex items-center gap-1 px-3 py-1 rounded-xl bg-white border border-stone-200 shadow-xs">
              <Mail className="w-3.5 h-3.5 text-indigo-600" />
              USPS First Class Stamp Included
            </span>
            <span className="flex items-center gap-1 px-3 py-1 rounded-xl bg-white border border-stone-200 shadow-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              $9.00 Flat All-Inclusive
            </span>
          </div>
        </section>

        {/* OCCASION TEMPLATES GRID */}
        {scenarios.length > 1 && (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="text-center mb-6">
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-stone-900">
                Choose a Curated Note Scenario
              </h2>
              <p className="text-xs text-stone-500 mt-1">
                Select an etiquette template to jumpstart your card, or use the builder below.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {scenarios.map((sc) => (
                <Link
                  key={sc.slug}
                  href={`/send/${sc.occasionSlug}/${sc.slug}`}
                  className="group bg-white rounded-3xl border border-stone-200 hover:border-amber-400 shadow-xs hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <div className="relative w-full h-44 bg-stone-100 overflow-hidden">
                      <Image
                        src={sc.coverUrl}
                        alt={sc.h1Title}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        unoptimized
                      />
                      <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-xs text-[10px] font-bold text-stone-800 shadow-xs uppercase tracking-wider">
                        {sc.badgeText}
                      </div>
                    </div>

                    <div className="p-5 space-y-2">
                      <h3 className="font-serif font-bold text-base text-stone-900 group-hover:text-amber-700 transition">
                        {sc.h1Title}
                      </h3>
                      <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed">
                        {sc.heroTagline}
                      </p>
                    </div>
                  </div>

                  <div className="p-5 pt-0">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 group-hover:text-amber-800">
                      Customize this note <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* EMBEDDED CARD BUILDER */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-amber-50/70 border border-amber-200/90 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-amber-950">
            <div className="flex items-center gap-2">
              <span className="text-base">✨</span>
              <span>
                <strong>{meta.name} card builder ready:</strong> Edit the message, preview the real pen handwriting, and mail in 60 seconds.
              </span>
            </div>
            <span className="text-[11px] text-amber-800 font-medium">
              No store runs • No stamps • $9 flat
            </span>
          </div>

          <Suspense
            fallback={
              <div className="min-h-[500px] bg-white rounded-3xl border border-stone-200 shadow-sm flex items-center justify-center p-8">
                <div className="text-center space-y-3">
                  <div className="w-8 h-8 border-2 border-stone-300 border-t-amber-700 rounded-full animate-spin mx-auto" />
                  <p className="text-xs font-serif uppercase tracking-widest text-stone-500">
                    Loading {meta.name} Card Builder...
                  </p>
                </div>
              </div>
            }
          >
            <VendingMachineBuilder
              initialOccasion={primaryScenario.occasionName}
              initialCoverUrl={primaryScenario.coverUrl}
              initialPrintedGreeting={primaryScenario.printedGreeting}
              initialHandwrittenNote={primaryScenario.handwrittenNote}
              initialFontStyleId={primaryScenario.fontStyleId}
              scenarioSlug={primaryScenario.slug}
            />
          </Suspense>
        </section>

        {/* TRUST & HOW IT WORKS */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 space-y-10">
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-xs space-y-6">
            <h2 className="text-xl font-serif font-bold text-stone-900 border-b border-stone-100 pb-3">
              Why Send a Real Handwritten Card?
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center">
                  <PenTool className="w-4 h-4 text-amber-800" />
                </div>
                <h3 className="font-semibold text-sm text-stone-900">Real Pen &amp; Ink</h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Actual ballpoint pen ink physically pressed into heavyweight cardstock, creating natural indentations and ink variations.
                </p>
              </div>

              <div className="space-y-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-900 flex items-center justify-center">
                  <Mail className="w-4 h-4 text-indigo-800" />
                </div>
                <h3 className="font-semibold text-sm text-stone-900">Stamped &amp; Mailed</h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  We handle the envelope, real USPS First-Class postage stamp, addressing, and postal dispatch for you.
                </p>
              </div>

              <div className="space-y-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-900 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-emerald-800" />
                </div>
                <h3 className="font-semibold text-sm text-stone-900">Zero Hassle</h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Skip searching for stamps, buying overpriced drugstore cards, and finding a postbox. Complete your card in 60 seconds from your phone.
                </p>
              </div>
            </div>
          </div>

          {/* OCCASION FAQS */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-xs space-y-6">
            <div className="flex items-center gap-2 pb-3 border-b border-stone-100">
              <HelpCircle className="w-5 h-5 text-amber-600" />
              <h2 className="text-xl font-serif font-bold text-stone-900">
                Frequently Asked Questions
              </h2>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-stone-50/80 border border-stone-100 space-y-1.5">
                <h3 className="text-sm font-semibold text-stone-900">
                  How long does delivery take?
                </h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Cards are produced and dispatched within 24 hours. USPS First Class mail generally delivers in 2 to 5 business days anywhere in the United States.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-stone-50/80 border border-stone-100 space-y-1.5">
                <h3 className="text-sm font-semibold text-stone-900">
                  Can I customize the message or artwork?
                </h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Yes! You can completely edit the handwritten message, choose from multiple real handwriting styles, and even create your own custom card cover art with our built-in image generator.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-stone-50/80 border border-stone-100 space-y-1.5">
                <h3 className="text-sm font-semibold text-stone-900">
                  What is included in the $9.00 flat price?
                </h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Everything: premium heavyweight greeting card, custom artwork printing, real pen handwriting inside, custom envelope addressing, real USPS First-Class postage stamp, and delivery. No hidden checkout fees.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
