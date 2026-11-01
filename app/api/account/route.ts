import { listAccountHistory } from "@/lib/account/history";
import { NextRequest, NextResponse } from "next/server";
import { firestoreDb, sanitizeFirestoreData } from "@/lib/firebase-admin";
import type { UserAccount, SavedAddress } from "@/lib/types";
import { AccountError, accountError, requireAccountActor, readAccountBody } from "@/lib/account/http";
import { listContacts } from "@/lib/account/people";
import { listOccasions } from "@/lib/account/occasions";
import { migrateLegacyPeople } from "@/lib/account/migration";

const USERS_COLLECTION = "users";

async function canonicalAddressProjection(actor: Awaited<ReturnType<typeof requireAccountActor>>): Promise<SavedAddress[]> {
  const people = [] as Awaited<ReturnType<typeof listContacts>>["data"];
  let personCursor: string | undefined;
  do {
    const page = await listContacts(actor, personCursor, 50);
    people.push(...page.data);
    personCursor = page.nextCursor || undefined;
  } while (personCursor);
  const occasions = [] as Awaited<ReturnType<typeof listOccasions>>["data"];
  let occasionCursor: string | undefined;
  do {
    const page = await listOccasions(actor, occasionCursor, 50);
    occasions.push(...page.data);
    occasionCursor = page.nextCursor || undefined;
  } while (occasionCursor);
  return people.flatMap((person) => {
    if (!person.address) return [];
    const event = occasions.find((row) => row.contactId === person.id);
    return [{
      id: person.id,
      firstName: person.address.firstName,
      lastName: person.address.lastName,
      street1: person.address.street1,
      street2: person.address.street2 || "",
      city: person.address.city,
      state: person.address.state,
      zip: person.address.zip,
      country: person.address.country || "US",
      label: person.displayName,
      ...(event ? { ...(event.type !== "other" ? { occasionType: event.type } : {}), occasionTitle: event.title, occasionMonth: event.month, occasionDay: event.day, ...(event.year ? { occasionYear: event.year } : {}), remindMe: event.reminderEnabled, remindDaysBefore: 14 } : {}),
    } satisfies SavedAddress];
  });
}

export async function GET(req: NextRequest) {
  try {
    const actor = await requireAccountActor(req);
    const { searchParams } = new URL(req.url);
    if (searchParams.get("uid") && searchParams.get("uid") !== actor.uid) throw new AccountError("forbidden", "You cannot access another user's account.", 403);
    if (searchParams.get("email") && actor.email && searchParams.get("email")!.toLowerCase() !== actor.email) throw new AccountError("forbidden", "You cannot access another user's email records.", 403);
    await migrateLegacyPeople(actor);
    const userSnap = await firestoreDb.collection(USERS_COLLECTION).doc(actor.uid).get();
    const stored = userSnap.data() as UserAccount | undefined;
    const [savedAddresses, history] = await Promise.all([
      canonicalAddressProjection(actor), listAccountHistory(actor, { limit: 20 }),
    ]);
    const user: UserAccount | null = stored ? {
      ...stored,
      uid: actor.uid,
      email: actor.email || stored.email || "",
      savedAddresses,
    } : null;
    return NextResponse.json({ user, orders: history.data, ordersNextCursor: history.nextCursor }, { headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Authorization" } });
  } catch (error) { return accountError(error); }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireAccountActor(req, true);
    const body = await readAccountBody(req);
    if (body.uid !== undefined && body.uid !== actor.uid) throw new AccountError("forbidden", "UID must match verified identity.", 403);
    // Saved people are now individual versioned resources. A whole-array write can
    // overwrite edits from another tab, so older clients must reload and use those APIs.
    if (Object.hasOwn(body, "savedAddresses") || Object.hasOwn(body, "addressToAdd")) {
      await migrateLegacyPeople(actor);
      throw new AccountError("legacy_write_rejected", "Reload your address book to save people with the current account tools.", 409);
    }
    await migrateLegacyPeople(actor);
    const userRef = firestoreDb.collection(USERS_COLLECTION).doc(actor.uid);
    const snap = await userRef.get();
    const existing = snap.data() as UserAccount | undefined;
    const displayName = body.displayName === undefined ? existing?.displayName || "" : String(body.displayName).trim().slice(0, 120);
    const defaultReturnAddress = body.defaultReturnAddress === undefined ? existing?.defaultReturnAddress : body.defaultReturnAddress;
    const userRecord = sanitizeFirestoreData({
      uid: actor.uid, email: actor.email || existing?.email || "", displayName,
      ...(defaultReturnAddress !== undefined ? { defaultReturnAddress } : {}),
      savedAddresses: existing?.savedAddresses || [], savedCovers: existing?.savedCovers || [],
      creditsBalance: existing?.creditsBalance || 0, createdAt: existing?.createdAt || Date.now(), updatedAt: Date.now(),
    } as UserAccount);
    await userRef.set(userRecord, { merge: true });
    const [savedAddresses, updated] = await Promise.all([canonicalAddressProjection(actor), userRef.get()]);
    return NextResponse.json({ success: true, user: { ...(updated.data() as UserAccount), savedAddresses } }, { headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Authorization" } });
  } catch (error) { return accountError(error); }
}
