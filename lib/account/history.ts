import type { Order } from '@/lib/types';
import type { AccountActor } from './contracts';
import { getOrdersCollection } from '@/lib/firebase-admin';
import { AccountError } from './http';

const PAID_STATES = new Set(['PAYMENT_RECEIVED','AWAITING_RECIPIENT_ADDRESS','DISPATCHING','DISPATCH_UNCERTAIN','PROCESSING_HANDWRYTTEN','QUEUED_FOR_FULFILLMENT','MAILED']);
const READ_CAP = 250;
export type HistoryStatus = 'received' | 'preparing' | 'address_needed' | 'checking' | 'mailed' | 'attention';
export type AccountHistoryOrder = {
  id: string; createdAt: number | null; updatedAt: number | null; status: Order['status']; customerStatus: HistoryStatus;
  recipientName: string; occasion: string | null; frontAvailable: boolean; message: string; salutation: string; noteText: string; fontStyleId: string | null;
  recipientAddress: Order['recipientAddress'] | null; returnAddress: Order['returnAddress'] | null;
  amountInCents: number | null; currency: 'USD'; discountAmountInCents: number | null; mailedAt: string | null;
  trackingAvailable: boolean;
};
type Cursor = { before: number; id: string };

function cursorDecode(value: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Cursor;
    if (!Number.isSafeInteger(parsed.before) || typeof parsed.id !== 'string' || !parsed.id) throw new Error();
    return parsed;
  } catch { throw new AccountError('invalid_cursor', 'Reload card history to continue.'); }
}
function cursorEncode(row: AccountHistoryOrder | Cursor): string { return Buffer.from(JSON.stringify('before' in row ? row : { before: row.createdAt, id: row.id })).toString('base64url'); }
function orderDate(value: unknown): number | null { const n = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN; return Number.isFinite(n) ? n : null; }
function customerStatus(order: Order): HistoryStatus {
  if (order.status === 'AWAITING_RECIPIENT_ADDRESS') return 'address_needed';
  if (order.status === 'DISPATCH_UNCERTAIN') return 'checking';
  if (order.status === 'MAILED') return 'mailed';
  if (order.status === 'FAILED') return 'attention';
  if (order.status === 'PAYMENT_RECEIVED') return 'received';
  return 'preparing';
}
function paidAndEligible(order: Order): boolean {
  // A PaymentIntent ID is assigned before payment is captured, so it cannot
  // establish that a FAILED order was paid. Only accepted lifecycle states
  // belong in customer history.
  return PAID_STATES.has(order.status) && order.origin !== 'ADMIN_COMP' && !order.isComp && !order.isFounderTest && !order.isTest && order.paymentMode !== 'stripe_test' && order.paymentMode !== 'local_mock';
}
function project(order: Order): AccountHistoryOrder {
  const recipient = order.recipientAddress;
  const recipientName = [recipient?.firstName, recipient?.lastName].filter(Boolean).join(' ').trim();
  return {
    id: order.id,
    createdAt: orderDate(order.createdAt),
    updatedAt: orderDate(order.updatedAt),
    status: order.status,
    customerStatus: customerStatus(order),
    recipientName: recipientName || 'Recipient not available',
    occasion: typeof order.occasion === 'string' ? order.occasion.slice(0, 140) : null,
    frontAvailable: Boolean(order.uploadMaster || (typeof order.frontImageUrl === 'string' && order.frontImageUrl.startsWith('/presets/'))),
    message: [typeof order.printedMessage === 'string' ? order.printedMessage.trim() : '', typeof order.handwrittenNote === 'string' ? order.handwrittenNote.trim() : ''].filter(Boolean).join('\n\n'),
    salutation: typeof order.printedMessage === 'string' ? order.printedMessage : '',
    noteText: typeof order.handwrittenNote === 'string' ? order.handwrittenNote : typeof order.printedMessage === 'string' ? order.printedMessage : '',
    fontStyleId: typeof order.fontStyleId === 'string' ? order.fontStyleId : null,
    recipientAddress: recipient && typeof recipient === 'object' ? { firstName: recipient.firstName || '', lastName: recipient.lastName || '', street1: recipient.street1 || '', ...(recipient.street2 ? { street2: recipient.street2 } : {}), city: recipient.city || '', state: recipient.state || '', zip: recipient.zip || '', country: recipient.country || 'US' } : null,
    returnAddress: order.returnAddress && typeof order.returnAddress === 'object' ? { firstName: order.returnAddress.firstName || '', lastName: order.returnAddress.lastName || '', street1: order.returnAddress.street1 || '', ...(order.returnAddress.street2 ? { street2: order.returnAddress.street2 } : {}), city: order.returnAddress.city || '', state: order.returnAddress.state || '', zip: order.returnAddress.zip || '', country: order.returnAddress.country || 'US' } : null,
    amountInCents: Number.isSafeInteger(order.finalAmountInCents) ? order.finalAmountInCents! : Number.isSafeInteger(order.amountInCents) ? order.amountInCents : null,
    currency: 'USD',
    discountAmountInCents: Number.isSafeInteger(order.discountAmountInCents) ? order.discountAmountInCents! : null,
    mailedAt: typeof order.handwryttenMailedDate === 'string' ? order.handwryttenMailedDate : null,
    trackingAvailable: Boolean(order.handwryttenTrackingUrl),
  };
}
function compare(a: AccountHistoryOrder, b: AccountHistoryOrder) { return (b.createdAt ?? 0) - (a.createdAt ?? 0) || b.id.localeCompare(a.id); }

function belongsToActor(order: Order, actor: AccountActor) {
  if (order.userId) return order.userId === actor.uid;
  return actor.emailVerified && Boolean(actor.email) && order.customerEmail?.trim().toLowerCase() === actor.email.trim().toLowerCase();
}

async function ownedOrders(actor: AccountActor, cursor?: Cursor): Promise<{ orders: Order[]; more: boolean; lastScanned: Cursor | null }> {
  const collection = getOrdersCollection();
  let cursorSnapshot: Awaited<ReturnType<ReturnType<typeof collection.doc>['get']>> | undefined;
  if (cursor) {
    cursorSnapshot = await collection.doc(cursor.id).get();
    if (!cursorSnapshot.exists || orderDate(cursorSnapshot.data()?.createdAt) !== cursor.before) throw new AccountError('invalid_cursor', 'Reload card history to continue.');
  }
  const makeQuery = (field: string, value: string) => {
    let query: any = collection.where(field, '==', value);
    query = query.orderBy('createdAt', 'desc');
    // Firestore snapshot cursors carry the ordered field and the document ID
    // tie-breaker, so equal timestamps are neither lost nor repeated.
    if (cursorSnapshot) query = query.startAfter(cursorSnapshot);
    return query.limit(READ_CAP + 1);
  };
  const queries = [makeQuery('userId', actor.uid).get()];
  if (actor.emailVerified && actor.email) queries.push(makeQuery('customerEmail', actor.email).get());
  const snapshots = await Promise.all(queries);
  const unique = new Map<string, Order>();
  const scanned: Cursor[] = [];
  for (const snapshot of snapshots) for (const doc of snapshot.docs) {
    const order = doc.data() as Order;
    const before = orderDate(order?.createdAt);
    if (before !== null) scanned.push({ before, id: doc.id });
    if (order?.id && belongsToActor(order, actor) && paidAndEligible(order)) unique.set(doc.id, order);
  }
  // The oldest scanned position is a safe shared cursor across UID and legacy
  // email queries. This lets a page advance past rejected explicit-owner email
  // matches without ever skipping an older eligible record.
  scanned.sort((a, b) => a.before - b.before || a.id.localeCompare(b.id));
  return { orders: [...unique.values()], more: snapshots.some(snapshot => snapshot.docs.length > READ_CAP), lastScanned: scanned[0] || null };
}

export async function listAccountHistory(actor: AccountActor, options: { cursor?: string; limit?: number; status?: string; search?: string } = {}) {
  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new AccountError('invalid_limit', 'Choose a valid page size.');
  const cursor = options.cursor ? cursorDecode(options.cursor) : undefined;
  const status = options.status || 'all';
  if (!['all','received','preparing','address_needed','checking','mailed','attention'].includes(status)) throw new AccountError('invalid_filter', 'Choose a valid card status.');
  const search = (options.search || '').trim().toLocaleLowerCase().slice(0, 100);
  const loaded = await ownedOrders(actor, cursor);
  const orders = loaded.orders.map(project).sort(compare);
  let matches = orders.filter(row => (status === 'all' || row.customerStatus === status) && (!search || `${row.id} ${row.recipientName} ${row.occasion || ''} ${row.message}`.toLocaleLowerCase().includes(search)));
  const page = matches.slice(0, limit);
  const nextCursor = matches.length > limit
    ? cursorEncode(page[page.length - 1])
    : loaded.more && loaded.lastScanned ? cursorEncode(loaded.lastScanned) : null;
  return { data: page, nextCursor };
}

export async function getAccountHistoryOrder(actor: AccountActor, id: string): Promise<{ order: AccountHistoryOrder; hasPrivateMaster: boolean; safePublicFront: string | null } | null> {
  const safeId = id.trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(safeId)) return null;
  const snapshot = await getOrdersCollection().doc(safeId).get();
  const order = snapshot.data() as Order | undefined;
  if (!order || !paidAndEligible(order)) return null;
  const owner = belongsToActor(order, actor);
  if (!owner) return null;
  const safePublicFront = typeof order.frontImageUrl === 'string' && /^\/presets\/[A-Za-z0-9_.-]+\.(?:png|jpe?g|webp)$/i.test(order.frontImageUrl) ? order.frontImageUrl : null;
  return { order: project(order), hasPrivateMaster: Boolean(order.uploadMaster), safePublicFront };
}
