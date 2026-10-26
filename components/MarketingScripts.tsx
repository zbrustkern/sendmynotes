"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { GOOGLE_TAG_ID, GOOGLE_ADS_ID, GA4_MEASUREMENT_ID } from "@/lib/google-ads";
import { META_PIXEL_ID } from "@/lib/meta-ads";

/** Marketing tags are omitted on private capability URLs containing bearer credentials. */
export function MarketingScripts() {
  const pathname = usePathname();
  if (pathname?.startsWith("/comp-payment/") || process.env.NEXT_PUBLIC_STAGING_REVIEW_ONLY === "true") return null;
  return <>
    <Script async src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_TAG_ID || GOOGLE_ADS_ID}`} strategy="afterInteractive" />
    <Script id="smn-google-tag-init" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      ${GOOGLE_TAG_ID ? `gtag('config', '${GOOGLE_TAG_ID}');` : ""}
      gtag('config', '${GOOGLE_ADS_ID}');
      ${GA4_MEASUREMENT_ID ? `gtag('config', '${GA4_MEASUREMENT_ID}', { send_page_view: true });` : ""}
    ` }} />
    <Script id="smn-meta-pixel" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
      n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
      (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
      fbq('init','${META_PIXEL_ID}');fbq('track','PageView');
    ` }} />
  </>;
}
