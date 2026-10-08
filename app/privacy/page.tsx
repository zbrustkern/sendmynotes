import React from "react";
import Link from "next/link";
import { ArrowLeft, Shield, Lock, Eye, Mail, FileText, CheckCircle2, Server, HelpCircle, Sliders, Database, Cookie } from "lucide-react";

export const metadata = {
  title: "Privacy Policy — sendmynotes.com",
  description: "Privacy policy describing data collection, use, advertising data disclosures, security safeguards, and consumer rights for Aster & Blanche Press and sendmynotes.com.",
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
            Effective Date: October 8, 2026 • Published by <strong>Aster &amp; Blanche Press</strong>, operator of <strong>sendmynotes.com</strong> (Lake Forest, IL).
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
              Aster &amp; Blanche Press operates as an independent commercial venture conducted by its sole proprietor owner, with principal editorial and administrative studio operations based in Lake Forest, Illinois, and specialized physical robotic printing and fulfillment operations dispatched via our production partner Handwrytten, Inc. in Phoenix, Arizona. As our business expands, we reserve the right to organize or assign this service to an affiliated successor entity (such as a Limited Liability Company or Corporation) without diminishing your privacy rights under this policy.
            </p>
            <p>
              By accessing or using sendmynotes.com, you acknowledge the data collection, use, and disclosure practices described in this policy. You may manage optional tracking and advertising preferences as detailed in Section 6.
            </p>
          </section>

          {/* Section 2: Information We Collect */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">2</span>
              Information We Collect
            </h2>
            <p>
              To manufacture and physically deliver custom greeting cards, process payments, and measure website performance, we collect the following categories of information:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-stone-600">
              <li>
                <strong>Purchaser Contact Identifiers:</strong> Your email address and phone number (if provided during checkout or account creation) to deliver transaction receipts, order status updates, and customer support notifications.
              </li>
              <li>
                <strong>Physical Mailing &amp; Delivery Information (Recipient):</strong> The recipient&apos;s full name, street address, secondary unit/suite/apartment number, city, state, and postal code. This information is used strictly to print physical envelope address labels and induct mailings into the USPS mail stream. <em>Recipient addresses and recipient names are never provided to advertising platforms or data brokers.</em>
              </li>
              <li>
                <strong>Return Address Information (Purchaser/Sender):</strong> The sender name, street address, city, state, and postal code provided to appear on the upper-left corner of the envelope. Purchaser city, state, and postal code may also be used in hashed form for conversion matching where permitted by law and your privacy choices.
              </li>
              <li>
                <strong>Custom Card Content &amp; Correspondence:</strong> The custom prompts submitted to our AI artwork generators, chosen cover images, pre-printed sentiments, and personal handwritten messages typed for physical reproduction by robotic plotting pens. <em>Your card correspondence and handwritten text are treated as private personal communications and are never provided to advertising platforms.</em>
              </li>
              <li>
                <strong>Payment &amp; Billing Information:</strong> Payment card details (card number, expiration date, CVV, and billing zip code) are collected and processed directly by our third-party payment gateway, <strong>Stripe, Inc.</strong> We never receive, process, or store full credit card numbers or CVV codes on our application servers.
              </li>
              <li>
                <strong>Technical &amp; Telemetry Data:</strong> Standard internet log information, including your IP address, browser type, operating system, referring URL, device type, timestamp of visits, and sliding-window rate-limiting tokens used to prevent automated abuse.
              </li>
              <li>
                <strong>Advertising, Analytics &amp; Cookie Telemetry:</strong> When you browse our website, we and our service partners (including Meta and Google) utilize browser cookies, web beacons, and local/session storage tokens (such as <code>smn_attribution</code>). These capture advertising click parameters (such as <code>fbclid</code> and <code>gclid</code>), referring marketing campaigns, and site engagement events.
              </li>
              <li>
                <strong>Hashed Customer Identifiers (Customer Matching):</strong> Where permitted by applicable law and your privacy choices, we send Meta certain customer contact details in hashed form to match website activity with information Meta holds, measure advertising results, and support advertising optimization. Hashing transforms these details before transmission using cryptographic SHA-256 algorithms, but does not make them anonymous or prevent Meta from matching them to an individual. The specific contact fields transmitted in hashed form are purchaser email, purchaser first and last name, purchaser phone (if provided), and purchaser city, state, postal code, and country from your return address. We do not include card messages or recipient information in this advertising data.
              </li>
              <li>
                <strong>Optional Account Data:</strong> If you voluntarily sign in via Google OAuth or create an email account, we store your Firebase User ID (UID), display name, email, and any addresses you choose to save to your personal address book.
              </li>
            </ul>

            {/* Cookie & Local Storage Inventory Table */}
            <div className="mt-4 pt-3 border-t border-stone-200">
              <h3 className="font-semibold text-stone-900 text-xs flex items-center gap-1.5 mb-2">
                <Cookie className="w-3.5 h-3.5 text-amber-700" />
                Cookie &amp; Local Storage Inventory
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] text-stone-600 border border-stone-200 rounded-xl overflow-hidden">
                  <thead className="bg-stone-100 text-stone-900 font-semibold text-left">
                    <tr>
                      <th className="p-2 border-b border-stone-200">Identifier</th>
                      <th className="p-2 border-b border-stone-200">Provider</th>
                      <th className="p-2 border-b border-stone-200">Purpose</th>
                      <th className="p-2 border-b border-stone-200">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    <tr>
                      <td className="p-2 font-mono font-medium text-stone-800">_fbp</td>
                      <td className="p-2">Meta Platforms</td>
                      <td className="p-2">Ad measurement and delivery optimization</td>
                      <td className="p-2">Approx. 90 days</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-medium text-stone-800">_fbc</td>
                      <td className="p-2">Meta Platforms</td>
                      <td className="p-2">Ad click attribution from Meta campaigns</td>
                      <td className="p-2">Approx. 90 days</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-medium text-stone-800">_ga / _ga_*</td>
                      <td className="p-2">Google Analytics</td>
                      <td className="p-2">Distinguishes unique users and measures interactions</td>
                      <td className="p-2">Up to 2 years</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-medium text-stone-800">smn_attribution</td>
                      <td className="p-2">sendmynotes.com</td>
                      <td className="p-2">Local/Session storage of referral &amp; campaign parameters</td>
                      <td className="p-2">Session / until cleared</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-medium text-stone-800">__stripe_mid / sid</td>
                      <td className="p-2">Stripe, Inc.</td>
                      <td className="p-2">Fraud prevention and payment authorization (Essential)</td>
                      <td className="p-2">1 year / 30 mins</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Section 3: How We Use Your Information */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">3</span>
              How We Use Your Information
            </h2>
            <p>We use the information we collect for legitimate commercial, operational, and marketing purposes:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-stone-600">
              <li><strong>Physical Manufacturing &amp; Fulfillment:</strong> Printing card artwork on 120 lb archival cardstock, controlling robotic ballpoint plotting machines to write your message in real ink, stuffing envelopes, applying postage stamps, and mailing via USPS First Class.</li>
              <li><strong>Payment Processing:</strong> Facilitating secure credit/debit card transactions and fraud prevention through Stripe.</li>
              <li><strong>Customer Communications:</strong> Sending transactional order receipts, production milestones, shipment notices, and responding to feedback inquiries.</li>
              <li><strong>Address Book Management:</strong> Allowing registered users to retrieve previously saved recipient and return addresses for faster repeat checkout.</li>
              <li><strong>System Reliability &amp; Abuse Prevention:</strong> Enforcing fair-use limits on our AI image generators, preventing fraudulent card testing, and investigating software anomalies.</li>
              <li><strong>Marketing &amp; Advertising Optimization:</strong> Evaluating advertising effectiveness, calculating conversion rates, attributing orders from online campaigns, and optimizing marketing delivery.</li>
            </ul>

            {/* Nuanced Advertising Sharing & Correspondence Protection Callout */}
            <div className="p-4 bg-amber-50/80 rounded-2xl border border-amber-200/80 text-xs text-amber-950 space-y-2">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-800 shrink-0" />
                <span className="font-bold text-amber-900">Advertising Data Sharing and Correspondence Protection:</span>
              </div>
              <p className="text-amber-900/90 leading-relaxed">
                We disclose certain website activity, online identifiers, and hashed customer identifiers to advertising partners for measurement and advertising purposes. These disclosures may constitute a sale or sharing of personal information under applicable privacy laws (such as the California Consumer Privacy Act / CPRA). You can manage these disclosures through our Privacy Choices mechanisms described in Section 6.
              </p>
              <p className="text-amber-900/90 leading-relaxed font-semibold">
                We do not provide your card messages, custom greetings, or recipient information to advertising platforms or data brokers. We process this information, and disclose it to necessary service providers, solely to create, print, pen, package, and deliver cards and operate the service as described in this Privacy Policy.
              </p>
            </div>
          </section>

          {/* Section 4: Parties to Whom Information is Disclosed */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">4</span>
              Parties to Whom Information is Disclosed &amp; Methods of Disclosure
            </h2>
            <p>
              To operate the Service, physically mail greeting cards, and measure website performance, we disclose specific customer data to trusted service providers through encrypted programmatic interfaces (APIs) or physical delivery channels:
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
                  Card cover artwork, interior messages, recipient addresses, and return addresses are securely transmitted via encrypted API to our fulfillment partner, Handwrytten, Inc. (Phoenix, AZ), solely to operate physical robotic plotting pens and package envelopes for postal dispatch.
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
                <span className="font-bold text-stone-900 block">5. Advertising &amp; Conversion Measurement (Meta Platforms, Inc.)</span>
                <p className="text-stone-600">
                  We utilize the Meta Pixel and Meta Conversions API (CAPI), provided by Meta Platforms, Inc. (Menlo Park, CA), to measure advertising results and support advertising optimization. Meta collects or receives information from our website via browser cookies, web beacons, and direct server-to-server APIs (including hashed purchaser contact identifiers, online identifiers, and order total metadata). Meta processes this information in accordance with its Privacy Policy (<a href="https://www.facebook.com/privacy/policy" target="_blank" rel="noopener noreferrer" className="underline text-amber-800">facebook.com/privacy/policy</a>). Card correspondence, handwritten messages, and recipient street addresses are strictly excluded from advertising payloads.
                </p>
              </div>

              <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 text-xs space-y-1">
                <span className="font-bold text-stone-900 block">6. Web Analytics &amp; Site Performance (Google LLC)</span>
                <p className="text-stone-600">
                  We use Google Analytics 4 to understand how visitors use our website. Depending on your privacy choices and our configuration, Google receives information about website interactions, pages visited, device and browser characteristics, and online identifiers. We use reports derived from this information to evaluate site usage and improve our service. Learn more about Google&apos;s practices at <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer" className="underline text-amber-800">policies.google.com/technologies/partner-sites</a>.
                </p>
              </div>

              <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 text-xs space-y-1">
                <span className="font-bold text-stone-900 block">7. Legal &amp; Compliance Disclosures</span>
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

          {/* Section 6: Data Retention & User Choices */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono flex items-center justify-center font-bold">6</span>
              Data Retention &amp; Your Choices
            </h2>
            <p>
              We retain customer order records, transaction receipts, and correspondence content for as long as necessary to complete physical fulfillment, provide customer support, comply with legal, tax, and accounting obligations (typically up to 7 years for financial records), and resolve disputes. Session attribution records and temporary marketing cache tokens are retained for up to 90 days or until cleared.
            </p>
            <p>
              Depending on your jurisdiction (including under the California Consumer Privacy Act / CPRA and other applicable state laws), you may have the following rights regarding your personal data:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-stone-600">
              <li>The right to know what personal information we collect, use, disclose, and sell or share.</li>
              <li>The right to request access to and a copy of the personal data we hold about you.</li>
              <li>The right to request correction or updating of inaccurate account information.</li>
              <li>The right to request deletion of your account and personal data, subject to legal recordkeeping exceptions.</li>
              <li>The right to opt out of the &ldquo;sale&rdquo; or &ldquo;sharing&rdquo; of your personal information for cross-context behavioral advertising.</li>
              <li>The right not to receive discriminatory treatment for exercising your privacy rights.</li>
            </ul>

            {/* Granular Tracking and Opt-Out Controls */}
            <div className="mt-4 p-4 bg-stone-50 rounded-2xl border border-stone-200 text-xs space-y-2 text-stone-700">
              <p className="font-bold text-stone-900 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-amber-700" />
                Managing Tracking &amp; Advertising Choices:
              </p>
              <ul className="list-disc pl-4 space-y-1.5 text-stone-600">
                <li>
                  <strong>Global Privacy Control (GPC):</strong> We recognize and respect the Global Privacy Control signal. If your browser broadcasts a recognized GPC signal, our client application signals Meta Limited Data Use (LDU) and marks your session to restrict advertising conversion sharing.
                </li>
                <li>
                  <strong>Do Not Track (DNT):</strong> Some browsers transmit &ldquo;Do Not Track&rdquo; signals. Because no universal standard exists across the industry for interpreting legacy DNT signals, our site prioritizes legally recognized standards like Global Privacy Control.
                </li>
                <li>
                  <strong>Opt-Out of Advertising Data Sharing:</strong> To opt out of advertising data disclosures or exercise your state privacy rights, email us at <a href="mailto:support@sendmynotes.com?subject=Privacy%20Choices%20/%20Opt-Out%20Request" className="text-amber-800 underline font-medium">support@sendmynotes.com</a> with the subject line <em>&ldquo;Privacy Choices / Opt-Out Request&rdquo;</em>. We will process your verified request promptly and without charge.
                </li>
                <li>
                  <strong>Digital Advertising Alliance (DAA):</strong> You can opt out of interest-based advertising across participating ad networks via the DAA WebChoices portal at <a href="https://optout.aboutads.info" target="_blank" rel="noopener noreferrer" className="underline text-amber-800">optout.aboutads.info</a>.
                </li>
                <li>
                  <strong>Network Advertising Initiative (NAI):</strong> You can manage participating ad networks at <a href="https://optout.networkadvertising.org" target="_blank" rel="noopener noreferrer" className="underline text-amber-800">optout.networkadvertising.org</a>.
                </li>
                <li>
                  <strong>Meta Ad Settings:</strong> You can manage how Meta uses data to show you ads in your <a href="https://www.facebook.com/adpreferences" target="_blank" rel="noopener noreferrer" className="underline text-amber-800">Meta Ad Preferences</a>.
                </li>
                <li>
                  <strong>Google Analytics Opt-Out:</strong> You can install the <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer" className="underline text-amber-800">Google Analytics Opt-Out Browser Add-on</a> to disable GA4 measurement.
                </li>
                <li>
                  <strong>Browser Cookie Controls:</strong> You can configure your browser to reject cookies. Disabling cookies stops client-side cookie storage in your browser, but does not by itself update server-side records; to opt out of server-side advertising matching, please submit an opt-out request or broadcast a GPC signal.
                </li>
              </ul>
            </div>
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
              <li>Any security breach, data compromise, or interruption occurring on the networks of third-party vendors (including Stripe, Handwrytten, Google Cloud, Meta, or USPS).</li>
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
              We may revise this Privacy Policy periodically to reflect changes in our operational procedures, fulfillment practices, or statutory requirements. When updates are published, the &ldquo;Effective Date&rdquo; at the top of this page will be revised. Previous versions of this policy are archived and available upon written request. We encourage you to review this policy periodically.
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
