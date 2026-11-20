import { GA4_MEASUREMENT_ID, GOOGLE_ADS_ID, GOOGLE_TAG_ID, hasGoogleAdsCheckoutProof, purchaseConsentAllowed } from "@/lib/google-ads";
import { META_PIXEL_ID } from "@/lib/meta-ads";

type Tag = (...args: unknown[]) => void;
type Pixel = Tag & { queue: unknown[][]; callMethod?: Tag; push?: Tag; loaded?: boolean; version?: string };
type TagWindow = Window & { dataLayer?: unknown[]; gtag?: Tag; fbq?: Pixel; _fbq?: Pixel };

function loadScript(src: string) {
  const script = document.createElement("script");
  script.src = src;
  script.async = true;
  script.referrerPolicy = "no-referrer";
  document.head.appendChild(script);
}

/** Private tracking pages omit marketing scripts. Initialize only on a clean URL
 * after a verified, eligible active checkout. Neither tag sends a page view here. */
export function prepareCheckoutPurchaseTags(orderId: string, consent?: { gpc?: boolean; optOut?: boolean }): boolean {
  if (!hasGoogleAdsCheckoutProof(orderId) || !purchaseConsentAllowed(consent) ||
      process.env.NEXT_PUBLIC_STAGING_REVIEW_ONLY === "true" || window.location.search || window.location.hash) return false;
  const win = window as TagWindow;
  if (!win.gtag) {
    win.dataLayer ??= [];
    win.gtag = function () { win.dataLayer!.push(arguments); };
    win.gtag("js", new Date());
    for (const id of [GOOGLE_TAG_ID, GOOGLE_ADS_ID, GA4_MEASUREMENT_ID]) {
      if (id) win.gtag("config", id, { send_page_view: false });
    }
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GOOGLE_TAG_ID || GOOGLE_ADS_ID)}`);
  }
  if (!win.fbq) {
    const pixel = ((...args: unknown[]) => {
      if (pixel.callMethod) pixel.callMethod(...args);
      else pixel.queue.push(args);
    }) as Pixel;
    pixel.queue = [];
    pixel.push = pixel;
    pixel.loaded = true;
    pixel.version = "2.0";
    win.fbq = win._fbq = pixel;
    pixel("init", META_PIXEL_ID);
    loadScript("https://connect.facebook.net/en_US/fbevents.js");
  }
  return true;
}
