import React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Mail,
  ShieldCheck,
  Clock,
  HelpCircle,
  Sparkles,
} from "lucide-react";

export const metadata = {
  title: "Refund & Return Policy — sendmynotes.com",
  description:
    "Refund, cancellation, and replacement policies for custom robotic pen greeting cards and postal mailings from Aster & Blanche Press.",
};

export default function ReturnPolicyPage() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] text-stone-900 selection:bg-amber-100 selection:text-amber-900 pb-20">
      {/* Top Navigation Header */}
      <header className="border-b border-stone-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-semibold text-stone-600 hover:text-stone-900 transition"
          >
            <ArrowLeft className="w-4 h-4 text-amber-600" />
            <span>Return to Card Studio</span>
          </Link>
          <span className="font-serif text-sm font-bold tracking-tight text-stone-900">
            sendmynotes<span className="text-amber-600">.com</span>
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-10">
        {/* Title Header */}
        <div className="text-center mb-10 pb-8 border-b border-stone-200">
          <div className="w-12 h-12 rounded-2xl bg-stone-900 text-amber-400 mx-auto mb-4 flex items-center justify-center shadow-md">
            <RotateCcw className="w-6 h-6" />
          </div>
          <span className="text-[11px] uppercase font-bold tracking-widest text-stone-400 font-mono block mb-2">
            Customer Guarantee &amp; Studio Policy
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-stone-900 mb-3">
            Refund &amp; Return Policy
          </h1>
          <p className="text-xs text-stone-500 max-w-lg mx-auto leading-relaxed">
            Effective Date: September 24, 2026 • Published by{" "}
            <strong>Aster &amp; Blanche Press</strong>, operator of{" "}
            <strong>sendmynotes.com</strong> (Lake Forest, IL).
          </p>
        </div>

        {/* Policy Body */}
        <div className="space-y-8 text-sm leading-relaxed text-stone-700 bg-white p-6 sm:p-10 rounded-3xl border border-stone-200/80 shadow-xs">
          {/* Quick Summary Pill Box */}
          <div className="p-4 bg-amber-50/80 rounded-2xl border border-amber-200/80 text-xs text-amber-950 space-y-2">
            <p className="font-bold flex items-center gap-1.5 text-amber-900 text-sm">
              <ShieldCheck className="w-4 h-4 text-amber-700" />
              Studio Peace-of-Mind Guarantee:
            </p>
            <p className="leading-relaxed">
              Because our cards are <strong>custom, made-to-order physical items</strong> penned with real ink and mailed directly via USPS, physical returns are not accepted once mailed. However, if your card arrives damaged, has a manufacturing defect, or if you cancel before robotic inking begins, <strong>we provide a 100% full refund or free immediate reprint.</strong>
            </p>
          </div>

          {/* Section 1: Nature of Custom Physical Goods */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">1</span>
              Personalized &amp; Custom On-Demand Products
            </h2>
            <p>
              Each greeting card ordered on <strong>sendmynotes.com</strong> is individually customized with your bespoke cover art, inside sentiment, and personalized handwritten message written with physical ballpoint pens on robotic plotters.
            </p>
            <p>
              Because these goods are personalized with specific names, unique text, and dispatched directly into the United States Postal Service mail stream, <strong>physical returns to our studio cannot be accepted, restocked, or resold.</strong>
            </p>
          </section>

          {/* Section 2: Order Cancellations Before Inking */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">2</span>
              Order Cancellations &amp; Modifications
            </h2>
            <p>
              We strive to fulfill cards as rapidly as possible, often queueing orders for robotic inking within minutes of checkout.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-stone-600">
              <li>
                <strong>Before Inking Has Commenced:</strong> If you notice an error in your message or wish to cancel your order, email us immediately at <a href="mailto:support@sendmynotes.com" className="text-amber-700 underline font-medium">support@sendmynotes.com</a> with your Order ID. If our studio has not yet inked and sealed your envelope, we will gladly cancel your order and issue an <strong>immediate 100% refund</strong>.
              </li>
              <li>
                <strong>Scheduled Future Send Dates:</strong> If you selected a future send date, your order can be edited or cancelled at any time up until <strong>24 hours prior to the scheduled inking date</strong> for a full refund.
              </li>
              <li>
                <strong>After Inking &amp; Induction into USPS:</strong> Once a card has been penned by our robotic plotters and handed over to the postal carrier, the order cannot be cancelled or recalled.
              </li>
            </ul>
          </section>

          {/* Section 3: Defects, Damage & Replacements */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">3</span>
              Manufacturing Defects &amp; Replacement Policy
            </h2>
            <p>
              We take tremendous pride in the tactile quality of our cotton cardstock and real-ink handwriting. You are entitled to a <strong>free replacement or a 100% full refund</strong> if:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-1">
                <p className="font-semibold text-stone-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Robotic Plotter Errors
                </p>
                <p className="text-stone-500">
                  Severe ink smears, skipped pen strokes, missing text lines, or misaligned margins.
                </p>
              </div>
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-1">
                <p className="font-semibold text-stone-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Studio Printing Flaws
                </p>
                <p className="text-stone-500">
                  Defective cardstock, severe color banding, creased paper, or incorrect orientation.
                </p>
              </div>
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-1">
                <p className="font-semibold text-stone-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Transit Damage
                </p>
                <p className="text-stone-500">
                  Envelope arrived torn, folded, or severely water-damaged during postal transit.
                </p>
              </div>
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-1">
                <p className="font-semibold text-stone-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Wrong Card Dispatched
                </p>
                <p className="text-stone-500">
                  Dispatched cover art or inside text does not match the specifications submitted in your order.
                </p>
              </div>
            </div>
            <p className="text-xs text-stone-500 pt-1">
              To request a replacement or refund under this section, please notify us within <strong>14 days</strong> of the estimated delivery date with a photo of the defect.
            </p>
          </section>

          {/* Section 4: Postal Delivery & Address Accuracy */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">4</span>
              Address Accuracy &amp; USPS Non-Delivery
            </h2>
            <p>
              Customers are solely responsible for ensuring that the recipient name, street address, apartment/suite number, and 5-digit ZIP code provided during checkout are correct and mailable according to USPS standards.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-stone-600">
              <li>
                <strong>Incorrect Customer Address:</strong> If a card is returned to the return address or marked undeliverable by USPS due to an address typo or incorrect recipient information entered by the customer, we cannot issue a cash refund. However, our team will gladly offer a <strong>50% re-order voucher</strong> to pen and mail a new card to the corrected address.
              </li>
              <li>
                <strong>Carrier Loss:</strong> If USPS tracking confirms the card was lost in transit or if domestic delivery has not occurred within <strong>10 business days</strong> of dispatch, we will happily reissue and re-mail your card at <strong>zero charge</strong>, or issue a full refund at your request.
              </li>
            </ul>
          </section>

          {/* Section 5: How Refunds Are Processed */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">5</span>
              Refund Method &amp; Processing Timelines
            </h2>
            <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 text-xs space-y-2">
              <div className="flex items-center gap-2 font-semibold text-stone-900">
                <Clock className="w-4 h-4 text-amber-600" />
                <span>Standard Processing Timeframe:</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-stone-600">
                <li>
                  Approved refunds are processed immediately through our payment gateway (<strong>Stripe</strong>).
                </li>
                <li>
                  Funds are credited directly to the original payment method used during checkout (Credit/Debit Card, Apple Pay, or Google Pay).
                </li>
                <li>
                  Depending on your financial institution or card issuer, refunds typically post to your billing statement within <strong>5 to 10 business days</strong>.
                </li>
                <li>
                  If an order was covered partially or fully by a promo voucher code, the voucher code will be reactivated for future use.
                </li>
              </ul>
            </div>
          </section>

          {/* Section 6: How to Request a Refund or Replacement */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">6</span>
              Step-by-Step Claim Procedure
            </h2>
            <p className="text-xs text-stone-600">
              To request a cancellation, replacement, or refund, follow these simple steps:
            </p>
            <ol className="list-decimal pl-5 space-y-2 text-xs text-stone-700">
              <li>
                <strong>Locate Your Order ID:</strong> Find your order confirmation email or open your tracking link (e.g., <code>order_a1b2c3...</code>).
              </li>
              <li>
                <strong>Email Customer Support:</strong> Send a brief message to{" "}
                <a href="mailto:support@sendmynotes.com" className="text-amber-700 font-semibold underline">
                  support@sendmynotes.com
                </a>{" "}
                with the subject line: <code>[Refund/Replacement Request] Order ID</code>.
              </li>
              <li>
                <strong>Attach Details or Photo:</strong> If reporting a print defect or transit damage, please attach a quick photo showing the issue.
              </li>
            </ol>
            <p className="text-xs text-stone-500 pt-1">
              Our studio support team reviews all requests within <strong>24 business hours</strong> and will confirm your refund or dispatch your replacement immediately.
            </p>
          </section>

          {/* Section 7: Studio Contact Information */}
          <section className="pt-4 border-t border-stone-200 text-xs text-stone-500 space-y-1.5">
            <h3 className="font-bold text-stone-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-amber-600" />
              Customer Support &amp; Studio Inquiries:
            </h3>
            <p className="font-medium text-stone-800">
              Aster &amp; Blanche Press • sendmynotes.com
            </p>
            <p>Lake Forest, Illinois, United States</p>
            <p>
              Email Support:{" "}
              <a href="mailto:support@sendmynotes.com" className="text-amber-700 underline font-semibold">
                support@sendmynotes.com
              </a>
            </p>
            <p>Support Hours: Monday – Friday, 9:00 AM – 6:00 PM CST</p>
          </section>

          {/* Cross links */}
          <div className="pt-4 border-t border-stone-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-stone-500">
            <span>Related Legal &amp; Operating Policies:</span>
            <div className="flex items-center gap-3 font-semibold text-amber-800">
              <Link href="/terms" className="hover:underline">
                Terms of Service
              </Link>
              <span>•</span>
              <Link href="/privacy" className="hover:underline">
                Privacy Policy
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
