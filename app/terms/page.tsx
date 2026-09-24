import React from "react";
import Link from "next/link";
import { ArrowLeft, Shield, Scale, Mail, FileText, CheckCircle2 } from "lucide-react";

export const metadata = {
  title: "Terms of Service & Consumer Notice — sendmynotes.com",
  description: "Terms of service, fulfillment policies, postal delivery notices, and limitation of liability for Aster & Blanche Press and sendmynotes.com.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] text-stone-900 selection:bg-amber-100 selection:text-amber-900 pb-20">
      {/* Top Header */}
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

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-10">
        {/* Title Header */}
        <div className="text-center mb-10 pb-8 border-b border-stone-200">
          <div className="w-12 h-12 rounded-2xl bg-stone-900 text-amber-400 mx-auto mb-4 flex items-center justify-center shadow-md">
            <Scale className="w-6 h-6" />
          </div>
          <span className="text-[11px] uppercase font-bold tracking-widest text-stone-400 font-mono block mb-2">
            Legal &amp; Operating Agreement
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-stone-900 mb-3">
            Terms of Service &amp; Conditions
          </h1>
          <p className="text-xs text-stone-500 max-w-lg mx-auto leading-relaxed">
            Effective Date: September 24, 2026 • Published by <strong>Aster &amp; Blanche Press</strong>, operator of <strong>sendmynotes.com</strong> (Lake Forest, IL).
          </p>
        </div>

        {/* Legal Prose */}
        <div className="space-y-8 text-sm leading-relaxed text-stone-700 bg-white p-6 sm:p-10 rounded-3xl border border-stone-200/80 shadow-xs">
          {/* Section 1: Overview & Service Scope */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">1</span>
              Operating Identity &amp; Acceptance
            </h2>
            <p>
              These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the website located at <strong>sendmynotes.com</strong> (the &ldquo;Service&rdquo; or &ldquo;Site&rdquo;), operated by <strong>Aster &amp; Blanche Press</strong> (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;).
            </p>
            <p>
              By accessing our website, creating custom greeting cards, generating imagery, or purchasing our robotic pen mailing services, you agree to be bound by these Terms and all applicable laws. If you do not agree with any part of these Terms, you may not use the Service.
            </p>
          </section>

          {/* Section 2: Physical Fulfillment & Postal Mail Services */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">2</span>
              Card Production &amp; USPS Postal Delivery Disclaimers
            </h2>
            <p>
              We provide automated physical greeting card manufacturing and mailing fulfillment. Cards are printed on archival cardstock, penned using automated robotic ballpoint plotters, stamped with domestic postage, and inducted into the United States Postal Service (&ldquo;USPS&rdquo;) First Class Mail stream.
            </p>
            <div className="p-4 bg-amber-50/70 rounded-2xl border border-amber-200/80 text-xs text-amber-950 space-y-2">
              <p className="font-semibold flex items-center gap-1.5 text-amber-900">
                <Shield className="w-3.5 h-3.5" />
                Postal Carrier Notice &amp; Transit Times:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-amber-900/90">
                <li>Delivery dates and transit windows (e.g., 3–6 business days) displayed on the Site are estimates provided by postal carrier schedules and are <strong>not guaranteed delivery deadlines</strong>.</li>
                <li>Once an envelope is handed over to the USPS, delivery speed, weather delays, postal rerouting, forwarding orders, and mailbox security are strictly within the custody and control of the postal service.</li>
                <li>You are solely responsible for ensuring that the recipient name and street address supplied during checkout are accurate, mailable, and deliverable according to USPS standards. We cannot refund orders returned due to invalid or undeliverable addresses provided by the customer.</li>
              </ul>
            </div>
          </section>

          {/* Section 3: Content Guidelines & Prohibited Conduct */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">3</span>
              Acceptable Use &amp; Prohibited Content
            </h2>
            <p>
              SendMyNotes is built for warm, celebratory, personal, and professional correspondence. Because cards are physically mailed through the United States Postal Service, you agree not to submit any custom card covers, printed greetings, or handwritten messages that contain:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-stone-600">
              <li>Threats of physical harm, harassment, stalking, extortion, or intimidation of any person.</li>
              <li>Defamatory, libelous, fraudulent, or deceptive statements.</li>
              <li>Explicit, non-consensual sexually explicit imagery or pornography.</li>
              <li>Content promoting hate speech, violence, or illegal discrimination based on race, religion, sexual orientation, disability, or national origin.</li>
              <li>Unauthorized disclosure of confidential, financial, or personally identifiable information of third parties without consent.</li>
              <li>Violations of federal mail regulations or mail fraud statutes (18 U.S.C. § 1341).</li>
            </ul>
            <p className="text-xs text-stone-500">
              We reserve the absolute right to cancel and refuse fulfillment of any order that violates these standards. In cases of unlawful harassment or threats sent via mail, we cooperate fully with law enforcement and the United States Postal Inspection Service (USPIS).
            </p>
          </section>

          {/* Section 4: AI Art Generation */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">4</span>
              AI Artwork Generation
            </h2>
            <p>
              Our custom cover art tool leverages third-party generative artificial intelligence technologies. While we endeavor to produce high-aesthetic botanical, celebratory, and watercolor motifs, you acknowledge that AI generation results may occasionally vary in tone or interpretation.
            </p>
            <p>
              You represent that your custom prompts do not infringe upon any registered trademarks, copyrights, or publicity rights of third parties.
            </p>
          </section>

          {/* Section 5: Pricing, Payments & Refund Policy */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">5</span>
              Pricing, Custom Goods &amp; Refund Policy
            </h2>
            <p>
              All prices are listed in USD. Our $9.00 flat fee covers custom card printing, robotic pen inking, packaging, and domestic postage. Payments are securely processed through Stripe.
            </p>
            <p>
              <strong>Custom Personalized Goods:</strong> Because each card is a custom, on-demand physical item created with your specific words and inked directly onto cotton cardstock, orders enter automated production immediately upon payment confirmation. <strong>All sales are final once printing and penning have commenced.</strong>
            </p>
            <p>
              If your card experiences a material defect attributable to our robotic plotter equipment (e.g., severe ink smear, missing text lines), please reach out within 7 days of estimated arrival at <a href="mailto:support@sendmynotes.com" className="text-amber-700 underline font-medium">support@sendmynotes.com</a> with a photograph, and we will promptly dispatch a replacement at zero charge or issue a store credit.
            </p>
          </section>

          {/* Section 6: Limitation of Liability */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">6</span>
              Limitation of Liability &amp; Disclaimers
            </h2>
            <div className="p-4 bg-stone-100 rounded-2xl text-xs space-y-2 text-stone-700">
              <p className="font-bold uppercase tracking-wider text-stone-900">
                Studio Liability Ceiling:
              </p>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL ASTER &amp; BLANCHE PRESS, SENDMYNOTES.COM, OR ITS OPERATORS, AFFILIATES, OR SUPPLIERS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES (INCLUDING LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES) ARISING FROM OR RELATED TO YOUR USE OF THE SERVICE, POSTAL DELAYS, OR CARRIER FAILURES.
              </p>
              <p>
                UNDER NO CIRCUMSTANCES SHALL OUR TOTAL AGGREGATE LIABILITY ARISING OUT OF OR IN CONNECTION WITH ANY ORDER EXCEED THE TOTAL AMOUNT ACTUALLY PAID BY YOU FOR THAT SPECIFIC ORDER (I.E., $9.00 USD).
              </p>
            </div>
          </section>

          {/* Section 7: Governing Law */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">7</span>
              Governing Law &amp; Jurisdiction
            </h2>
            <p>
              These Terms and any dispute or claim arising out of or in connection with them shall be governed by and construed in accordance with the laws of the State of Illinois, without giving effect to any principles of conflicts of law. You consent to the exclusive jurisdiction of the state and federal courts located in Lake County, Illinois.
            </p>
          </section>

          {/* Section 8: Contact */}
          <section className="pt-4 border-t border-stone-200 text-xs text-stone-500 space-y-1">
            <h3 className="font-bold text-stone-800 uppercase tracking-wider text-[11px]">
              Studio Inquiries &amp; Notice:
            </h3>
            <p>Aster &amp; Blanche Press / sendmynotes.com</p>
            <p>Lake Forest, Illinois, USA</p>
            <p>Email: <a href="mailto:support@sendmynotes.com" className="text-amber-700 underline font-medium">support@sendmynotes.com</a></p>
          </section>

          {/* Cross links to Privacy & Return Policy */}
          <div className="pt-4 border-t border-stone-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-stone-500">
            <span>Also see our operational policies:</span>
            <div className="flex items-center gap-3 font-semibold text-amber-800">
              <Link href="/return-policy" className="underline hover:text-stone-900">
                Refund &amp; Return Policy
              </Link>
              <span>•</span>
              <Link href="/privacy" className="underline hover:text-stone-900">
                Privacy Policy
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

