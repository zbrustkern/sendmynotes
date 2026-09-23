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
    const ordersSnapshot = await getOrdersCollection()
      .where("customerEmail", "==", email || user?.email || "")
      .get();

    const orders: Order[] = [];
    ordersSnapshot.forEach((doc) => orders.push(doc.data() as Order));

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

    const userRecord: UserAccount = {
      uid,
      email,
      displayName: displayName || "",
      savedAddresses: savedAddresses || [],
      defaultReturnAddress: defaultReturnAddress || undefined,
      savedCovers: [],
      creditsBalance: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await firestoreDb.collection(USERS_COLLECTION).doc(uid).set(userRecord, { merge: true });

    return NextResponse.json({ success: true, user: userRecord });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error updating account";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
