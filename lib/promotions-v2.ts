import { BASE_PRICE_CENTS, INTERNATIONAL_SURCHARGE_CENTS, ORDER_PRICE_VERSION } from "./order-pricing";
import { WEDDING_PRICE_BANDS, WEDDING_PRICE_VERSION } from "./wedding-pricing";
import { allocateTotalCents } from "./multi-send/contracts";

export const MULTISEND_PROMOTION_SCHEDULE = "multi-send-900-v1";
export const PROMOTION_SELECTION = "eligible_line_order_v1";
export const PROMOTION_CHARGES = ["card_base", "destination_surcharge"] as const;
export const PROMOTION_SCHEDULES = { single: ORDER_PRICE_VERSION, multisend: MULTISEND_PROMOTION_SCHEDULE, wedding: WEDDING_PRICE_VERSION } as const;
export const PROMOTION_COUNTS = { single: [1, 1], multisend: [2, 25], wedding: [1, 100] } as const;
export type PromotionWorkflow = keyof typeof PROMOTION_SCHEDULES;
export type PromotionCharge = (typeof PROMOTION_CHARGES)[number];
export type PromotionBenefit =
  | { type: "fixed_order"; amountCents: number }
  | { type: "fixed_unit"; amountCents: number }
  | { type: "percentage"; basisPoints: number };

export interface PromotionPolicy {
  id: string;
  campaignId: string;
  version?: number;
  compatibility?: "post_purchase_v1";
  workflow: PromotionWorkflow;
  scheduleVersion: string;
  countryCodes: string[];
  match: "all" | "matching";
  minimumQuantity?: number;
  minimumSpendCents?: number;
  audience: "any" | "verified" | "project";
  projectId?: string;
  startsAt?: number;
  endsAt?: number;
  chargeTypes: PromotionCharge[];
  benefit: PromotionBenefit;
  maxUnitsPerOrder?: number;
  maxDiscountCentsPerOrder?: number;
  maxUnitsPerProject?: number;
  maxDiscountCentsPerProject?: number;
  perSenderLimit?: number;
  allowFreeDomesticSingle?: boolean;
  payableFloor: "reject" | "cap";
  selectionStrategy: typeof PROMOTION_SELECTION;
}

export interface PromotionComponent { id: string; chargeType: string; grossCents: number; taxPolicyVersion: string }
export interface PromotionLine {
  id: string;
  productType: "card";
  countryCode: string | null;
  projectOrdinal?: number;
  components: PromotionComponent[];
}
export interface PromotionBasket {
  workflow: PromotionWorkflow;
  scheduleVersion: string;
  currency: "USD";
  revision: string;
  ownerUid?: string;
  projectId?: string;
  canPayProject?: boolean;
  lines: PromotionLine[];
}

export interface PromotionBalance {
  heldUses: number;
  spentUses: number;
  heldCents: number;
  spentCents: number;
  heldUnits: number;
  spentUnits: number;
}
export interface PromotionLimitBalance extends PromotionBalance { maxUses?: number; maxCents?: number; maxUnits?: number }
export const EMPTY_PROMOTION_BALANCE: Readonly<PromotionBalance> = Object.freeze({ heldUses: 0, spentUses: 0, heldCents: 0, spentCents: 0, heldUnits: 0, spentUnits: 0 });
export interface PromotionUsage {
  lifecycle?: "draft" | "active" | "paused" | "archived";
  unavailable?: boolean;
  identityRequired?: boolean;
  campaign?: PromotionLimitBalance;
  code?: PromotionLimitBalance;
  sender?: PromotionLimitBalance;
  project?: PromotionLimitBalance;
}

export type PromotionReason = "applied" | "unavailable" | "not_started" | "expired" | "wrong_workflow" | "wrong_schedule" |
  "destination_required" | "destination_unavailable" | "wrong_country" | "project_unavailable" | "identity_required" |
  "minimum_quantity" | "minimum_spend" | "sender_limit" | "project_limit" | "use_limit" | "budget_exhausted" | "no_savings" |
  "unsupported_amount" | "invalid_basket";

export interface PromotionApplied {
  policyVersionId: string;
  campaignId: string;
  selectionStrategy: typeof PROMOTION_SELECTION;
  discountCents: number;
  units: number;
}

export interface PromotionEvaluation {
  eligible: boolean;
  reason: PromotionReason;
  policyVersionId: string;
  grossCents: number;
  cardBaseCents: number;
  surchargeCents: number;
  discountCents: number;
  netCents: number;
  eligibleUnits: number;
  selectedUnits: number;
  remainingProjectUnits?: number;
  remainingProjectCents?: number;
  lines: Array<Omit<PromotionLine, "components"> & {
    grossCents: number;
    discountCents: number;
    netCents: number;
    components: Array<PromotionComponent & { discountCents: number; netCents: number }>;
  }>;
  appliedPromotions: [] | [PromotionApplied];
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function isNonnegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: number): boolean {
  return isNonnegativeInteger(value) && value > 0;
}

function byIdentifier(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function permittedZero(policy: PromotionPolicy, basket: PromotionBasket) {
  return policy.allowFreeDomesticSingle === true && basket.workflow === "single" &&
    basket.lines.length === 1 && basket.lines[0].countryCode === "US";
}

export function isSupportedPromotionPayable(netCents: number, allowZero: boolean): boolean {
  return Number.isSafeInteger(netCents) && (netCents >= 50 || netCents === 0 && allowZero);
}

function distribute(components: Array<PromotionComponent & { lineId: string }>, discount: number): Map<string, number> {
  const allocations = new Map<string, number>();
  const gross = sum(components.map((component) => component.grossCents));
  if (!gross || !discount) return allocations;
  const denominator = BigInt(gross);
  const ranked = components.map((component) => {
    const amount = BigInt(component.grossCents) * BigInt(discount);
    const floor = Number(amount / denominator);
    const key = JSON.stringify([component.lineId, component.id]);
    allocations.set(key, floor);
    return { key, remainder: amount % denominator, floor };
  });
  const remaining = discount - sum(ranked.map(({ floor }) => floor));
  ranked.sort((a, b) => a.remainder === b.remainder ? byIdentifier(a.key, b.key) : a.remainder > b.remainder ? -1 : 1);
  for (const { key, floor } of ranked.slice(0, remaining)) allocations.set(key, floor + 1);
  return allocations;
}

export function evaluatePromotion(policy: PromotionPolicy, basket: PromotionBasket, now: number, usage: PromotionUsage = {}): PromotionEvaluation {
  const components = basket.lines.flatMap((line) => line.components);
  const grossCents = sum(components.map((component) => component.grossCents));
  let eligibleUnits = 0;
  let remainingProjectUnits: number | undefined;
  let remainingProjectCents: number | undefined;
  const finish = (reason: PromotionReason, allocations = new Map<string, number>(), selectedUnits = 0): PromotionEvaluation => {
    const lines = basket.lines.map((line) => {
      const pricedComponents = line.components.map((component) => {
        const discountCents = allocations.get(JSON.stringify([line.id, component.id])) ?? 0;
        return { ...component, discountCents, netCents: component.grossCents - discountCents };
      });
      const gross = sum(pricedComponents.map((component) => component.grossCents));
      const discount = sum(pricedComponents.map((component) => component.discountCents));
      return { ...line, grossCents: gross, discountCents: discount, netCents: gross - discount, components: pricedComponents };
    });
    const discountCents = sum(lines.map((line) => line.discountCents));
    const appliedPromotions: PromotionEvaluation["appliedPromotions"] = reason === "applied" ? [{
      policyVersionId: policy.id, campaignId: policy.campaignId, selectionStrategy: policy.selectionStrategy,
      discountCents, units: selectedUnits,
    }] : [];
    return {
      eligible: reason === "applied", reason, policyVersionId: policy.id,
      grossCents, cardBaseCents: sum(components.filter(({ chargeType }) => chargeType === "card_base").map(({ grossCents: cents }) => cents)),
      surchargeCents: sum(components.filter(({ chargeType }) => chargeType === "destination_surcharge").map(({ grossCents: cents }) => cents)),
      discountCents, netCents: grossCents - discountCents,
      eligibleUnits, selectedUnits, lines, appliedPromotions,
      ...(remainingProjectUnits === undefined ? {} : { remainingProjectUnits }),
      ...(remainingProjectCents === undefined ? {} : { remainingProjectCents }),
    };
  };

  if (usage.unavailable || usage.lifecycle && usage.lifecycle !== "active") return finish("unavailable");
  if (policy.startsAt !== undefined && now < policy.startsAt) return finish("not_started");
  if (policy.endsAt !== undefined && now >= policy.endsAt) return finish("expired");
  const legacyFollowupBatch = policy.compatibility === "post_purchase_v1" && basket.workflow === "multisend";
  if (policy.workflow !== basket.workflow && !legacyFollowupBatch) return finish("wrong_workflow");
  if (basket.scheduleVersion !== (legacyFollowupBatch ? MULTISEND_PROMOTION_SCHEDULE : policy.scheduleVersion)) return finish("wrong_schedule");
  const [minCount, maxCount] = PROMOTION_COUNTS[basket.workflow];
  if (basket.currency !== "USD" || !basket.revision || basket.lines.length < minCount || basket.lines.length > maxCount || !isNonnegativeInteger(grossCents) ||
    new Set(basket.lines.map(({ id }) => id)).size !== basket.lines.length || basket.lines.some((line) =>
      !line.id || line.productType !== "card" || basket.workflow === "wedding" && !isPositiveInteger(line.projectOrdinal ?? 0) ||
      new Set(line.components.map(({ id }) => id)).size !== line.components.length ||
      line.components.some((component) => !component.id || !component.taxPolicyVersion || !isNonnegativeInteger(component.grossCents)))) {
    return finish("invalid_basket");
  }
  if (policy.audience === "project" && (!basket.canPayProject || !basket.projectId || basket.projectId !== policy.projectId)) {
    return finish("project_unavailable");
  }
  if ((usage.identityRequired || policy.audience === "verified" || policy.perSenderLimit !== undefined) && !basket.ownerUid) return finish("identity_required");
  if (basket.lines.some(({ countryCode }) => countryCode === null)) return finish("destination_required");
  const allowed = new Set(policy.countryCodes);
  const charges: ReadonlySet<string> = new Set(policy.chargeTypes);
  const matching = basket.lines.filter((line) => allowed.has(line.countryCode ?? ""));
  if (!matching.length || (policy.match === "all" && matching.length !== basket.lines.length)) return finish("wrong_country");
  const eligible = matching.map((line) => ({
    id: line.id, ordinal: line.projectOrdinal ?? 0, components: line.components.filter(({ chargeType, grossCents }) => charges.has(chargeType) && grossCents > 0)
      .map((component) => ({ ...component, lineId: line.id })),
  })).filter(({ components }) => components.length > 0);
  eligibleUnits = eligible.length;
  if (eligibleUnits < (policy.minimumQuantity ?? 1)) return finish(eligibleUnits ? "minimum_quantity" : "no_savings");
  const eligibleSpend = sum(matching.flatMap(({ components }) => components
    .filter(({ chargeType }) => chargeType === "card_base" || chargeType === "destination_surcharge")
    .map(({ grossCents }) => grossCents)));
  if (eligibleSpend < (policy.minimumSpendCents ?? 0)) return finish("minimum_spend");

  const sender = usage.sender ?? EMPTY_PROMOTION_BALANCE;
  if (policy.perSenderLimit !== undefined && sender.heldUses + sender.spentUses >= policy.perSenderLimit) return finish("sender_limit");
  const project = usage.project ?? EMPTY_PROMOTION_BALANCE;
  if (policy.maxUnitsPerProject !== undefined) {
    remainingProjectUnits = Math.max(0, policy.maxUnitsPerProject - project.heldUnits - project.spentUnits);
    if (!remainingProjectUnits) return finish("project_limit");
  }
  if (policy.maxDiscountCentsPerProject !== undefined) {
    remainingProjectCents = Math.max(0, policy.maxDiscountCentsPerProject - project.heldCents - project.spentCents);
    if (!remainingProjectCents) return finish("project_limit");
  }
  if (basket.workflow === "wedding") eligible.sort((a, b) => a.ordinal - b.ordinal || byIdentifier(a.id, b.id));
  const selected = eligible.slice(0, Math.min(policy.maxUnitsPerOrder ?? Infinity, remainingProjectUnits ?? Infinity));
  const selectedComponents = selected.flatMap(({ components }) => components);
  const selectedGross = sum(selectedComponents.map(({ grossCents }) => grossCents));
  const { benefit } = policy;
  const unitDiscount = (line: typeof selected[number]) => benefit.type === "fixed_unit"
    ? Math.min(benefit.amountCents, sum(line.components.map(({ grossCents }) => grossCents))) : 0;
  const benefitDiscount = benefit.type === "percentage" ? Number((BigInt(selectedGross) * BigInt(benefit.basisPoints) + BigInt(5_000)) / BigInt(10_000))
    : benefit.type === "fixed_unit" ? sum(selected.map(unitDiscount)) : benefit.amountCents;
  let discount = Math.min(selectedGross, policy.maxDiscountCentsPerOrder ?? Infinity, remainingProjectCents ?? Infinity, benefitDiscount);
  const allowedZero = permittedZero(policy, basket);
  if (!isSupportedPromotionPayable(grossCents - discount, allowedZero) && policy.payableFloor === "cap") discount = Math.max(0, grossCents - 50);
  if (!isSupportedPromotionPayable(grossCents - discount, allowedZero)) return finish("unsupported_amount");
  if (!discount) return finish("no_savings");

  for (const balance of [usage.campaign, usage.code]) {
    if (!balance) continue;
    if (balance.maxUses !== undefined && balance.heldUses + balance.spentUses >= balance.maxUses) return finish("use_limit");
    if (balance.maxCents !== undefined && balance.heldCents + balance.spentCents + discount > balance.maxCents) return finish("budget_exhausted");
  }
  if (remainingProjectCents !== undefined) remainingProjectCents -= discount;
  if (legacyFollowupBatch) {
    const totals = allocateTotalCents(grossCents - discount, basket.lines.length);
    const allocations = new Map<string, number>();
    for (const [index, line] of basket.lines.entries()) {
      const base = line.components[0];
      if (line.countryCode !== "US" || line.components.length !== 1 || base.chargeType !== "card_base" || base.grossCents !== BASE_PRICE_CENTS) return finish("invalid_basket");
      allocations.set(JSON.stringify([line.id, base.id]), BASE_PRICE_CENTS - totals[index]);
    }
    return finish("applied", allocations, Math.min(discount, basket.lines.length));
  }
  const allocations = benefit.type === "fixed_unit"
    ? distribute(selected.map((line) => ({ ...line.components[0], id: line.id, lineId: line.id, grossCents: unitDiscount(line) })), discount)
    : distribute(selectedComponents, discount);
  if (benefit.type === "fixed_unit") {
    const unitAllocations = new Map<string, number>();
    for (const line of selected) {
      const amount = allocations.get(JSON.stringify([line.id, line.id])) ?? 0;
      for (const [key, cents] of distribute(line.components, amount)) unitAllocations.set(key, cents);
    }
    if (remainingProjectUnits !== undefined) remainingProjectUnits -= selected.filter(({ id }) => (allocations.get(JSON.stringify([id, id])) ?? 0) > 0).length;
    return finish("applied", unitAllocations, selected.filter(({ id }) => (allocations.get(JSON.stringify([id, id])) ?? 0) > 0).length);
  }
  const discountedUnits = selected.filter((line) => line.components.some(({ id }) => (allocations.get(JSON.stringify([line.id, id])) ?? 0) > 0)).length;
  if (remainingProjectUnits !== undefined) remainingProjectUnits -= discountedUnits;
  return finish("applied", allocations, discountedUnits);
}

export function buildSyntheticPromotionBasket(policy: PromotionPolicy, input: {
  countryCode: string | null; count: number; previouslyPurchased?: number; countryCodes?: Array<string | null>;
  verified?: boolean; wrongProject?: boolean;
}): PromotionBasket {
  const [minimum, maximum] = PROMOTION_COUNTS[policy.workflow];
  const prior = input.previouslyPurchased ?? 0;
  if (!Number.isSafeInteger(input.count) || input.count < minimum || input.count > maximum || !isNonnegativeInteger(prior) ||
    !Number.isSafeInteger(prior + input.count) || input.countryCodes && input.countryCodes.length !== input.count) {
    throw new RangeError("Choose a supported card count and previously purchased quantity.");
  }
  const lines: PromotionLine[] = Array.from({ length: input.count }, (_, i) => {
    const ordinal = prior + i + 1;
    const countryCode = input.countryCodes ? input.countryCodes[i] : input.countryCode;
    const id = `card-${String(i + 1).padStart(3, "0")}`;
    const wedding = policy.workflow === "wedding";
    const grossCents = wedding
      ? WEDDING_PRICE_BANDS.find((band) => ordinal >= band.first && (band.last === null || ordinal <= band.last))!.unitCents
      : BASE_PRICE_CENTS;
    const taxPolicyVersion = wedding ? "pilot-all-in-1" : "included-v1";
    const components: PromotionComponent[] = [{ id: `${id}-base`, chargeType: "card_base", grossCents, taxPolicyVersion }];
    if (countryCode && countryCode !== "US") components.push({ id: `${id}-mailing`, chargeType: "destination_surcharge", grossCents: INTERNATIONAL_SURCHARGE_CENTS, taxPolicyVersion });
    return { id, productType: "card", countryCode, ...(wedding ? { projectOrdinal: ordinal } : {}), components };
  });
  return {
    workflow: policy.workflow, revision: "synthetic", scheduleVersion: policy.scheduleVersion, currency: "USD",
    ...(input.verified === false ? {} : { ownerUid: "synthetic-sender" }),
    ...(policy.projectId ? { projectId: input.wrongProject ? "synthetic-other-project" : policy.projectId, canPayProject: true } : {}),
    lines,
  };
}
