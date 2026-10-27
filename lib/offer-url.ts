/** Browser-safe offer URL aliases; no pricing or persistence authority. */
const LEGACY_OFFER_URL_PARAMS = ["discount", "code", "promo"] as const;

export function extractOfferCodeFromUrlParams(
  input?: URLSearchParams | Record<string, string | string[] | undefined> | string | null
): string | null {
  if (!input) return null;

  let params: URLSearchParams;
  if (input instanceof URLSearchParams) {
    params = input;
  } else if (typeof input === "string") {
    try {
      if (input.includes("?")) {
        params = new URL(input, "https://sendmynotes.com").searchParams;
      } else if (input.includes("=")) {
        params = new URLSearchParams(input);
      } else {
        // Plain string code passed directly
        const clean = input.trim().toUpperCase();
        return clean.length >= 2 ? clean : null;
      }
    } catch {
      params = new URLSearchParams(input);
    }
  } else if (typeof input === "object") {
    // Plain object like Next.js page searchParams
    for (const key of LEGACY_OFFER_URL_PARAMS) {
      const val = input[key];
      if (typeof val === "string" && val.trim().length > 0) {
        return val.trim().toUpperCase();
      } else if (Array.isArray(val) && val.length > 0 && typeof val[0] === "string" && val[0].trim().length > 0) {
        return val[0].trim().toUpperCase();
      }
    }
    return null;
  } else {
    return null;
  }

  for (const key of LEGACY_OFFER_URL_PARAMS) {
    const val = params.get(key);
    if (val && val.trim().length > 0) {
      return val.trim().toUpperCase();
    }
  }

  return null;
}
