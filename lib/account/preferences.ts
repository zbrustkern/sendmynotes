import { firestoreDb } from '@/lib/firebase-admin';
import type { MailingAddress } from '@/lib/types';
import type { AccountActor, AccountPreferences } from './contracts';
import { AccountError, accountDoc, accountScope, expectedVersion } from './http';

type StoredPreferences = Omit<AccountPreferences, 'reminderEmail' | 'emailVerified' | 'reminderDeliveryAvailable'> & {
  ownerUid: string;
  ownerScope: string;
};

const DEFAULT_TIME_ZONE = 'America/Chicago';
const PREFS_ID = 'current';
const reminderDeliveryAvailable = process.env.ACCOUNT_REMINDER_DELIVERY_ACTIVE === 'true'
  && Boolean(process.env.RESEND_API_KEY && process.env.REMINDER_FROM_EMAIL && process.env.REMINDER_WORKER_SECRET);

function timeZone(value: unknown, fallback = DEFAULT_TIME_ZONE): string {
  const candidate = typeof value === 'string' ? value.trim() : fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate });
    return candidate;
  } catch {
    throw new AccountError('invalid_time_zone', 'Choose a valid time zone.');
  }
}

function text(value: unknown, fallback: string, max: number): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.trim().length > max) throw new AccountError('invalid', 'Check your profile name.');
  return value.trim();
}

function address(value: unknown, fallback: MailingAddress | null): MailingAddress | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AccountError('invalid_address', 'Enter a valid return address.');
  const raw = value as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const [key, max] of Object.entries({ firstName: 80, lastName: 80, street1: 120, street2: 120, city: 80, state: 80, zip: 24, country: 2 })) {
    const item = raw[key];
    if (item !== undefined && typeof item !== 'string') throw new AccountError('invalid_address', 'Enter a valid return address.');
    fields[key] = String(item ?? (key === 'country' ? 'US' : '')).trim();
    if (fields[key].length > max) throw new AccountError('invalid_address', 'Enter a valid return address.');
  }
  const hasAnything = Object.entries(fields).some(([key, item]) => key !== 'country' && item.length > 0);
  if (!hasAnything) return null;
  if (!fields.firstName || !fields.street1 || !fields.city || !fields.state || !fields.zip) {
    throw new AccountError('invalid_address', 'Complete the return address or clear it.');
  }
  if (!['us','usa','united states','united states of america'].includes(fields.country.toLowerCase())) throw new AccountError('invalid_address', 'Your return address must be in the United States.');
  return { firstName: fields.firstName, lastName: fields.lastName, street1: fields.street1, ...(fields.street2 ? { street2: fields.street2 } : {}), city: fields.city, state: fields.state, zip: fields.zip, country: 'US' };
}

function project(row: Partial<StoredPreferences> | undefined, actor: AccountActor): AccountPreferences {
  return {
    displayName: typeof row?.displayName === 'string' ? row.displayName : '',
    defaultReturnAddress: row?.defaultReturnAddress ?? null,
    timeZone: typeof row?.timeZone === 'string' ? row.timeZone : DEFAULT_TIME_ZONE,
    timeZoneConfirmed: row?.timeZoneConfirmed === true,
    remindersPaused: row?.remindersPaused === true,
    version: Number.isSafeInteger(row?.version) && Number(row?.version) > 0 ? Number(row?.version) : 1,
    updatedAt: Number.isFinite(row?.updatedAt) ? Number(row?.updatedAt) : 0,
    reminderEmail: actor.emailVerified ? actor.email : '',
    emailVerified: actor.emailVerified,
    reminderDeliveryAvailable,
  };
}

/** Global reminder pause/timezone source shared by the reminder lane. The destination is always the current verified identity email. */
export async function getAccountPreferences(actor: AccountActor): Promise<AccountPreferences> {
  const ref = accountDoc('preferences', actor.uid, PREFS_ID);
  const snapshot = await ref.get();
  const stored = snapshot.data() as StoredPreferences | undefined;
  if (stored && stored.ownerScope === accountScope(actor.uid)) return project(stored, actor);

  // Seed the v2 view from the current profile's existing return address without mutating the legacy record.
  const legacy = await firestoreDb.collection('users').doc(actor.uid).get();
  const legacyData = legacy.data() as { displayName?: unknown; defaultReturnAddress?: MailingAddress } | undefined;
  return project({ displayName: typeof legacyData?.displayName === 'string' ? legacyData.displayName : '', defaultReturnAddress: legacyData?.defaultReturnAddress ?? null }, actor);
}

/** Save editable preferences using optimistic version checks; email is never accepted from the request body. */
export async function saveAccountPreferences(actor: AccountActor, input: Record<string, unknown>): Promise<AccountPreferences> {
  const ref = accountDoc('preferences', actor.uid, PREFS_ID);
  const expected = expectedVersion(input.expectedVersion);
  const currentSnap = await ref.get();
  const stored = currentSnap.data() as StoredPreferences | undefined;
  if (stored && stored.ownerScope !== accountScope(actor.uid)) throw new AccountError('not_found', 'Preferences not found.', 404);
  const old = project(stored, actor);
  if (old.version !== expected) throw new AccountError('conflict', 'Your settings changed. Reload before saving.', 409);
  const hasExplicitTimeZone = typeof input.timeZone === 'string' && Boolean(input.timeZone.trim());
  const nextTimeZone = timeZone(input.timeZone, old.timeZone);
  const timeZoneConfirmed = hasExplicitTimeZone
    ? nextTimeZone !== old.timeZone
      ? input.confirmTimeZone === true
      : typeof input.confirmTimeZone === 'boolean'
        ? input.confirmTimeZone
        : old.timeZoneConfirmed
    : old.timeZoneConfirmed;
  const next: StoredPreferences = {
    displayName: text(input.displayName, old.displayName, 120),
    defaultReturnAddress: address(input.defaultReturnAddress, old.defaultReturnAddress),
    timeZone: nextTimeZone,
    timeZoneConfirmed,
    remindersPaused: input.remindersPaused === undefined ? old.remindersPaused : input.remindersPaused === true,
    version: old.version + 1,
    updatedAt: Date.now(),
    ownerUid: actor.uid,
    ownerScope: accountScope(actor.uid),
  };
  // Transaction rechecks version to prevent concurrent preferences writes from silently replacing one another.
  await firestoreDb.runTransaction(async tx => {
    const latestSnap = await tx.get(ref);
    const latest = latestSnap.data() as StoredPreferences | undefined;
    if (latest && latest.ownerScope !== accountScope(actor.uid)) throw new AccountError('not_found', 'Preferences not found.', 404);
    if (project(latest, actor).version !== expected) throw new AccountError('conflict', 'Your settings changed. Reload before saving.', 409);
    tx.set(ref, next);
  });
  return project(next, actor);
}
