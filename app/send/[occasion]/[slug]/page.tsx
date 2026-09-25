import React, { Suspense } from "react";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  getAllScenarios,
  getScenario,
  getScenariosByCategory,
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
  BookOpen,
} from "lucide-react";

interface PageProps {
  params: Promise<{
    occasion: string;
    slug: string;
  }>;
}

export async function generateStaticParams() {
  return getAllScenarios().map((s) => ({
    occasion: s.occasionSlug,
    slug: s.slug,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { occasion, slug } = await params;
  const scenario = getScenario(occasion, slug);
  if (!scenario) return { title: "Card Not Found | sendmynotes" };

  const url = `https://sendmynotes.com/send/${scenario.occasionSlug}/${scenario.slug}`;

  return {
    title: `${scenario.metaTitle} | sendmynotes`,
    description: scenario.metaDescription,
    keywords: scenario.keywords,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: scenario.metaTitle,
      description: scenario.metaDescription,
      url,
      siteName: "sendmynotes",
      images: [
        {
          url: scenario.coverUrl,
          width: 1250,
          height: 1750,
          alt: scenario.h1Title,
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: scenario.metaTitle,
      description: scenario.metaDescription,
      images: [scenario.coverUrl],
    },
  };
}

export default async function ScenarioPage({ params }: PageProps) {
  const { occasion, slug } = await params;
  const scenario = getScenario(occasion, slug);

  if (!scenario) {
    notFound();
  }

  const relatedScenarios = getScenariosByCategory(scenario.category)
    .filter((s) => s.slug !== scenario.slug)
    .slice(0, 3);

  const canonicalUrl = `https://sendmynotes.com/send/${scenario.occasionSlug}/${scenario.slug}`;

  // Structured Data: Product + Offer Schema
  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: scenario.h1Title,
    image: scenario.coverUrl,
    description: scenario.metaDescription,
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

  // Structured Data: FAQ Schema
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: scenario.faq.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.answer,
      },
    })),
  };

  // Structured Data: Breadcrumb Schema
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
        name: "Send a Card",
        item: "https://sendmynotes.com/send",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: scenario.occasionName,
        item: `https://sendmynotes.com/send/${scenario.occasionSlug}`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: scenario.h1Title,
        item: canonicalUrl,
      },
    ],
  };

  return (
    <>
      {/* JSON-LD Structured Data for Google SERP & Shopping */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      <div className="min-h-screen bg-[#FAF8F5] text-stone-900 pb-24">
        {/* TOP BAR / BREADCRUMBS */}
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
                Occasions
              </Link>
              <ChevronRight className="w-3 h-3 mx-1.5 text-stone-400" />
              <span className="text-amber-900 font-semibold truncate max-w-[200px]">
                {scenario.badgeText}
              </span>
            </nav>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100/80 text-amber-900 border border-amber-300/60">
                $9.00 Flat All-Inclusive
              </span>
            </div>
          </div>
        </header>

        {/* HERO INTRO */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-10 pb-6 text-center space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-amber-700" />
            <span>{scenario.badgeText}</span>
          </div>

          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-stone-950 tracking-tight leading-tight">
            {scenario.h1Title}
          </h1>

          <p className="text-base sm:text-lg text-stone-600 max-w-2xl mx-auto leading-relaxed">
            {scenario.heroTagline}
          </p>

          {/* Value Props Pill Row */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2 text-xs font-medium text-stone-600">
            <span className="flex items-center gap-1 px-3 py-1 rounded-xl bg-white border border-stone-200 shadow-xs">
              <PenTool className="w-3.5 h-3.5 text-amber-600" />
              Real Pen-and-Ink Handwriting
            </span>
            <span className="flex items-center gap-1 px-3 py-1 rounded-xl bg-white border border-stone-200 shadow-xs">
              <Mail className="w-3.5 h-3.5 text-indigo-600" />
              USPS First Class Stamp Included
            </span>
            <span className="flex items-center gap-1 px-3 py-1 rounded-xl bg-white border border-stone-200 shadow-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Apple Pay &amp; Google Pay
            </span>
          </div>
        </section>

        {/* INTERACTIVE BUILDER (PRE-SEEDED) */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-amber-50/70 border border-amber-200/90 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-amber-950">
            <div className="flex items-center gap-2">
              <span className="text-base">✨</span>
              <span>
                <strong>Pre-seeded template loaded:</strong> Tasteful stationery art, sentiment, and etiquette note ready for your personal touch.
              </span>
            </div>
            <span className="text-[11px] text-amber-800 font-medium">
              Step 1 of 4 • Edit names and mail in 60 seconds
            </span>
          </div>

          {/* Mounted VendingMachineBuilder inside Suspense for static pre-rendering */}
          <Suspense
            fallback={
              <div className="min-h-[500px] bg-white rounded-3xl border border-stone-200 shadow-sm flex items-center justify-center p-8">
                <div className="text-center space-y-3">
                  <div className="w-8 h-8 border-2 border-stone-300 border-t-amber-700 rounded-full animate-spin mx-auto" />
                  <p className="text-xs font-serif uppercase tracking-widest text-stone-500">
                    Loading {scenario.h1Title}...
                  </p>
                </div>
              </div>
            }
          >
            <VendingMachineBuilder
              initialOccasion={scenario.occasionName}
              initialCoverUrl={scenario.coverUrl}
              initialPrintedGreeting={scenario.printedGreeting}
              initialHandwrittenNote={scenario.handwrittenNote}
              initialFontStyleId={scenario.fontStyleId}
              scenarioSlug={scenario.slug}
            />
          </Suspense>
        </section>

        {/* EDITORIAL & ETIQUETTE GUIDE (SEO AUTHORITY CONTENT) */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 space-y-12">
          {/* Etiquette Tips Cards */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-6">
            <div className="flex items-center gap-2 pb-3 border-b border-stone-100">
              <BookOpen className="w-5 h-5 text-amber-600" />
              <h2 className="text-xl font-serif font-bold text-stone-900">
                Etiquette &amp; Writing Guidance
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scenario.etiquetteTips.map((tip, i) => (
                <div
                  key={i}
                  className="p-4 rounded-2xl bg-[#FAF8F5] border border-stone-200/70 space-y-1.5"
                >
                  <h3 className="font-semibold text-stone-900 text-sm flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{tip.title}</span>
                  </h3>
                  <p className="text-xs text-stone-600 leading-relaxed pl-5">
                    {tip.content}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Why Physical Ink Matters */}
          <div className="bg-stone-900 text-white rounded-3xl p-8 space-y-4 shadow-md">
            <span className="text-[11px] uppercase tracking-wider font-bold text-amber-400">
              The Power of Tangible Mail
            </span>
            <h2 className="font-serif text-2xl font-bold text-white">
              Why Real Pen-on-Paper Outperforms Digital Messages
            </h2>
            <p className="text-stone-300 text-sm leading-relaxed">
              In a world where everyone sends fleeting text messages, emails, and LinkedIn DMs, physical mail commands 100% of the recipient&apos;s attention. Every card is written with real ballpoint pens featuring natural variable stroke pressure and ink shading on 120lb premium textured cardstock—giving them the warmth of a real handwritten note without you needing to find stamps or visit the post office.
            </p>
            <div className="pt-2 flex flex-wrap gap-4 text-xs text-stone-400">
              <span>✓ Never marked as spam or archived</span>
              <span>✓ Displayed proudly on desks and refrigerators</span>
              <span>✓ Complete with real USPS First Class stamp and envelope</span>
            </div>
          </div>

          {/* Frequently Asked Questions */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-6">
            <div className="flex items-center gap-2 pb-3 border-b border-stone-100">
              <HelpCircle className="w-5 h-5 text-amber-600" />
              <h2 className="text-xl font-serif font-bold text-stone-900">
                Frequently Asked Questions
              </h2>
            </div>

            <div className="space-y-4">
              {scenario.faq.map((item, i) => (
                <div key={i} className="p-4 rounded-2xl bg-stone-50/70 border border-stone-200/60 space-y-1.5">
                  <h3 className="font-semibold text-stone-900 text-sm">
                    {item.question}
                  </h3>
                  <p className="text-xs text-stone-600 leading-relaxed">
                    {item.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Related High-Converting Scenarios */}
          {relatedScenarios.length > 0 && (
            <div className="space-y-4 pt-4">
              <h2 className="text-lg font-serif font-bold text-stone-900">
                Explore More Handwritten Scenarios
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {relatedScenarios.map((rel) => (
                  <Link
                    key={rel.slug}
                    href={`/send/${rel.occasionSlug}/${rel.slug}`}
                    className="group p-4 bg-white rounded-2xl border border-stone-200 hover:border-amber-400 shadow-xs hover:shadow-md transition space-y-2 block"
                  >
                    <div className="relative w-full h-32 rounded-xl overflow-hidden bg-stone-100">
                      <Image
                        src={rel.coverUrl}
                        alt={rel.h1Title}
                        fill
                        sizes="(max-width: 640px) 100vw, 33vw"
                        className="object-cover group-hover:scale-105 transition duration-300"
                        unoptimized
                      />
                    </div>
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-700">
                      {rel.badgeText}
                    </span>
                    <h3 className="text-xs font-bold text-stone-900 group-hover:text-amber-900 transition line-clamp-2">
                      {rel.h1Title}
                    </h3>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
