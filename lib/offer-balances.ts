import { createHash } from "node:crypto";
import { firestoreDb } from "./firebase-admin";

export const OFFER_USAGE_COLLECTION = "offer_usage";
export const offerCutoverRef = () => firestoreDb.collection("offer_migrations").doc("sprint_0033");
export const legacyOfferBaselineRef = (code: string) => firestoreDb.collection("offer_migrations").doc(`legacy_${code}`);

export type OfferCounterKind = "campaign" | "code" | "sender" | "project";
export type OfferCounterDelta = { id: string; kind: OfferCounterKind; uses: number; cents: number; units: number };
export type OfferBalance = {
  heldUses: number; spentUses: number;
  heldCents: number; spentCents: number;
  heldUnits: number; spentUnits: number;
};
export type OfferCounterSnapshot = {
  ref: FirebaseFirestore.DocumentReference;
  data: OfferBalance;
};
export type OfferCounterLimit = OfferCounterSnapshot & {
  kind: OfferCounterKind; maxUses?: number; maxCents?: number; maxUnits?: number;
};

export function offerBalanceRef(kind: OfferCounterKind, entity: string, scope = "") {
  const id = createHash("sha256").update(`${kind}\0${entity}\0${scope}`).digest("hex");
  return firestoreDb.collection(OFFER_USAGE_COLLECTION).doc(id);
}

export function offerBalance(data?: Partial<OfferBalance>): OfferBalance {
  const balance = {
    heldUses: data?.heldUses ?? 0,
    spentUses: data?.spentUses ?? 0,
    heldCents: data?.heldCents ?? 0,
    spentCents: data?.spentCents ?? 0,
    heldUnits: data?.heldUnits ?? 0,
    spentUnits: data?.spentUnits ?? 0,
  };
  if (Object.values(balance).some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error("Invalid stored promotion balance.");
  }
  return balance;
}

export function promotionCounterDeltas(
  balances: readonly Pick<OfferCounterLimit, "ref" | "kind">[],
  cents: number,
  units: number,
): OfferCounterDelta[] {
  if (!Number.isSafeInteger(cents) || cents <= 0 || !Number.isSafeInteger(units) || units <= 0) {
    throw new Error("Invalid promotion exposure.");
  }
  return balances.map(({ ref, kind }) => ({ id: ref.id, kind, uses: 1, cents, units }));
}

export function offerAllowanceFits(counter: OfferCounterLimit, delta: OfferCounterDelta): boolean {
  const { data } = counter;
  return (counter.maxUses === undefined || data.heldUses + data.spentUses + delta.uses <= counter.maxUses)
    && (counter.maxCents === undefined || data.heldCents + data.spentCents + delta.cents <= counter.maxCents)
    && (counter.maxUnits === undefined || data.heldUnits + data.spentUnits + delta.units <= counter.maxUnits);
}

export async function readOfferCounterDeltas(tx: FirebaseFirestore.Transaction, deltas: readonly OfferCounterDelta[]) {
  return new Map(await Promise.all(deltas.map(async (delta) => {
    const ref = firestoreDb.collection(OFFER_USAGE_COLLECTION).doc(delta.id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Bound promotion balance is missing.");
    return [delta.id, { ref, data: offerBalance(snap.data()) }] as const;
  })));
}

export function applyOfferCounterDeltas(
  tx: FirebaseFirestore.Transaction,
  deltas: readonly OfferCounterDelta[],
  snapshots: ReadonlyMap<string, OfferCounterSnapshot>,
  operation: "hold" | "consume" | "release",
  { countSender = true } = {},
) {
  for (const delta of deltas) {
    const snapshot = snapshots.get(delta.id);
    if (!snapshot) throw new Error("Bound promotion balance is missing.");
    const held = operation === "hold" ? 1 : -1;
    const spent = operation === "consume" && (delta.kind !== "sender" || countSender) ? 1 : 0;
    const updated = offerBalance({
      heldUses: snapshot.data.heldUses + held * delta.uses,
      heldCents: snapshot.data.heldCents + held * delta.cents,
      heldUnits: snapshot.data.heldUnits + held * delta.units,
      spentUses: snapshot.data.spentUses + spent * delta.uses,
      spentCents: snapshot.data.spentCents + spent * delta.cents,
      spentUnits: snapshot.data.spentUnits + spent * delta.units,
    });
    tx.set(snapshot.ref, updated, { merge: true });
  }
}
