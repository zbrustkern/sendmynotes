import { getSupplierCountry } from "./mailing-destinations";
import {
  buildSyntheticPromotionBasket, EMPTY_PROMOTION_BALANCE, evaluatePromotion, PROMOTION_CHARGES,
  PROMOTION_COUNTS, PROMOTION_SCHEDULES, PROMOTION_SELECTION, type PromotionPolicy, type PromotionWorkflow,
} from "./promotions-v2";

export class PromotionAdminError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export function adminObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PromotionAdminError(`Enter valid ${label}.`);
  return value as Record<string, unknown>;
}

export function adminId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new PromotionAdminError(`Enter a valid ${label}.`);
  return value;
}

export function adminText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new PromotionAdminError(`Enter ${label} (up to ${max} characters).`);
  return value.trim();
}

export function adminInteger(value: unknown, label: string, min = 1, max = 100_000_000): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new PromotionAdminError(`Enter ${label} as a whole number between ${min} and ${max}.`);
  }
  return value;
}

export function optionalAdminInteger(value: unknown, label: string, min?: number, max?: number) {
  return value === undefined || value === null ? undefined : adminInteger(value, label, min, max);
}

export function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

export function parsePromotionCountries(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 250 || value.some((country) => {
    if (typeof country !== "string" || !/^[A-Z]{2}$/.test(country)) return true;
    const destination = getSupplierCountry(country);
    return !destination || destination.countryCode !== country || destination.suspended;
  })) throw new PromotionAdminError("Choose one or more supported destination countries.");
  return [...new Set(value)].sort();
}

export function parsePromotionPolicy(value: unknown, campaignId: string, id: string): PromotionPolicy {
  const input = adminObject(value, "promotion rules");
  const allowed = new Set([
    "workflow", "scheduleVersion", "countryCodes", "match", "minimumQuantity", "minimumSpendCents", "audience", "projectId", "startsAt", "endsAt",
    "chargeTypes", "benefit", "maxUnitsPerOrder", "maxDiscountCentsPerOrder", "maxUnitsPerProject", "maxDiscountCentsPerProject",
    "perSenderLimit", "allowFreeDomesticSingle", "payableFloor",
  ]);
  if (Object.keys(input).some((field) => !allowed.has(field))) throw new PromotionAdminError("An unsupported promotion rule was provided.");
  if (typeof input.workflow !== "string" || !Object.hasOwn(PROMOTION_SCHEDULES, input.workflow)) {
    throw new PromotionAdminError("Choose a supported checkout workflow.");
  }
  const workflow = input.workflow as PromotionWorkflow;
  if (input.scheduleVersion !== PROMOTION_SCHEDULES[workflow]) throw new PromotionAdminError("Choose the current pricing schedule for this workflow.");
  const countryCodes = parsePromotionCountries(input.countryCodes);
  if (workflow === "multisend" && (countryCodes.length !== 1 || countryCodes[0] !== "US")) throw new PromotionAdminError("Multisend offers apply to domestic cards.");
  if (input.match !== "all" && input.match !== "matching") throw new PromotionAdminError("Choose whether every card or only matching cards must qualify.");
  if (input.audience !== "any" && input.audience !== "verified" && input.audience !== "project") {
    throw new PromotionAdminError("Choose an offer audience.");
  }
  if (workflow === "wedding" && input.audience !== "project" || workflow !== "wedding" && input.audience === "project") {
    throw new PromotionAdminError("Wedding offers require an authorized wedding project.");
  }
  const projectId = input.audience === "project" ? adminId(input.projectId, "wedding project ID") : undefined;
  if (input.audience !== "project" && input.projectId != null) throw new PromotionAdminError("Choose the wedding workflow before entering a project ID.");
  if (!Array.isArray(input.chargeTypes) || !input.chargeTypes.length || input.chargeTypes.some((charge) => !PROMOTION_CHARGES.includes(charge))) {
    throw new PromotionAdminError("Choose a supported charge for the discount.");
  }
  const chargeTypes = PROMOTION_CHARGES.filter((charge) => (input.chargeTypes as string[]).includes(charge));
  if (chargeTypes.length === 1 && chargeTypes[0] === "destination_surcharge" && countryCodes.every((country) => country === "US")) {
    throw new PromotionAdminError("An eligible destination must have a mailing surcharge.");
  }
  const rawBenefit = adminObject(input.benefit, "discount benefit");
  const benefit = rawBenefit.type === "percentage" ? {
    type: rawBenefit.type, basisPoints: adminInteger(rawBenefit.basisPoints, "percentage in basis points", 1, 10_000),
  } as const : rawBenefit.type === "fixed_order" || rawBenefit.type === "fixed_unit" ? {
    type: rawBenefit.type, amountCents: adminInteger(rawBenefit.amountCents, "discount cents"),
  } as const : undefined;
  if (!benefit) throw new PromotionAdminError("Choose a fixed-order, per-card, or percentage discount.");
  const startsAt = optionalAdminInteger(input.startsAt, "start time", 0, 8_640_000_000_000_000);
  const endsAt = optionalAdminInteger(input.endsAt, "end time", 1, 8_640_000_000_000_000);
  if (startsAt !== undefined && endsAt !== undefined && startsAt >= endsAt) throw new PromotionAdminError("Set the end time after the start time.");
  const maxCount = PROMOTION_COUNTS[workflow][1];
  const minimumQuantity = optionalAdminInteger(input.minimumQuantity, "minimum eligible cards", 1, maxCount);
  const minimumSpendCents = optionalAdminInteger(input.minimumSpendCents, "minimum eligible spend", 1, maxCount * 1400);
  const maxUnitsPerOrder = optionalAdminInteger(input.maxUnitsPerOrder, "maximum cards per order", 1, maxCount);
  const maxDiscountCentsPerOrder = optionalAdminInteger(input.maxDiscountCentsPerOrder, "maximum savings per order", 1, maxCount * 1400);
  const maxUnitsPerProject = optionalAdminInteger(input.maxUnitsPerProject, "maximum cards per project");
  const maxDiscountCentsPerProject = optionalAdminInteger(input.maxDiscountCentsPerProject, "maximum savings per project");
  if ((maxUnitsPerProject !== undefined || maxDiscountCentsPerProject !== undefined) && workflow !== "wedding") throw new PromotionAdminError("Project allowances apply to wedding offers.");
  const perSenderLimit = optionalAdminInteger(input.perSenderLimit, "limit per verified sender");
  if (input.allowFreeDomesticSingle !== undefined && typeof input.allowFreeDomesticSingle !== "boolean") throw new PromotionAdminError("Choose whether a domestic single can be free.");
  if (input.allowFreeDomesticSingle === true && (workflow !== "single" || !countryCodes.includes("US"))) {
    throw new PromotionAdminError("Zero-dollar orders require an eligible domestic single.");
  }
  if (input.payableFloor !== "reject" && input.payableFloor !== "cap") throw new PromotionAdminError("Choose how checkout handles charges below $0.50.");
  return withoutUndefined({
    id, campaignId, workflow, scheduleVersion: PROMOTION_SCHEDULES[workflow], countryCodes, match: input.match,
    minimumQuantity, minimumSpendCents, audience: input.audience, projectId, startsAt, endsAt, chargeTypes, benefit,
    maxUnitsPerOrder, maxDiscountCentsPerOrder, maxUnitsPerProject, maxDiscountCentsPerProject, perSenderLimit,
    allowFreeDomesticSingle: input.allowFreeDomesticSingle === true, payableFloor: input.payableFloor, selectionStrategy: PROMOTION_SELECTION,
  } satisfies PromotionPolicy);
}

export function policyNeedsBudget(policy: PromotionPolicy, distribution: "public" | "private"): boolean {
  return policy.benefit.type === "fixed_unit" || policy.allowFreeDomesticSingle === true || distribution === "private" || policy.audience === "project";
}

export function policySampleTime(policy: PromotionPolicy) {
  return policy.startsAt ?? (policy.endsAt === undefined ? 0 : policy.endsAt - 1);
}


// The ordinary schedules have one possible price for a domestic or an international
// line. Wedding batches can combine destinations and four price tiers. Establish a
// conservative lower bound across all possible lines, including ordinals past 99.
export function verifyPromotionPayableDomain(policy: PromotionPolicy): void {
  const at = policySampleTime(policy);
  const [minCount, maxCount] = PROMOTION_COUNTS[policy.workflow];
  const domestic = policy.countryCodes.includes("US") ? ["US"] : [];
  const international = policy.countryCodes.find((country) => country !== "US");
  const countries = international ? [...domestic, international] : domestic;
  let canApply = false;
  function verify(countryCode: string, count: number, previouslyPurchased = 0, previouslyUsedUnits = 0) {
    const basket = buildSyntheticPromotionBasket(policy, { countryCode, count, previouslyPurchased });
    const result = evaluatePromotion(policy, basket, at, { project: { ...EMPTY_PROMOTION_BALANCE, spentUnits: previouslyUsedUnits } });
    if (result.eligible) canApply = true;
    if (result.reason === "unsupported_amount") {
      throw new PromotionAdminError("These rules can leave an unsupported checkout total. Adjust the benefit or cap savings to keep a payable total.");
    }
  }
  if (policy.workflow !== "wedding") {
    for (const country of countries) for (let count = minCount; count <= maxCount; count++) verify(country, count);
  } else {
    for (const country of countries) {
      for (const prior of [0, 9, 10, 24, 25, 98, 99, 100]) {
        for (const count of new Set([minCount, policy.minimumQuantity ?? minCount, maxCount])) verify(country, count, prior);
      }
    }
    if (policy.payableFloor === "reject") {
      const minimumGross = 650 * (policy.minimumQuantity ?? 1);
      const maximumOrder = Math.min(policy.maxDiscountCentsPerOrder ?? Infinity, policy.maxDiscountCentsPerProject ?? Infinity);
      const { benefit } = policy;
      for (const country of policy.countryCodes.includes("US") ? ["US", "international"] : ["international"]) {
        const surcharge = country === "US" ? 0 : 500;
        const eligible = (policy.chargeTypes.includes("card_base") ? 650 : 0) + (policy.chargeTypes.includes("destination_surcharge") ? surcharge : 0);
        if (!eligible) continue;
        const perUnit = benefit.type === "percentage" ? Math.round(eligible * benefit.basisPoints / 10_000)
          : Math.min(eligible, benefit.amountCents);
        const perUnitNet = 650 + surcharge - perUnit;
        if (perUnitNet < 50 && minimumGross - maximumOrder < 50) {
          throw new PromotionAdminError("Mixed wedding destinations and graduated rates cannot be proven payable under these rules. Set a lower benefit or choose a payable-total cap.");
        }
      }
    }
  }
  if (!canApply) throw new PromotionAdminError("These rules never apply savings to a supported basket.");
}

export function maximumPromotionOrderSubsidy(policy: PromotionPolicy): number {
  if (policy.workflow === "wedding") {
    const at = policySampleTime(policy);
    const max = PROMOTION_COUNTS.wedding[1];
    const international = policy.countryCodes.find((country) => country !== "US");
    const countryCode = international ?? "US";
    const largest = evaluatePromotion(policy, buildSyntheticPromotionBasket(policy, { countryCode, count: max }), at);
    if (international || policy.match === "all" || policy.payableFloor !== "cap") return largest.discountCents;
    // Extra international envelopes can preserve a higher payable total without
    // raising the eligible bases. Keep domestic eligible ordinals earliest.
    let maximum = largest.discountCents;
    for (let count = policy.minimumQuantity ?? 1; count < max; count++) {
      const countryCodes = Array.from({ length: max }, (_, index) => index < count ? "US" : "CA");
      maximum = Math.max(maximum, evaluatePromotion(policy, buildSyntheticPromotionBasket(policy, { countryCode, count: max, countryCodes }), at).discountCents);
    }
    return maximum;
  }
  const [min, max] = PROMOTION_COUNTS[policy.workflow];
  const countries = policy.countryCodes;
  return Math.max(0, ...countries.flatMap((countryCode) => Array.from({ length: max - min + 1 }, (_, i) => evaluatePromotion(
    policy, buildSyntheticPromotionBasket(policy, { countryCode, count: min + i }), policySampleTime(policy),
  ).discountCents)));
}
