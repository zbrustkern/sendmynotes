import type { Metadata } from "next";

export const THANK_YOU_PAGE_TITLE = "Thank-you cards | SendMyNotes";
export const THANK_YOU_PAGE_DESCRIPTION =
  "Send real pen-and-ink handwritten thank-you cards—written for you and mailed via USPS, whether you are thanking one person or your whole wedding list.";

export const WEDDING_PAGE_TITLE =
  "Wedding Thank-You Notes Written in Real Pen & Ink | SendMyNotes";
export const WEDDING_PAGE_DESCRIPTION =
  "Upload your wedding photo, import your guest and gift list, and personalize every note. Written in real pen & ink on folded cardstock, stamped, and mailed for you.";

export function resolveThankYouRobots(): Metadata["robots"] {
  const staging = process.env.STAGING_REVIEW_ONLY === "true";
  return staging
    ? { index: false, follow: false }
    : { index: true, follow: true };
}

export function getThankYouLayoutMetadata(): Metadata {
  return {
    title: { absolute: THANK_YOU_PAGE_TITLE },
    robots: resolveThankYouRobots(),
  };
}

export function getThankYouPageMetadata(): Metadata {
  return {
    title: { absolute: THANK_YOU_PAGE_TITLE },
    description: THANK_YOU_PAGE_DESCRIPTION,
    robots: resolveThankYouRobots(),
    alternates: {
      canonical: "https://sendmynotes.com/thank-you",
    },
  };
}

export function getWeddingPageMetadata(): Metadata {
  return {
    title: { absolute: WEDDING_PAGE_TITLE },
    description: WEDDING_PAGE_DESCRIPTION,
    robots: resolveThankYouRobots(),
    alternates: {
      canonical: "https://sendmynotes.com/thank-you/wedding",
    },
    openGraph: {
      title: WEDDING_PAGE_TITLE,
      description: WEDDING_PAGE_DESCRIPTION,
      type: "website",
      url: "https://sendmynotes.com/thank-you/wedding",
      images: [
        {
          url: "/wedding/hero-handwritten-note.jpg",
          width: 960,
          height: 960,
          alt: "Handwritten thank-you note written in real blue pen and ink on folded white cardstock",
          type: "image/jpeg",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: WEDDING_PAGE_TITLE,
      description: WEDDING_PAGE_DESCRIPTION,
      images: ["/wedding/hero-handwritten-note.jpg"],
    },
  };
}
