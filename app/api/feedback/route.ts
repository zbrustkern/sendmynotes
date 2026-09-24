import { NextRequest, NextResponse } from "next/server";
import { firestoreDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { feedback, email, category, currentStep, rating } = body;

    if (!feedback || typeof feedback !== "string" || !feedback.trim()) {
      return NextResponse.json({ error: "Feedback message cannot be empty." }, { status: 400 });
    }

    const feedbackDoc = {
      id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      feedback: feedback.trim(),
      email: (email && typeof email === "string") ? email.trim() : null,
      category: category || "general",
      rating: typeof rating === "number" ? rating : null,
      currentStep: typeof currentStep === "number" ? currentStep : null,
      userAgent: req.headers.get("user-agent") || null,
      createdAt: Date.now(),
    };

    await firestoreDb.collection("user_feedback").doc(feedbackDoc.id).set(feedbackDoc);

    console.log("[Feedback] Logged new user feedback:", feedbackDoc.id, feedbackDoc.category);

    return NextResponse.json({ success: true, id: feedbackDoc.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Feedback] Error saving feedback:", message);
    return NextResponse.json({ error: "Failed to submit feedback." }, { status: 500 });
  }
}
