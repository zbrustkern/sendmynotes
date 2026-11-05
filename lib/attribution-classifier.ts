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
  if (/\+?\d[\d\s().-]{6,}\d/.test(label)) return "[redacted]";
  if (!label || /^https?:\/\//i.test(label) || /(?:gclid|fbclid|msclkid|wbraid|gbraid)=/i.test(label) || /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(label)) return undefined;
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
    ...(cleanLabel(input.source) ? { source: cleanLabel(input.source)!.toLowerCase() } : {}),
    ...(cleanLabel(input.medium) ? { medium: cleanLabel(input.medium)!.toLowerCase() } : {}),
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
  let explicitPaid = paidMediums[med];
  if (med === "cpc" || med === "ppc") explicitPaid = googleSource ? "paid_search" : metaSource ? "paid_social" : "paid_unknown";
  if (["paid_social", "paidsocial"].includes(med) && metaSource) explicitPaid = "paid_social";
  const organic = med === "organic" || med === "seo";
  const email = Boolean(input.hasEmailClickId) || ["email", "e-mail", "newsletter"].includes(med) || ["email", "newsletter", "mail"].includes(src);
  const socialMedium = ["social", "social-network", "social_media", "social-media"].includes(med);
  const refKind = referrerKind(input.referrerHost);
  const externalRef = Boolean(input.referrerHost);
  const tagsPresent = Boolean(cleanLabel(input.source) || cleanLabel(input.medium) || cleanLabel(input.campaign));

  const incompatible = (explicitPaid && (organic || email || socialMedium)) ||
    (organic && (email || socialMedium)) ||
    (input.hasGoogleClickId && input.hasMetaClickId) ||
    (input.hasGoogleClickId && (organic || email || socialMedium)) ||
    (input.hasMetaClickId && (explicitPaid === "paid_search" || organic || email)) ||
    (input.hasGoogleClickId && explicitPaid === "paid_social");
  if (incompatible) return unknown(input, "conflicting_evidence", "conflict");

  if (explicitPaid) return make(explicitPaid, "utm", "explicit_paid_medium", input);
  if (input.hasGoogleClickId) return make("paid_unknown", "click_id", "google_click_untyped", { ...input, source: input.source ?? "google" });
  if (input.hasMetaClickId) return make("social_referral", "click_id", "meta_click_unverified_paid", { ...input, source: input.source ?? "meta" });
  if (organic && (googleSource || ["bing", "yahoo", "duckduckgo", "baidu", "yandex"].includes(src))) return make("organic_search", "utm", "organic_campaign", input);
  if (organic) return unknown(input, "conflicting_evidence", "conflict");
  if (email) return make("email", "utm", "email_campaign", input);
  if (socialMedium) return make("social_referral", "utm", "social_referrer", input);
  if (tagsPresent || cleanLabel(input.content) || cleanLabel(input.term)) {
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
  const input: AttributionClassifierInput = { source: evidence?.source, medium: evidence?.medium, campaign: evidence?.campaign, hasGoogleClickId: evidence?.hasGoogleClickId, hasMetaClickId: evidence?.hasMetaClickId, hasEmailClickId: evidence?.hasEmailClickId, entryObservation: "complete" };
  if (!evidence || typeof evidence !== "object") return unknown({}, "invalid_evidence", "legacy_adapter");
  if ([evidence.source, evidence.medium, evidence.campaign, evidence.referrer].some((v) => v != null && typeof v !== "string")) return unknown({}, "invalid_evidence", "legacy_adapter");
  const source = normalized(evidence.source) ?? "";
  const medium = normalized(evidence.medium) ?? "";
  const campaign = normalized(evidence.campaign) ?? "";
  if (source === "direct" && medium === "none" && campaign === "(direct/organic)") return make("direct_observed", "legacy_adapter", "legacy_direct_sentinel", input);
  if ((source === "google" || source === "googleads") && medium === "organic" && campaign === "(direct/organic)") return make("organic_search", "legacy_adapter", "legacy_organic_sentinel", input);
  if (source === "direct" || medium === "none" && (campaign === "(direct/organic)" || !campaign)) return make("unknown", "legacy_adapter", "legacy_ambiguous", input);
  const sentinel = campaign === "(direct/organic)";
  if (!source && !medium && !campaign && !evidence.hasGoogleClickId && !evidence.hasMetaClickId && !evidence.hasEmailClickId && !evidence.referrer) return make("unknown", "legacy_adapter", "legacy_ambiguous", input);
  let referrerHost: string | undefined;
  if (evidence.referrer) { try { referrerHost = new URL(evidence.referrer).hostname; } catch { return unknown(input, "invalid_evidence", "legacy_adapter"); } }
  const result = classifyAttributionEvidence({ ...input, referrerHost, entryObservation: "complete" });
  if (result.channel === "direct_observed" && (!evidence.observedEntry || sentinel)) return make("unknown", "legacy_adapter", "legacy_ambiguous", input);
  return { ...result, provenance: "legacy_adapter" };
}

/** Resolve the reporting group from an event's V2 snapshot or legacy flat fields.
 * A client-supplied channel label is never accepted as classification evidence. */
export function classifyAttributionProperties(value: unknown, expectedSessionId?: string): AttributionClassification {
  if (!value || typeof value !== "object" || Array.isArray(value)) return unknown({}, "invalid_evidence");
  const props = value as Record<string, unknown>;
  const snapshot = props.attributionV2 && typeof props.attributionV2 === "object" && !Array.isArray(props.attributionV2)
    ? props.attributionV2 as Record<string, unknown>
    : props.attribution_v2 && typeof props.attribution_v2 === "object" && !Array.isArray(props.attribution_v2)
      ? props.attribution_v2 as Record<string, unknown>
      : undefined;
  const touch = snapshot?.schemaVersion === 2 && snapshot.currentSessionTouch && typeof snapshot.currentSessionTouch === "object"
    ? snapshot.currentSessionTouch as Record<string, unknown>
    : undefined;
  if (touch) {
    if (expectedSessionId && touch.sessionId !== expectedSessionId) return unknown({}, "invalid_evidence");
    const source = typeof touch.source === "string" ? touch.source : undefined;
    const provenance = touch.provenance;
    const medium = typeof touch.medium === "string" ? touch.medium : undefined;
    const campaign = typeof touch.campaign === "string" ? touch.campaign : undefined;
    const referrerHost = typeof touch.referrerHost === "string" ? touch.referrerHost : undefined;
    if (provenance === "conflict" || touch.reason === "conflicting_evidence") return unknown({ source, medium, campaign }, "conflicting_evidence", "conflict");
    if (provenance === "legacy_adapter") return adaptLegacyAttribution({
      source, medium, campaign, referrer: referrerHost ? `https://${referrerHost}/` : undefined,
      observedEntry: true,
    });
    if (provenance === "click_id" && !source || provenance === "utm" && !source && !medium && !campaign || provenance === "external_referrer" && !referrerHost) {
      return unknown({ source, medium, campaign }, "invalid_evidence");
    }
    return classifyAttributionEvidence({
      source,
      medium,
      campaign,
      referrerHost,
      hasGoogleClickId: provenance === "click_id" && ["google", "googleads", "google_ads"].includes(normalized(source) ?? ""),
      hasMetaClickId: provenance === "click_id" && ["meta", "facebook", "fb", "instagram"].includes(normalized(source) ?? ""),
      hasEmailClickId: provenance === "click_id" && ["email", "newsletter", "mail"].includes(normalized(source) ?? ""),
      entryObservation: "complete",
    });
  }

  const source = props.utmSource ?? props.utm_source ?? props.source;
  const medium = props.utmMedium ?? props.utm_medium ?? props.medium;
  const campaign = props.utmCampaign ?? props.utm_campaign ?? props.campaign;
  const referrer = props.referrer;
  const googleClick = Boolean(props.gclid || props.wbraid || props.gbraid);
  const metaClick = Boolean(props.fbclid);
  const emailClick = Boolean(props.emailClickId || props.email_click_id);
  const entryWasObserved = Boolean(source || medium || campaign || referrer || googleClick || metaClick || emailClick);
  return adaptLegacyAttribution({
    source: typeof source === "string" ? source : undefined,
    medium: typeof medium === "string" ? medium : undefined,
    campaign: typeof campaign === "string" ? campaign : undefined,
    referrer: typeof referrer === "string" ? referrer : undefined,
    hasGoogleClickId: googleClick,
    hasMetaClickId: metaClick,
    hasEmailClickId: emailClick,
    observedEntry: entryWasObserved,
  });
}

export function attributionCampaignKey(classification: AttributionClassification): string {
  // JSON tuple encoding prevents delimiter collisions while retaining campaign case and identity.
  return JSON.stringify([classification.channel, classification.provenance, classification.source ?? null, classification.medium ?? null, classification.campaign ?? null]);
}

export function matchesAttributionGroup(filter: AttributionGroupFilter, classification: AttributionClassification): boolean {
  return filter === "all" || classification.group === filter;
}
