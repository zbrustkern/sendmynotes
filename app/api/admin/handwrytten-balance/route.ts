import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { getSystemConfig } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey =
      process.env.HANDWRYTTEN_API_KEY || process.env["handwrytten-api-key"];
    const isTestMode =
      process.env.HANDWRYTTEN_TEST_MODE === "true" ||
      process.env.NEXT_PUBLIC_HANDWRYTTEN_TEST_MODE === "true";

    const config = await getSystemConfig<{ backplateImageId?: number }>("handwrytten");
    const backplateImageId =
      config?.backplateImageId ||
      (process.env.HANDWRYTTEN_BACKPLATE_IMAGE_ID
        ? parseInt(process.env.HANDWRYTTEN_BACKPLATE_IMAGE_ID, 10)
        : 751314);

    if (!apiKey) {
      return NextResponse.json({
        connected: false,
        isTestMode,
        backplateImageId,
        message: "HANDWRYTTEN_API_KEY not configured",
      });
    }

    let accountData: any = null;
    try {
      // Query Handwrytten Profile or Account Info
      const res = await fetch("https://api.handwrytten.com/v2/profile", {
        method: "GET",
        headers: {
          Authorization: apiKey,
          Accept: "application/json",
        },
      });
      if (res.ok) {
        accountData = await res.json();
      }
    } catch {
      // fallback gracefully if endpoint varies
    }

    // Handwrytten credit card on file / auto-reload accounts or credit balance
    const credits = accountData?.user?.credits || accountData?.credits || null;
    const cardsRemaining = credits !== null ? Math.floor(credits / 3.5) : null;
    const lowBalanceWarning = credits !== null ? credits < 15 : false;

    return NextResponse.json({
      connected: true,
      isTestMode,
      backplateImageId,
      credits,
      cardsRemaining,
      lowBalanceWarning,
      accountEmail: accountData?.user?.email || null,
      modeLabel: isTestMode ? "Simulated Test Mode (Zero Cost)" : "Physical Ink Production",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error fetching Handwrytten balance";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
