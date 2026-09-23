import { NextRequest, NextResponse } from "next/server";
import { firestoreDb, getOrdersCollection } from "@/lib/firebase-admin";
import { UserAccount, Order } from "@/lib/types";

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
    const { uid, email, displayName, savedAddresses, defaultReturnAddress } = body;

    if (!uid || !email) {
      return NextResponse.json({ error: "UID and email are required" }, { status: 400 });
    }

    const userRef = firestoreDb.collection(USERS_COLLECTION).doc(uid);
    const existingDoc = await userRef.get();
    const existingData = existingDoc.exists ? (existingDoc.data() as UserAccount) : null;

    const userRecord: UserAccount = {
      uid,
      email,
      displayName: displayName ?? existingData?.displayName ?? "",
      savedAddresses: savedAddresses ?? existingData?.savedAddresses ?? [],
      defaultReturnAddress:
        defaultReturnAddress !== undefined
          ? defaultReturnAddress
          : existingData?.defaultReturnAddress,
      savedCovers: existingData?.savedCovers || [],
      creditsBalance: existingData?.creditsBalance || 0,
      createdAt: existingData?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    await userRef.set(userRecord, { merge: true });

    return NextResponse.json({ success: true, user: userRecord });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error updating account";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
