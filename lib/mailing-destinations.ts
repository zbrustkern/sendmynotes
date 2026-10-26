import { MailingAddress } from "./types";
import { resolvePaymentMode } from "./payment-mode";
import { ORDER_PRICE_VERSION } from "./order-pricing";
import catalog from "./handwrytten-country-catalog.json";

/** Snapshot generated from Handwrytten GET /v2/countries/list and USPS service alerts. */
export const MAILING_DESTINATIONS_VERSION = catalog.checkedAt;
type CatalogRegion = { code: string; name: string };
type CatalogCountry = {
  countryCode: string;
  countryName: string;
  supplierCountryId: number;
  aliases: string[];
  regionRequired: boolean;
  postalCodeRequired: boolean;
  regions: CatalogRegion[];
  suspended: boolean;
};
const COUNTRIES = catalog.countries as CatalogCountry[];

export const VERIFIED_SUPPLIER_COUNTRY_IDS: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(COUNTRIES.map((country) => [country.countryCode, country.supplierCountryId]))
);
export const VERIFIED_SUPPLIER_COUNTRY_NAMES: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(COUNTRIES.map((country) => [country.countryCode, country.countryName]))
);

export function getSupplierCountry(country: unknown): (CatalogCountry & { countryCode: string; supplierCountryId: number; supplierCountryName: string }) | null {
  const countryCode = normalizeCountryCode(country);
  if (!countryCode) return null;
  const match = COUNTRIES.find((item) => item.countryCode === countryCode);
  if (!match) return null;
  return { ...match, supplierCountryName: match.countryName };
}

export function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toUpperCase();
  if (!v) return null;
  const aliasMatch = COUNTRIES.find((country) => country.aliases.some((alias) => alias.trim().toUpperCase() === v));
  if (aliasMatch) return aliasMatch.countryCode;
  const nameMatch = COUNTRIES.find((country) => country.countryName.trim().toUpperCase() === v);
  if (nameMatch) return nameMatch.countryCode;
  return /^[A-Z]{2}$/.test(v) ? v : null;
}

function isStagingContext(env: Record<string, string | undefined>): boolean {
  return env.NODE_ENV !== "production" || env.IS_PREVIEW_TEST_ENVIRONMENT === "true" ||
    env.ALLOW_STRIPE_TEST_IN_PRODUCTION === "true" || env.FIREBASE_PROJECT_ID === "sendmynotes-staging" ||
    env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === "sendmynotes-staging" ||
    Boolean(env.K_SERVICE?.includes("staging")) || Boolean(env.FIREBASE_CONFIG?.includes("sendmynotes-staging"));
}

export function isStagingInternationalPreview(env: Record<string, string | undefined> = process.env): boolean {
  const staging = env.INTERNATIONAL_MAILING_PREVIEW === "true" && env.STAGING_REVIEW_ONLY === "true" && isStagingContext(env);
  const localFake = env.INTERNATIONAL_MAILING_FAKE_ADAPTERS === "true" && env.ALLOW_LOCAL_MOCK_PAYMENTS === "true" && env.NODE_ENV !== "production";
  return staging || localFake;
}

export function isStagingInternationalCheckoutEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (!isStagingInternationalPreview(env)) return false;
  try {
    const mode = resolvePaymentMode(env);
    if (env.INTERNATIONAL_MAILING_FAKE_ADAPTERS === "true") return env.NODE_ENV !== "production" && mode === "local_mock";
    return mode === "stripe_test";
  } catch { return false; }
}

export function authorizeInternationalCheckout(input: { countryCode: string; addressDeferred: boolean; env?: Record<string, string | undefined>; paymentMode?: string }): { allowed: boolean; reason?: string } {
  const env = input.env || process.env;
  if (input.countryCode === "US") return { allowed: true };
  const destination = getSupplierCountry(input.countryCode);
  if (!destination || destination.suspended) return { allowed: false, reason: "This destination is not currently available for mailing." };
  if (input.addressDeferred) return { allowed: false, reason: "International mailing requires a complete recipient address." };
  if (!isStagingInternationalPreview(env)) return { allowed: false, reason: "International checkout is disabled." };
  if (env.INTERNATIONAL_MAILING_FAKE_ADAPTERS === "true") {
    return env.NODE_ENV !== "production" && env.ALLOW_LOCAL_MOCK_PAYMENTS === "true" && input.paymentMode === "local_mock"
      ? { allowed: true } : { allowed: false, reason: "The explicit local fake-adapter mode is required." };
  }
  return input.paymentMode === "stripe_test" ? { allowed: true } : { allowed: false, reason: "Staging review requires Stripe test mode." };
}

export function isInternationalFeatureEnabled(): boolean {
  return isStagingInternationalPreview();
}

export function getEnabledDestination(country: unknown) {
  const countryCode = normalizeCountryCode(country);
  if (!countryCode || countryCode === "US" || !isInternationalFeatureEnabled()) return null;
  const destination = getSupplierCountry(countryCode);
  if (!destination || destination.suspended) return null;
  return { countryCode, supplierCountryId: destination.supplierCountryId, supplierCountryName: destination.countryName };
}

export function validateMailingAddress(address: Partial<MailingAddress> | null | undefined): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!address) return { valid: false, errors: ["Recipient address is required."] };
  const country = normalizeCountryCode(address.country);
  if (!country) errors.push("A supported country is required.");
  else {
    const destination = getSupplierCountry(country);
    if (!destination || (country !== "US" && destination.suspended)) errors.push("This destination is not currently available for mailing.");
    if (!String(address.street1 || "").trim()) errors.push("Street address is required.");
    if (!String(address.city || "").trim()) errors.push("City is required.");
    if (destination?.regionRequired && !String(address.state || "").trim()) errors.push("Region is required.");
    if (destination?.postalCodeRequired && !String(address.zip || "").trim()) errors.push("Postal code is required.");
    if (destination?.regions?.length && address.state) {
      const region = String(address.state).trim().toUpperCase();
      if (!destination.regions.some((item) => item.code.toUpperCase() === region || item.name.toUpperCase() === region)) {
        errors.push("Select a valid region for this destination.");
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function mailingOptionsResponse(env: Record<string, string | undefined> = process.env) {
  const previewAvailable = isStagingInternationalPreview(env);
  const enabled = isStagingInternationalCheckoutEnabled(env);
  return {
    previewAvailable,
    enabled,
    previewOnly: previewAvailable && !enabled,
    destinations: COUNTRIES.filter((country) => country.countryCode !== "US" && !country.suspended).map((country) => ({
      countryCode: country.countryCode,
      countryName: country.countryName,
      available: previewAvailable,
      regionRequired: country.regionRequired,
      postalCodeRequired: country.postalCodeRequired,
      regions: country.regions,
    })),
    pricing: { basePriceCents: 900, discountCents: 0, internationalSurchargeCents: 500, currency: "USD" as const },
    quoteVersion: ORDER_PRICE_VERSION,
    destinationCatalogVersion: MAILING_DESTINATIONS_VERSION,
  };
}
