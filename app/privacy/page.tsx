import React from "react";
import Link from "next/link";
import { ArrowLeft, Shield, Lock, Eye, Mail, FileText, CheckCircle2, Server, HelpCircle } from "lucide-react";

export const metadata = {
  title: "Privacy Policy — sendmynotes.com",
  description: "Privacy policy describing data collection, use, third-party disclosure, security safeguards, and consumer rights for Aster & Blanche Press and sendmynotes.com.",
};

export default function PrivacyPolicyPage() {
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
            <Lock className="w-6 h-6" />
          </div>
          <span className="text-[11px] uppercase font-bold tracking-widest text-stone-400 font-mono block mb-2">
            Consumer Privacy &amp; Data Safeguards
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-stone-900 mb-3">
            Privacy Policy
          </h1>
          <p className="text-xs text-stone-500 max-w-lg mx-auto leading-relaxed">
            Effective Date: September 24, 2026 • Published by <strong>Aster &amp; Blanche Press</strong>, operator of <strong>sendmynotes.com</strong> (Lake Forest, IL).
          </p>
        </div>

        {/* Policy Body */}
        <div className="space-y-8 text-sm leading-relaxed text-stone-700 bg-white p-6 sm:p-10 rounded-3xl border border-stone-200/80 shadow-xs">
          {/* Section 1: Introduction & Operational Structure */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">1</span>
              Operating Identity &amp; Scope
            </h2>
            <p>
              This Privacy Policy explains how <strong>Aster &amp; Blanche Press</strong>, operating the website located at <strong>sendmynotes.com</strong> (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;, or the &ldquo;Service&rdquo;), collects, uses, processes, discloses, and safeguards personal information when you visit our website, design greeting cards, utilize our artificial intelligence generation tools, or order physical robotic pen handwritten mailings.
            </p>
            <p>
              Aster &amp; Blanche Press currently operates as an independent commercial venture conducted by its sole proprietor owner, with principal studio mailing operations based in Lake Forest, Illinois. As our business expands, we reserve the right to organize or assign this service to an affiliated successor entity (such as a Limited Liability Company or Corporation) without diminishing your privacy rights under this policy.
            </p>
            <p>
              By accessing or using sendmynotes.com, you consent to the data collection and processing practices described herein.
            </p>
          </section>

          {/* Section 2: Information We Collect */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">2</span>
              Information We Collect
            </h2>
            <p>
              To manufacture and physically deliver custom greeting cards, we collect only the information necessary to fulfill your orders and process secure payments:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-stone-600">
              <li>
                <strong>Customer Contact Identifiers:</strong> Your email address (collected during checkout or account creation) to deliver your transaction receipt, payment confirmation, and real-time USPS tracking notifications.
              </li>
              <li>
                <strong>Physical Mailing &amp; Delivery Information:</strong> The recipient&apos;s full name, street address, secondary unit/suite/apartment number, city, state, and postal code, used to print address labels and induct the physical envelope into the USPS mail stream.
              </li>
              <li>
                <strong>Return Address Information:</strong> The sender name, street address, city, state, and postal code provided to appear on the upper-left corner of the physical envelope for postal delivery compliance.
              </li>
              <li>
                <strong>Custom Card Content &amp; Correspondence:</strong> The custom prompts you submit to our AI artwork generators, chosen cover images, pre-printed greeting sentiments, and personal handwritten messages typed for physical reproduction by robotic plotting pens.
              </li>
              <li>
                <strong>Payment &amp; Billing Information:</strong> Payment card details (card number, expiration date, CVV/CVC, and billing zip code) are collected and processed directly by our third-party payment gateway, <strong>Stripe, Inc.</strong> We never receive, process, or store full credit card numbers or CVV codes on our servers.
              </li>
              <li>
                <strong>Technical &amp; Telemetry Data:</strong> Standard internet log information, including your IP address, browser type, operating system, referring URL, device type, timestamp of visits, and sliding-window rate-limiting tokens used to prevent automated abuse and bot denial-of-service attacks.
              </li>
              <li>
                <strong>Optional Account Data:</strong> If you voluntarily sign in via Google OAuth or create an email account, we store your Firebase User ID (UID), display name, email, and any addresses you choose to save to your personal address book.
              </li>
            </ul>
          </section>

          {/* Section 3: How We Use Your Information */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">3</span>
              How We Use Your Information
            </h2>
            <p>We use the information we collect strictly for legitimate commercial and operational purposes:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-stone-600">
              <li><strong>Physical Manufacturing &amp; Fulfillment:</strong> Printing card artwork on 120 lb archival cardstock, controlling robotic ballpoint plotting machines to write your message in real ink, stuffing envelopes, applying postage stamps, and mailing via USPS First Class.</li>
              <li><strong>Payment Processing:</strong> Facilitating secure credit/debit card transactions and fraud prevention through Stripe.</li>
              <li><strong>Customer Communications:</strong> Sending transactional order receipts, production milestones, shipment notices, and responding to feedback inquiries.</li>
              <li><strong>Address Book Management:</strong> Allowing registered users to retrieve previously saved recipient and return addresses for faster repeat checkout.</li>
              <li><strong>System Reliability &amp; Abuse Prevention:</strong> Enforcing fair-use limits on our AI image generators, preventing fraudulent card testing, and investigating software anomalies.</li>
            </ul>
            <div className="p-4 bg-emerald-50/80 rounded-2xl border border-emerald-200/70 text-xs text-emerald-950 font-medium flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                <strong>We Do Not Sell Your Data:</strong> We have never sold, monetized, bartered, or leased personal information or card correspondence to data brokers, marketing lists, or third-party advertisers.
              </span>
            </div>
          </section>

          {/* Section 4: Parties to Whom Information is Disclosed */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">4</span>
              Parties to Whom Information is Disclosed &amp; Methods of Disclosure
            </h2>
            <p>
              To operate the Service and physically mail greeting cards across the United States, we disclose specific customer data to trusted service providers through encrypted, automated programmatic interfaces (APIs) or physical delivery channels:
            </p>
            <div className="space-y-3">
              <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 text-xs space-y-1">
                <span className="font-bold text-stone-900 block">1. Payment Processing (Stripe, Inc.)</span>
                <p className="text-stone-600">
                  Billing information and transaction metadata are securely transmitted via TLS-encrypted API calls to Stripe, Inc. Stripe acts as an independent data controller for payment processing in accordance with the Stripe Privacy Policy (<a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="underline text-amber-800">stripe.com/privacy</a>).
                </p>
              </div>

              <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 text-xs space-y-1">
                <span className="font-bold text-stone-900 block">2. Robotic Pen Fulfillment (Handwrytten, Inc.)</span>
                <p className="text-stone-600">
                  Card cover artwork, interior messages, recipient addresses, and return addresses are securely transmitted via encrypted API to our fulfillment partner, Handwrytten, Inc. (Phoenix, AZ), solely to operate physical robotic plotting pens and package envelopes for dispatch.
                </p>
              </div>

              <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 text-xs space-y-1">
                <span className="font-bold text-stone-900 block">3. Postal Carrier Services (United States Postal Service - USPS)</span>
                <p className="text-stone-600">
                  Recipient names, physical street addresses, and return addresses are printed visibly on the exterior of stamped envelopes and transferred into the custody of the USPS for domestic transportation and mailbox delivery.
                </p>
              </div>

              <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 text-xs space-y-1">
                <span className="font-bold text-stone-900 block">4. Cloud Infrastructure &amp; Databases (Google Cloud / Firebase)</span>
                <p className="text-stone-600">
                  Order records, image caches, and user accounts are hosted in secure, access-restricted databases operated by Google Cloud Platform and Firebase in United States data centers.
                </p>
              </div>

              <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 text-xs space-y-1">
                <span className="font-bold text-stone-900 block">5. Legal &amp; Compliance Disclosures</span>
                <p className="text-stone-600">
                  We may disclose information if required to do so by applicable federal or state law, valid subpoena, court order, or governmental regulation, or when necessary to protect the rights, property, or physical safety of our users, studio personnel, or the public.
                </p>
              </div>
            </div>
          </section>

          {/* Section 5: Security Practices */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">5</span>
              Security Practices &amp; Safeguards
            </h2>
            <p>
              We implement industry-standard administrative, physical, and technical safeguards designed to protect personal information against unauthorized access, loss, alteration, or misuse:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-stone-600">
              <li><strong>Encryption in Transit:</strong> All communication between your browser and our servers is secured using modern Transport Layer Security (TLS 1.3 / HTTPS) with strict certificate validation.</li>
              <li><strong>PCI-DSS Compliance:</strong> All credit card transactions are handled through Stripe Elements using client-side tokenization. Raw cardholder data never touches our application servers or database storage.</li>
              <li><strong>Automated Redaction:</strong> Our server diagnostic routines and error logging engines automatically sanitize and redact API tokens, machine keys, and private credentials before any system incident records are generated.</li>
              <li><strong>Access Controls:</strong> Access to backend order repositories and database consoles is strictly restricted using multi-factor authentication and role-based permissions.</li>
            </ul>
            <p className="text-xs text-stone-500 italic">
              While we use commercially reasonable measures to protect your data, no method of transmission over the Internet or electronic storage is 100% secure. Consequently, we cannot guarantee absolute security.
            </p>
          </section>

          {/* Section 6: Data Retention & User Rights */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">6</span>
              Data Retention &amp; Your Choices
            </h2>
            <p>
              We retain customer order records, transaction receipts, and correspondence content for as long as necessary to complete physical fulfillment, provide customer support, comply with legal and accounting obligations, and resolve disputes.
            </p>
            <p>
              Depending on your jurisdiction, you may have the following rights regarding your personal data:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-stone-600">
              <li>The right to request access to the personal data we hold about you.</li>
              <li>The right to request correction or updating of inaccurate account information.</li>
              <li>The right to request deletion of your account and saved address book records.</li>
            </ul>
            <p className="text-xs text-stone-600">
              To exercise any of these rights, please email us at <a href="mailto:support@sendmynotes.com" className="text-amber-800 underline font-medium">support@sendmynotes.com</a>. We will process your verified request within 30 days.
            </p>
          </section>

          {/* Section 7: Sole Proprietorship & Limitation of Liability */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">7</span>
              Sole Proprietor Status, Business Transfers &amp; Liability
            </h2>
            <p>
              Aster &amp; Blanche Press operates as a sole proprietorship. To the fullest extent permitted by applicable law, neither the individual sole proprietor, nor Aster &amp; Blanche Press, shall be liable for indirect, incidental, special, punitive, or consequential damages arising from:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-stone-600">
              <li>Any security breach, data compromise, or interruption occurring on the networks of third-party vendors (including Stripe, Handwrytten, Google Cloud, or USPS).</li>
              <li>Postal carrier delays, lost mail, delivery errors, or mailbox thefts occurring once envelopes are in the custody of the United States Postal Service.</li>
              <li>User-submitted content, unauthorized account access resulting from compromised user credentials, or customer-provided inaccurate recipient addresses.</li>
            </ul>
            <p className="text-xs text-stone-600">
              In the event that Aster &amp; Blanche Press reorganizes into an LLC, corporation, or merges with another business entity, customer records and rights under this policy may be transferred to the successor operating entity.
            </p>
          </section>

          {/* Section 8: Children's Privacy */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">8</span>
              Children&apos;s Online Privacy Protection (COPPA)
            </h2>
            <p className="text-xs text-stone-600">
              Our Service is directed to general consumer audiences capable of entering into binding payment contracts. We do not knowingly solicit or collect personal information from children under the age of 13. If you believe a child under 13 has provided personal data to us without parental consent, please contact us immediately so we can remove the information.
            </p>
          </section>

          {/* Section 9: Updates to this Policy */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">9</span>
              Changes to this Privacy Policy
            </h2>
            <p className="text-xs text-stone-600">
              We may revise this Privacy Policy periodically to reflect changes in our operational procedures, fulfillment practices, or statutory requirements. When updates are published, the &ldquo;Effective Date&rdquo; at the top of this page will be revised. We encourage you to review this policy periodically.
            </p>
          </section>

          {/* Section 10: Contact Us */}
          <section className="space-y-3 pt-4 border-t border-stone-200">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">10</span>
              Contact Information
            </h2>
            <p className="text-xs text-stone-600">
              If you have questions, feedback, or requests concerning this Privacy Policy or your personal information, please contact our studio team:
            </p>
            <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 text-xs space-y-1 text-stone-700 font-mono">
              <p><strong>Aster &amp; Blanche Press</strong></p>
              <p>Attn: Privacy &amp; Consumer Compliance</p>
              <p>Lake Forest, IL 60045</p>
              <p>Email: <a href="mailto:support@sendmynotes.com" className="text-amber-800 underline">support@sendmynotes.com</a></p>
              <p>Website: <a href="https://sendmynotes.com" className="text-amber-800 underline">https://sendmynotes.com</a></p>
            </div>
          </section>

          {/* Cross link to Terms */}
          <div className="pt-4 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
            <span>Also see our legal terms:</span>
            <Link href="/terms" className="text-amber-800 font-semibold underline hover:text-stone-900">
              Terms of Service &amp; Conditions →
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
