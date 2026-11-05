import assert from "node:assert/strict";
import fixtures from "./fixtures/attribution-classifier-v2.json";
import type { AttributionClassifierInput } from "../lib/attribution-contract";
import {
  adaptLegacyAttribution,
  attributionCampaignKey,
  classifyAttributionProperties,
  classifyAttributionEvidence,
  matchesAttributionGroup,
} from "../lib/attribution-classifier";

for (const fixture of fixtures) {
  const result = classifyAttributionEvidence(fixture.input as AttributionClassifierInput);
  for (const [key, value] of Object.entries(fixture.expected)) assert.equal(result[key as keyof typeof result], value, `${fixture.name}: ${key}`);
}

const organic = classifyAttributionEvidence({ source: "google", medium: "organic", entryObservation: "complete" });
assert.deepEqual(classifyAttributionEvidence({ source: "google", medium: "organic", entryObservation: "complete" }), organic, "classification is deterministic");
assert.equal(classifyAttributionEvidence({ entryObservation: "complete", referrerHost: "www.google.com" }).channel, "organic_search");
assert.equal(classifyAttributionEvidence({ entryObservation: "complete", referrerHost: "google.com.attacker.test" }).channel, "referral", "hostname suffix traps do not match Google");
assert.equal(classifyAttributionEvidence({ entryObservation: "complete", referrerHost: "notgoogle.com" }).channel, "referral", "hostname substring traps do not match Google");
assert.equal(classifyAttributionEvidence({ entryObservation: "complete", referrerHost: "m.instagram.com" }).channel, "social_referral");
assert.equal(classifyAttributionEvidence({ entryObservation: "complete", referrerHost: "instagram.com.evil" }).channel, "referral");

const conflict = classifyAttributionEvidence({ source: "google", medium: "organic", hasGoogleClickId: true, entryObservation: "complete" });
assert.deepEqual([conflict.channel, conflict.reason], ["unknown", "conflicting_evidence"]);
assert.equal(classifyAttributionEvidence({ source: "google", medium: "cpc", entryObservation: "complete" }).channel, "paid_search");
assert.equal(classifyAttributionEvidence({ source: "google", medium: "cpc", hasMetaClickId: true, entryObservation: "complete" }).channel, "unknown");
assert.equal(classifyAttributionEvidence({ source: "google", medium: "cpc", hasGoogleClickId: true, entryObservation: "complete" }).channel, "paid_search");
assert.deepEqual(
  [classifyAttributionEvidence({ hasGoogleClickId: true, entryObservation: "complete" }).source, classifyAttributionEvidence({ hasGoogleClickId: true, entryObservation: "complete" }).medium],
  ["google", undefined], "a Google click ID identifies the platform without inventing a medium"
);
assert.deepEqual(
  [classifyAttributionEvidence({ hasMetaClickId: true, entryObservation: "complete" }).source, classifyAttributionEvidence({ hasMetaClickId: true, entryObservation: "complete" }).medium],
  ["meta", undefined], "a Meta click ID identifies the platform without inventing a medium"
);
assert.equal(classifyAttributionEvidence({ source: "google", medium: "paid", hasGoogleClickId: true, entryObservation: "complete" }).channel, "paid_unknown", "generic paid medium and matching Google click evidence agree");
assert.equal(classifyAttributionEvidence({ source: "google", medium: "display", hasGoogleClickId: true, entryObservation: "complete" }).channel, "paid_other", "Google display click evidence remains paid without forcing search");
assert.equal(classifyAttributionEvidence({ source: "facebook", medium: "paid_social", hasMetaClickId: true, entryObservation: "complete" }).channel, "paid_social");
assert.equal(classifyAttributionEvidence({ hasEmailClickId: true, entryObservation: "complete" }).channel, "email");
assert.equal(classifyAttributionEvidence({ content: "creative-A", entryObservation: "complete" }).channel, "other_campaign");
assert.equal(classifyAttributionEvidence({ term: "gift", entryObservation: "complete" }).channel, "other_campaign");
assert.equal(classifyAttributionEvidence({ source: "google", medium: "cpc", campaign: "https://secret.test/?gclid=x", entryObservation: "complete" }).campaign, undefined);
assert.equal(classifyAttributionEvidence({ source: "https://secret.test", entryObservation: "complete" }).source, undefined);
assert.equal(classifyAttributionEvidence({ source: 12 as unknown as string, entryObservation: "complete" }).reason, "invalid_evidence");
assert.equal(adaptLegacyAttribution({ source: "google", medium: "cpc", campaign: "Sale" }).channel, "paid_search", "legacy UTM evidence uses canonical channel rules");
assert.equal(adaptLegacyAttribution({ source: "google", medium: "cpc", campaign: "Sale" }).provenance, "legacy_adapter");
assert.equal(adaptLegacyAttribution({}).channel, "unknown");
assert.equal(adaptLegacyAttribution({ observedEntry: true }).channel, "unknown");
assert.equal(adaptLegacyAttribution({ source: "facebook", medium: "paid_social", hasMetaClickId: true }).channel, "paid_social");
assert.equal(adaptLegacyAttribution({ source: "google", medium: "organic", campaign: "Campaign" }).channel, "organic_search");
assert.equal(adaptLegacyAttribution({ source: "direct", medium: "none" }).channel, "unknown", "legacy direct without the exact sentinel remains unknown");
assert.equal(adaptLegacyAttribution({ source: "direct", medium: "none", campaign: "(direct/organic)" }).channel, "direct_observed");
assert.equal(adaptLegacyAttribution({ referrer: "https://www.google.com/search?q=private" }).channel, "organic_search");
assert.equal(classifyAttributionProperties({ utmSource: "google", utmMedium: "cpc" }).group, "paid");
assert.equal(classifyAttributionProperties({ utmSource: "direct", utmMedium: "none", utmCampaign: "(direct/organic)" }).group, "direct_observed");
assert.equal(classifyAttributionProperties({}).group, "unknown", "empty legacy properties do not become direct by default");
assert.equal(classifyAttributionProperties({ attributionV2: { schemaVersion: 2, currentSessionTouch: { channel: "paid_search", source: "google", medium: "cpc", provenance: "utm" } } }).group, "paid", "V2 evidence is reclassified from its fields");
assert.equal(classifyAttributionProperties({ attributionV2: { schemaVersion: 2, currentSessionTouch: { sessionId: "other-session", source: "google", medium: "cpc", provenance: "utm" } } }, "expected-session").group, "unknown", "V2 attribution cannot join across session identities");
assert.equal(classifyAttributionProperties({ attributionV2: { schemaVersion: 2, currentSessionTouch: { channel: "paid_search", provenance: "observed_no_referrer" } } }).group, "direct_observed", "a client channel alias cannot override the observed evidence");
assert.equal(classifyAttributionProperties({ attributionV2: { schemaVersion: 2, currentSessionTouch: { channel: "paid_search", source: "google", medium: "organic", provenance: "conflict", reason: "conflicting_evidence" } } }).group, "unknown", "conflicting V2 evidence is never silently paid");
assert.equal(classifyAttributionEvidence({ source: "person@example.com", entryObservation: "complete" }).source, undefined);
assert.equal(classifyAttributionEvidence({ campaign: "+1 (312) 555-0199", entryObservation: "complete" }).campaign, "[redacted]", "phone-like campaign labels are redacted");
assert.equal(matchesAttributionGroup("paid", classifyAttributionEvidence({ hasGoogleClickId: true, entryObservation: "complete" })), true);
assert.equal(matchesAttributionGroup("all", conflict), true);

const a = classifyAttributionEvidence({ source: "Google", medium: "cpc", campaign: "Spring" , entryObservation: "complete" });
const b = classifyAttributionEvidence({ source: "Google", medium: "email", campaign: "Spring", entryObservation: "complete" });
const c = classifyAttributionEvidence({ source: "Google", medium: "cpc", campaign: "spring", entryObservation: "complete" });
assert.notEqual(attributionCampaignKey(a), attributionCampaignKey(b), "same campaign from distinct source/medium is distinct");
assert.notEqual(attributionCampaignKey(a), attributionCampaignKey(c), "campaign identity preserves case");
assert.equal(a.source, "google", "source labels are canonical lowercase");
assert.notEqual(attributionCampaignKey(classifyAttributionEvidence({ hasGoogleClickId: true, entryObservation: "complete" })), attributionCampaignKey(classifyAttributionEvidence({ hasMetaClickId: true, entryObservation: "complete" })));
assert.notEqual(attributionCampaignKey(classifyAttributionEvidence({ source: "a|b", medium: "c", campaign: "d", entryObservation: "complete" })), attributionCampaignKey(classifyAttributionEvidence({ source: "a", medium: "b|c", campaign: "d", entryObservation: "complete" })), "structured keys avoid delimiter collisions");

console.log("attribution-classifier: fixture and focused assertions passed");
