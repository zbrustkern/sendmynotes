import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { WeddingLink } from "@/components/wedding/WeddingLink";
import { getThankYouPageMetadata } from "@/lib/wedding/metadata";

export function generateMetadata(): Metadata {
  return getThankYouPageMetadata();
}

export default function ThankYouPage() {
  return (
    <main className="wed">
      <header className="wed-top">
        <Link href="/">SendMyNotes</Link>
        <span>Thank-you notes</span>
      </header>
      <section className="wed-landing">
        <div>
          <h1>Who are you thanking?</h1>
          <p>
            Make a handwritten card with your own words, whether you’re thanking
            one person or everyone on your wedding list.
          </p>
          <div className="wed-actions">
            <Suspense>
              <WeddingLink href="/thank-you/wedding" className="wed-primary">
                Wedding thank-you notes
              </WeddingLink>
            </Suspense>
            <Link href="/send/thank-you" className="wed-link">
              Send one thank-you card
            </Link>
          </div>
        </div>
        <img
          className="wed-hero-card"
          src="/presets/thank-you-botanical.jpg"
          alt="Botanical thank-you card front"
        />
      </section>
    </main>
  );
}
