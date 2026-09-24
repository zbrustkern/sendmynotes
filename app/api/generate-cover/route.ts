import { NextRequest, NextResponse } from "next/server";
import { generateCoverArt } from "@/lib/nano-banana";
import { saveImageCacheItem } from "@/lib/firebase-admin";
import { checkRateLimit } from "@/lib/rate-limiter";
import { logIncident } from "@/lib/incident-logger";

export async function POST(req: NextRequest) {
  try {
    // Determine client identifier for rate limiting
    const forwardedFor = req.headers.get("x-forwarded-for");
    const realIp = req.headers.get("x-real-ip");
    const clientId = (forwardedFor?.split(",")[0] || realIp || "unknown_client").trim();

    // Enforce 5 generations per 10-minute sliding window
    const rateLimit = checkRateLimit(clientId);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit reached",
          message: rateLimit.message,
          retryAfterSeconds: rateLimit.retryAfterSeconds,
          remaining: 0,
          limit: rateLimit.limit,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

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

    // If external AI provider had errors, record in admin incident feed
    if (art.error) {
      await logIncident({
        type: "IMAGE_GEN",
        severity: "warning",
        summary: `AI cover generation fell back to signature preset for "${occasion}"`,
        technicalDetails: art.error,
        metadata: { prompt, occasion, provider: art.provider },
      });
    }

    return NextResponse.json({
      cacheId,
      imageUrl: art.imageUrl,
      prompt: art.prompt,
      occasion: art.occasion,
      isMock: art.isMock,
      aspectRatio: art.aspectRatio,
      provider: art.provider,
      fallbackNotice: art.isMock ? "Selected from our Aster & Blanche signature cards." : null,
      remaining: rateLimit.remaining,
      limit: rateLimit.limit,
    });
  } catch (error: unknown) {
    const rawMsg = error instanceof Error ? error.message : "Error generating cover";
    console.error("[Cover Gen Exception]", rawMsg);

    await logIncident({
      type: "IMAGE_GEN",
      severity: "error",
      summary: "AI Image Generation Exception",
      technicalDetails: rawMsg,
    });

    return NextResponse.json(
      {
        error:
          "Our AI studio artist is briefly resting. Please choose from our curated signature cards below or try again in a moment.",
      },
      { status: 500 }
    );
  }
}
