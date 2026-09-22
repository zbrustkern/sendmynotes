import { NextRequest, NextResponse } from "next/server";
import { generateCoverArt } from "@/lib/nano-banana";
import { saveImageCacheItem } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = body.prompt;
    const occasion = body.occasion || "General";

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "A valid prompt is required." }, { status: 400 });
    }

    const art = await generateCoverArt({ prompt, occasion });

    // Cache the generated art item in Firestore image_cache_pool
    const cacheId = `cache_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await saveImageCacheItem({
      id: cacheId,
      occasion,
      prompt,
      imageUrl: art.imageUrl,
      status: "AVAILABLE",
      createdAt: Date.now(),
    });

    return NextResponse.json({
      cacheId,
      imageUrl: art.imageUrl,
      prompt: art.prompt,
      occasion: art.occasion,
      isMock: art.isMock,
      aspectRatio: art.aspectRatio,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error generating cover";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
