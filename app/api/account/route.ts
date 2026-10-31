import { stripPrivateOrderMedia } from "@/lib/upload/order-master";
import { NextRequest, NextResponse } from "next/server";
import {
  firestoreDb,
  getOrdersCollection,
  sanitizeFirestoreData,
  verifyFirebaseIdToken,
} from "@/lib/firebase-admin";
import { UserAccount, Order, SavedAddress } from "@/lib/types";

const USERS_COLLECTION = "users";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized: Missing authentication token" },
        { status: 401 }
      );
    }

    const decoded = await verifyFirebaseIdToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or expired authentication token" },
        { status: 401 }
      );
    }

    const verifiedUid = decoded.uid;
    const verifiedEmail = decoded.email?.toLowerCase();

    const { searchParams } = new URL(req.url);
    const requestedUid = searchParams.get("uid");
    const requestedEmail = searchParams.get("email");

    // Guard: Prevent accessing another user's account records
    if (requestedUid && requestedUid !== verifiedUid) {
      return NextResponse.json(
        { error: "Forbidden: You cannot access another user's account." },
        { status: 403 }
      );
    }

    if (requestedEmail && verifiedEmail && requestedEmail.toLowerCase() !== verifiedEmail) {
      return NextResponse.json(
        { error: "Forbidden: You cannot access another user's email records." },
        { status: 403 }
      );
    }

    let user: UserAccount | null = null;
    const doc = await firestoreDb.collection(USERS_COLLECTION).doc(verifiedUid).get();
    if (doc.exists) {
      user = doc.data() as UserAccount;
    }

    // Lookup user's past orders scoped strictly to verified UID and verified email
    const orders: Order[] = [];
    const uidOrdersSnapshot = await getOrdersCollection()
      .where("userId", "==", verifiedUid)
      .get();

    uidOrdersSnapshot.forEach((d) => {
      orders.push(d.data() as Order);
    });

    if (verifiedEmail && decoded.email_verified) {
      const emailOrdersSnapshot = await getOrdersCollection()
        .where("customerEmail", "==", verifiedEmail)
        .get();

      emailOrdersSnapshot.forEach((d) => {
        const order = d.data() as Order;
        if (!orders.some((existing) => existing.id === order.id)) {
          orders.push(order);
        }
      });
    }

    orders.sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json({
      user,
      orders: orders.map(stripPrivateOrderMedia),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error retrieving account";
    console.error("[Account GET Error]:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized: Missing authentication token" },
        { status: 401 }
      );
    }

    const decoded = await verifyFirebaseIdToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or expired authentication token" },
        { status: 401 }
      );
    }

    const verifiedUid = decoded.uid;
    const verifiedEmail = decoded.email?.toLowerCase();

    const body = await req.json();
    const { uid, email, displayName, savedAddresses, addressToAdd, defaultReturnAddress } = body;

    if (!uid || uid !== verifiedUid) {
      return NextResponse.json(
        { error: "Forbidden: UID must match verified identity" },
        { status: 403 }
      );
    }

    if (email && verifiedEmail && email.toLowerCase() !== verifiedEmail) {
      return NextResponse.json(
        { error: "Forbidden: Email must match verified identity" },
        { status: 403 }
      );
    }

    const userRef = firestoreDb.collection(USERS_COLLECTION).doc(verifiedUid);
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
      uid: verifiedUid,
      email: verifiedEmail || email || "",
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
