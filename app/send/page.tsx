import React from "react";
import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getAllScenarios } from "@/lib/seo-scenarios";
import {
  Sparkles,
  ArrowRight,
  PenTool,
  Mail,
  ShieldCheck,
  ChevronRight,
  Briefcase,
  Heart,
  PartyPopper,
  Smile,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Send a Real Handwritten Card for Any Occasion | sendmynotes",
  description:
    "Browse curated greeting card scenarios written in real pen and ink on heavy cardstock and delivered via USPS First Class mail. No trips to the store, no stamps, no hassle.",
  alternates: {
    canonical: "https://sendmynotes.com/send",
  },
  openGraph: {
    title: "Send a Real Handwritten Card for Any Occasion | sendmynotes",
    description:
      "Send a real handwritten card in minutes. Written in real pen and ink on heavy cardstock, stamped, and mailed directly to their door.",
    url: "https://sendmynotes.com/send",
    siteName: "sendmynotes",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "sendmynotes - Send a Real Handwritten Card for Any Occasion",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Send a Real Handwritten Card for Any Occasion | sendmynotes",
    description:
      "Send a real handwritten card in minutes. Written in real pen and ink on heavy cardstock, stamped, and mailed directly to their door.",
    images: ["/og-image.png"],
  },
};

export default function SendCatalogPage() {
  const scenarios = getAllScenarios();

  const categories = [
    {
      id: "career",
      name: "Career & Professional",
      icon: Briefcase,
      description: "Post-interview thank yous, mentor appreciation, and client closing gifts.",
      items: scenarios.filter((s) => s.category === "career"),
    },
    {
      id: "sympathy",
      name: "Sympathy & Support",
      icon: Heart,
      description: "Comforting condolence notes for pet loss, family grief, and hard seasons.",
      items: scenarios.filter((s) => s.category === "sympathy"),
    },
    {
      id: "milestone",
      name: "Life Milestones",
      icon: PartyPopper,
      description: "Housewarmings, career promotions, and milestone 50th/60th birthdays.",
      items: scenarios.filter((s) => s.category === "milestone"),
    },
    {
      id: "gratitude",
      name: "Love & Gratitude",
      icon: Smile,
      description: "Anniversaries to spouses and thoughtful birthday notes to distant best friends.",
      items: scenarios.filter((s) => s.category === "gratitude" || s.category === "support"),
    },
  ];

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-stone-900 pb-24">
      {/* HEADER */}
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
            <span className="text-amber-900 font-semibold">Occasion Catalog</span>
          </nav>

          <Link
            href="/"
            className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-black text-white transition cursor-pointer"
          >
            Custom Card Builder &rarr;
          </Link>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-12 pb-8 text-center space-y-4">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5 text-amber-700" />
          <span>Curated Etiquette Scenarios</span>
        </div>

        <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-stone-950 tracking-tight">
          Send a Real Handwritten Note For Life&apos;s Meaningful Moments
        </h1>

        <p className="text-base sm:text-lg text-stone-600 max-w-2xl mx-auto leading-relaxed">
          Skip the greeting card aisle and writer&apos;s block. Choose a scenario below to load a pre-seeded card design and sentiment, ready to edit and mail in 60 seconds.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2 text-xs font-medium text-stone-600">
          <span className="flex items-center gap-1 px-3 py-1 rounded-xl bg-white border border-stone-200 shadow-xs">
            <PenTool className="w-3.5 h-3.5 text-amber-600" />
            Written with Real Pen &amp; Ink
          </span>
          <span className="flex items-center gap-1 px-3 py-1 rounded-xl bg-white border border-stone-200 shadow-xs">
            <Mail className="w-3.5 h-3.5 text-indigo-600" />
            USPS Stamp Included
          </span>
          <span className="flex items-center gap-1 px-3 py-1 rounded-xl bg-white border border-stone-200 shadow-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            $9.00 Flat All-Inclusive
          </span>
        </div>
      </section>

      {/* CATEGORIES & CARDS GRID */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16 pt-4">
        {categories.map((cat) => {
          const Icon = cat.icon;
          return (
            <div key={cat.id} className="space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-stone-200">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-100/80 text-amber-900 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-amber-800" />
                  </div>
                  <div>
                    <h2 className="text-xl font-serif font-bold text-stone-900">
                      {cat.name}
                    </h2>
                    <p className="text-xs text-stone-500">{cat.description}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {cat.items.map((scenario) => (
                  <Link
                    key={scenario.slug}
                    href={`/send/${scenario.occasionSlug}/${scenario.slug}`}
                    className="group bg-white rounded-3xl border border-stone-200 hover:border-amber-400/80 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col justify-between"
                  >
                    <div>
                      <div className="relative w-full h-48 bg-stone-100 overflow-hidden">
                        <Image
                          src={scenario.coverUrl}
                          alt={scenario.h1Title}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          className="object-cover group-hover:scale-105 transition-transform duration-500"
                          unoptimized
                        />
                        <div className="absolute top-3 left-3">
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/95 text-stone-900 shadow-xs backdrop-blur-xs">
                            {scenario.badgeText}
                          </span>
                        </div>
                      </div>

                      <div className="p-5 space-y-2">
                        <h3 className="font-serif text-lg font-bold text-stone-900 group-hover:text-amber-800 transition line-clamp-2">
                          {scenario.h1Title}
                        </h3>
                        <p className="text-xs text-stone-500 line-clamp-2 leading-relaxed">
                          {scenario.heroTagline}
                        </p>
                      </div>
                    </div>

                    <div className="p-5 pt-0 border-t border-stone-100 flex items-center justify-between text-xs font-semibold text-amber-800 group-hover:text-amber-950">
                      <span>Personalize &amp; Mail</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}
