import { NextRequest, NextResponse } from "next/server";
import { firestoreDb, getOrdersCollection, sanitizeFirestoreData } from "@/lib/firebase-admin";
import { UserAccount, Order, SavedAddress } from "@/lib/types";

const USERS_COLLECTION = "users";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get("uid");
    const email = searchParams.get("email");

    if (!uid && !email) {
      return NextResponse.json({ error: "Missing uid or email parameter" }, { status: 400 });
    }

    let user: UserAccount | null = null;

    if (uid) {
      const doc = await firestoreDb.collection(USERS_COLLECTION).doc(uid).get();
      if (doc.exists) {
        user = doc.data() as UserAccount;
      }
    }

    // Lookup user's past orders
    const emailToQuery = (email || user?.email || "").toLowerCase();
    const ordersSnapshot = await getOrdersCollection().get();
    const orders: Order[] = [];

    ordersSnapshot.forEach((doc) => {
      const order = doc.data() as Order;
      if (
        (uid && order.userId === uid) ||
        (emailToQuery && order.customerEmail?.toLowerCase() === emailToQuery)
      ) {
        orders.push(order);
      }
    });

    orders.sort((a, b) => b.createdAt - a.createdAt);

    // Auto-sync recipient addresses from past orders into savedAddresses if missing
    if (user && orders.length > 0) {
      let addressesUpdated = false;
      const currentSaved: SavedAddress[] = [...(user.savedAddresses || [])];

      for (const order of orders) {
        if (!order.recipientAddress || !order.recipientAddress.street1) continue;
        const r = order.recipientAddress;
        const alreadyExists = currentSaved.some(
          (a) =>
            a.street1?.trim().toLowerCase() === r.street1?.trim().toLowerCase() &&
            a.zip?.trim().toLowerCase() === r.zip?.trim().toLowerCase() &&
            a.firstName?.trim().toLowerCase() === r.firstName?.trim().toLowerCase()
        );

        if (!alreadyExists) {
          currentSaved.push({
            id: `addr_order_${order.id || Date.now()}`,
            firstName: r.firstName,
            lastName: r.lastName,
            street1: r.street1,
            street2: r.street2 || "",
            city: r.city,
            state: r.state,
            zip: r.zip,
            country: r.country || "US",
            label: `${r.firstName}'s Address`,
          });
          addressesUpdated = true;
        }
      }

      if (addressesUpdated && uid) {
        user.savedAddresses = currentSaved;
        user.updatedAt = Date.now();
        await firestoreDb
          .collection(USERS_COLLECTION)
          .doc(uid)
          .set(sanitizeFirestoreData(user), { merge: true });
      }
    } else if (!user && uid && orders.length > 0) {
      // Auto-initialize account document for this user using addresses from their orders
      const orderSaved: SavedAddress[] = [];
      for (const order of orders) {
        if (!order.recipientAddress || !order.recipientAddress.street1) continue;
        const r = order.recipientAddress;
        const alreadyExists = orderSaved.some(
          (a) =>
            a.street1?.trim().toLowerCase() === r.street1?.trim().toLowerCase() &&
            a.zip?.trim().toLowerCase() === r.zip?.trim().toLowerCase() &&
            a.firstName?.trim().toLowerCase() === r.firstName?.trim().toLowerCase()
        );
        if (!alreadyExists) {
          orderSaved.push({
            id: `addr_order_${order.id || Date.now()}`,
            firstName: r.firstName,
            lastName: r.lastName,
            street1: r.street1,
            street2: r.street2 || "",
            city: r.city,
            state: r.state,
            zip: r.zip,
            country: r.country || "US",
            label: `${r.firstName}'s Address`,
          });
        }
      }

      const initialUser: UserAccount = {
        uid,
        email: email || emailToQuery,
        displayName: "",
        savedAddresses: orderSaved,
        savedCovers: [],
        creditsBalance: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await firestoreDb
        .collection(USERS_COLLECTION)
        .doc(uid)
        .set(sanitizeFirestoreData(initialUser));
      user = initialUser;
    }

    return NextResponse.json({
      user,
      orders,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error retrieving account";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { uid, email, displayName, savedAddresses, addressToAdd, defaultReturnAddress } = body;

    if (!uid || !email) {
      return NextResponse.json({ error: "UID and email are required" }, { status: 400 });
    }

    const userRef = firestoreDb.collection(USERS_COLLECTION).doc(uid);
    const existingDoc = await userRef.get();
    const existingData = existingDoc.exists ? (existingDoc.data() as UserAccount) : null;

    let finalAddresses: SavedAddress[] = savedAddresses ?? existingData?.savedAddresses ?? [];

    // If an individual address is supplied to add/update
    if (addressToAdd && typeof addressToAdd === "object") {
      const addrId = addressToAdd.id || `addr_${Date.now()}`;
      const toSave: SavedAddress = {
        id: addrId,
        firstName: String(addressToAdd.firstName || "").trim(),
        lastName: String(addressToAdd.lastName || "").trim(),
        street1: String(addressToAdd.street1 || "").trim(),
        street2: String(addressToAdd.street2 || "").trim(),
        city: String(addressToAdd.city || "").trim(),
        state: String(addressToAdd.state || "").trim().toUpperCase(),
        zip: String(addressToAdd.zip || "").trim(),
        country: String(addressToAdd.country || "US").trim(),
        label: addressToAdd.label || `${addressToAdd.firstName}'s Address`,
        ...(addressToAdd.occasionType ? { occasionType: addressToAdd.occasionType } : {}),
        ...(addressToAdd.occasionTitle ? { occasionTitle: addressToAdd.occasionTitle } : {}),
        ...(addressToAdd.occasionMonth ? { occasionMonth: Number(addressToAdd.occasionMonth) } : {}),
        ...(addressToAdd.occasionDay ? { occasionDay: Number(addressToAdd.occasionDay) } : {}),
        ...(addressToAdd.occasionYear ? { occasionYear: Number(addressToAdd.occasionYear) } : {}),
        ...(addressToAdd.remindMe !== undefined ? { remindMe: Boolean(addressToAdd.remindMe) } : {}),
        ...(addressToAdd.remindDaysBefore ? { remindDaysBefore: Number(addressToAdd.remindDaysBefore) } : {}),
      };

      const existingIndex = finalAddresses.findIndex(
        (a) =>
          a.id === addrId ||
          (a.street1.trim().toLowerCase() === toSave.street1.toLowerCase() &&
            a.zip.trim().toLowerCase() === toSave.zip.toLowerCase() &&
            a.firstName.trim().toLowerCase() === toSave.firstName.toLowerCase())
      );

      if (existingIndex >= 0) {
        finalAddresses = [...finalAddresses];
        finalAddresses[existingIndex] = toSave;
      } else {
        finalAddresses = [...finalAddresses, toSave];
      }
    }

    const userRecord: UserAccount = {
      uid,
      email,
      displayName: displayName ?? existingData?.displayName ?? "",
      savedAddresses: finalAddresses,
      ...(defaultReturnAddress !== undefined
        ? { defaultReturnAddress }
        : existingData?.defaultReturnAddress
        ? { defaultReturnAddress: existingData.defaultReturnAddress }
        : {}),
      savedCovers: existingData?.savedCovers || [],
      creditsBalance: existingData?.creditsBalance || 0,
      createdAt: existingData?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    // Sanitize data to strip any undefined values before writing to Firestore
    const sanitizedRecord = sanitizeFirestoreData(userRecord);
    await userRef.set(sanitizedRecord, { merge: true });

    return NextResponse.json({ success: true, user: sanitizedRecord });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error updating account";
    console.error("[Account POST Error]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
