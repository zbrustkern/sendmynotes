import {
  type AttributionClassification,
  type AttributionChannel,
  type AttributionClassifierInput,
  type AttributionGroup,
  type AttributionGroupFilter,
  type LegacyAttributionEvidence,
} from "./attribution-contract";

const MAX_LABEL_LENGTH = 120;
const cleanLabel = (value?: string | null): string | undefined => {
  if (typeof value !== "string") return undefined;
  const label = value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, MAX_LABEL_LENGTH);
  if (!label || /^https?:\/\//i.test(label) || /(?:gclid|fbclid|msclkid|wbraid|gbraid)=/i.test(label)) return undefined;
  return label;
};

const normalized = (value?: string | null) => cleanLabel(value)?.toLowerCase();
const groupFor = (channel: AttributionChannel): AttributionGroup => {
  if (channel.startsWith("paid_")) return "paid";
  if (channel === "organic_search") return "organic_search";
  if (channel === "social_referral" || channel === "referral") return "social_referral";
  if (channel === "email" || channel === "other_campaign") return "email_other";
  if (channel === "direct_observed") return "direct_observed";
  return "unknown";
};

function hostnameMatches(host: string, domains: readonly string[]): boolean {
  const normalizedHost = host.toLowerCase().replace(/\.$/, "");
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/.test(normalizedHost)) return false;
  return domains.some((domain) => normalizedHost === domain || normalizedHost.endsWith(`.${domain}`));
}

function referrerKind(host?: string | null): "search" | "social" | "referral" | undefined {
  if (!host) return undefined;
  if (["google.com", "bing.com", "yahoo.com", "duckduckgo.com", "baidu.com", "yandex.com"].some((d) => hostnameMatches(host, [d]))) return "search";
  if (["facebook.com", "instagram.com", "t.co", "x.com", "twitter.com", "linkedin.com", "pinterest.com", "reddit.com", "tiktok.com", "youtube.com"].some((d) => hostnameMatches(host, [d]))) return "social";
  return "referral";
}

function make(channel: AttributionChannel, provenance: AttributionClassification["provenance"], reason: AttributionClassification["reason"], input: AttributionClassifierInput = {}): AttributionClassification {
  return {
    channel,
    group: groupFor(channel),
    provenance,
    reason,
    ...(cleanLabel(input.source) ? { source: cleanLabel(input.source) } : {}),
    ...(cleanLabel(input.medium) ? { medium: cleanLabel(input.medium) } : {}),
    ...(cleanLabel(input.campaign) ? { campaign: cleanLabel(input.campaign) } : {}),
  };
}

const unknown = (input: AttributionClassifierInput, reason: "invalid_evidence" | "conflicting_evidence" | "no_entry_observation" = "no_entry_observation", provenance: AttributionClassification["provenance"] = "unknown") => make("unknown", provenance, reason, input);

export function classifyAttributionEvidence(input: AttributionClassifierInput): AttributionClassification {
  if (!input || typeof input !== "object") return unknown({}, "invalid_evidence");
  const labels = [input.source, input.medium, input.campaign, input.content, input.term, input.referrerHost];
  if (labels.some((v) => v !== undefined && v !== null && typeof v !== "string")) return unknown({}, "invalid_evidence");
  if (input.entryObservation === "missing") return unknown(input, "no_entry_observation");
  if (input.entryObservation !== "complete" && input.entryObservation !== "legacy") return unknown(input, "no_entry_observation");
  if (input.entryObservation === "legacy") return adaptLegacyAttribution(input);

  const src = normalized(input.source) ?? "";
  const med = normalized(input.medium) ?? "";
  const googleSource = ["google", "googleads", "google_ads"].includes(src);
  const metaSource = ["facebook", "fb", "instagram", "meta"].includes(src);
  const paidMediums: Record<string, AttributionChannel> = {
    cpc: googleSource ? "paid_search" : "paid_unknown", ppc: googleSource ? "paid_search" : "paid_unknown",
    paid_search: "paid_search", paidsearch: "paid_search", paid_social: "paid_social", paidsocial: "paid_social",
    display: "paid_other", banner: "paid_other", cpv: "paid_other", cpm: "paid_other", paid: "paid_unknown",
  };
  const explicitPaid = paidMediums[med];
  const organic = med === "organic" || med === "seo";
  const email = ["email", "e-mail", "newsletter"].includes(med) || ["email", "newsletter", "mail"].includes(src);
  const socialMedium = ["social", "social-network", "social_media", "social-media"].includes(med);
  const refKind = referrerKind(input.referrerHost);
  const externalRef = Boolean(input.referrerHost);
  const tagsPresent = Boolean(cleanLabel(input.source) || cleanLabel(input.medium) || cleanLabel(input.campaign));

  const incompatible = (explicitPaid && (organic || email || socialMedium)) ||
    (organic && (email || socialMedium)) ||
    (input.hasGoogleClickId && (organic || email || socialMedium)) ||
    (input.hasMetaClickId && (explicitPaid || organic || email));
  if (incompatible) return unknown(input, "conflicting_evidence", "conflict");

  if (explicitPaid) return make(explicitPaid, "utm", "explicit_paid_medium", input);
  if (input.hasGoogleClickId) return make("paid_unknown", "click_id", "google_click_untyped", input);
  if (input.hasMetaClickId) return make("social_referral", "click_id", "meta_click_unverified_paid", input);
  if (organic && googleSource) return make("organic_search", "utm", "organic_campaign", input);
  if (organic) return unknown(input, "conflicting_evidence", "conflict");
  if (email) return make("email", "utm", "email_campaign", input);
  if (socialMedium) return make("social_referral", "utm", "social_referrer", input);
  if (tagsPresent) {
    if (refKind && (med === "referral" || med === "ref")) return make("referral", "utm", "referral_campaign", input);
    return make("other_campaign", "utm", "other_campaign_tags", input);
  }
  if (externalRef) {
    if (refKind === "search") return make("organic_search", "external_referrer", "search_referrer", input);
    if (refKind === "social") return make("social_referral", "external_referrer", "social_referrer", input);
    return make("referral", "external_referrer", "referral_campaign", input);
  }
  return make("direct_observed", "observed_no_referrer", "direct_observed", input);
}

export function adaptLegacyAttribution(evidence: LegacyAttributionEvidence): AttributionClassification {
  const input: AttributionClassifierInput = { source: evidence?.source, medium: evidence?.medium, campaign: evidence?.campaign, entryObservation: "legacy" };
  if (!evidence || typeof evidence !== "object") return unknown({}, "invalid_evidence", "legacy_adapter");
  if ([evidence.source, evidence.medium, evidence.campaign, evidence.referrer].some((v) => v != null && typeof v !== "string")) return unknown({}, "invalid_evidence", "legacy_adapter");
  const source = normalized(evidence.source) ?? "";
  const medium = normalized(evidence.medium) ?? "";
  const campaign = normalized(evidence.campaign) ?? "";
  if (source === "direct" && medium === "none" && campaign === "(direct/organic)") return make("direct_observed", "legacy_adapter", "legacy_direct_sentinel", input);
  if ((source === "google" || source === "googleads") && medium === "organic" && campaign === "(direct/organic)") return make("organic_search", "legacy_adapter", "legacy_organic_sentinel", input);
  return make("unknown", "legacy_adapter", "legacy_ambiguous", input);
}

export function attributionCampaignKey(classification: AttributionClassification): string {
  // JSON tuple encoding prevents delimiter collisions while retaining campaign case and identity.
  return JSON.stringify([classification.source ?? null, classification.medium ?? null, classification.campaign ?? null]);
}

export function matchesAttributionGroup(filter: AttributionGroupFilter, classification: AttributionClassification): boolean {
  return filter === "all" || classification.group === filter;
}
