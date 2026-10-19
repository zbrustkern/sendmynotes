import { readBoundedQuery } from "./bounded-admin-read";
import { firestoreDb } from "./firebase-admin";

export type OperationalControlName = "checkout" | "fulfillment" | "generation";
export interface OperationalControl {
  paused: boolean;
  reason?: string;
  actor?: string;
  version: number;
  updatedAt?: number;
}
export interface OperationalControls {
  checkout: OperationalControl;
  fulfillment: OperationalControl;
  generation: OperationalControl;
}
const DEFAULT_CONTROL: OperationalControl = { paused: false, version: 0 };
const CONTROL_DOC = "operational_controls";

export async function getOperationalControls(): Promise<OperationalControls> {
  const snap = await firestoreDb.collection("system_config").doc(CONTROL_DOC).get();
  const saved = snap.exists ? (snap.data() as Partial<OperationalControls>) : {};
  const normalize = (name: OperationalControlName): OperationalControl => {
    const c = saved[name];
    return c && typeof c.paused === "boolean" && Number.isFinite(c.version)
      ? { ...DEFAULT_CONTROL, ...c }
      : { ...DEFAULT_CONTROL };
  };
  return { checkout: normalize("checkout"), fulfillment: normalize("fulfillment"), generation: normalize("generation") };
}

export async function isOperationalControlPaused(name: OperationalControlName): Promise<boolean> {
  const controls = await getOperationalControls();
  return controls[name].paused;
}

export async function updateOperationalControl(input: {
  name: OperationalControlName;
  paused: boolean;
  reason: string;
  actor: string;
}): Promise<OperationalControls> {
  const reason = input.reason.trim().slice(0, 500);
  if (!reason) throw new Error("A reason is required for control changes.");
  const controls = await getOperationalControls();
  const previous = controls[input.name];
  const next = { paused: input.paused, reason, actor: input.actor, version: previous.version + 1, updatedAt: Date.now() };
  const config = firestoreDb.collection("system_config").doc(CONTROL_DOC);
  const auditId = `control_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  await firestoreDb.runTransaction(async (tx: any) => {
    const current = await tx.get(config);
    const state = current.exists ? current.data() : {};
    const actual = state?.[input.name];
    const version = Number.isFinite(actual?.version) ? actual.version : 0;
    if (version !== previous.version) throw new Error("Control state changed during update; reload and retry.");
    tx.set(config, { [input.name]: next }, { merge: true });
    tx.set(firestoreDb.collection("operational_control_audit").doc(auditId), {
      id: auditId, control: input.name, from: previous.paused, to: input.paused,
      reason, actor: input.actor, version: next.version, createdAt: next.updatedAt,
    });
  });
  return getOperationalControls();
}

export async function previewOperationalControl(name: OperationalControlName) {
  const controls = await getOperationalControls();
  const active = controls[name];
  const openIncidents = await readBoundedQuery(firestoreDb.collection("system_incidents").where("resolved", "==", false));
  const pending = await readBoundedQuery(firestoreDb.collection("transactional_outbox").where("status", "==", "pending"));
  const affected = name === "checkout" ? "New payment intents and free orders" : name === "generation" ? "New custom artwork requests" : "Supplier submissions for captured orders";
  return { control: name, currentPaused: active.paused, nextPaused: !active.paused, version: active.version + 1, affected, openIncidentCount: openIncidents.size, pendingOutboxCount: pending.size, existingPaidOrdersPreserved: true, previewOnly: true };
}
