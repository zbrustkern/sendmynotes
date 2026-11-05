import assert from "node:assert/strict";
import fixtures from "./fixtures/attribution-classifier-v2.json";
import type { AttributionClassifierInput } from "../lib/attribution-contract";
import {
  adaptLegacyAttribution,
  attributionCampaignKey,
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
assert.equal(classifyAttributionEvidence({ source: "google", medium: "cpc", campaign: "https://secret.test/?gclid=x", entryObservation: "complete" }).campaign, undefined);
assert.equal(classifyAttributionEvidence({ source: "https://secret.test", entryObservation: "complete" }).source, undefined);
assert.equal(classifyAttributionEvidence({ source: 12 as unknown as string, entryObservation: "complete" }).reason, "invalid_evidence");
assert.equal(adaptLegacyAttribution({ source: "google", medium: "cpc", campaign: "Sale" }).channel, "unknown", "legacy rows do not receive new channel inference");
assert.equal(matchesAttributionGroup("paid", classifyAttributionEvidence({ hasGoogleClickId: true, entryObservation: "complete" })), true);
assert.equal(matchesAttributionGroup("all", conflict), true);

const a = classifyAttributionEvidence({ source: "Google", medium: "cpc", campaign: "Spring" , entryObservation: "complete" });
const b = classifyAttributionEvidence({ source: "Google", medium: "email", campaign: "Spring", entryObservation: "complete" });
const c = classifyAttributionEvidence({ source: "Google", medium: "cpc", campaign: "spring", entryObservation: "complete" });
assert.notEqual(attributionCampaignKey(a), attributionCampaignKey(b), "same campaign from distinct source/medium is distinct");
assert.notEqual(attributionCampaignKey(a), attributionCampaignKey(c), "campaign identity preserves case");
assert.notEqual(attributionCampaignKey(classifyAttributionEvidence({ source: "a|b", medium: "c", campaign: "d", entryObservation: "complete" })), attributionCampaignKey(classifyAttributionEvidence({ source: "a", medium: "b|c", campaign: "d", entryObservation: "complete" })), "structured keys avoid delimiter collisions");

console.log("attribution-classifier: fixture and focused assertions passed");
