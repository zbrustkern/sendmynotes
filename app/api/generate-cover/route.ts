import { NextRequest, NextResponse } from "next/server";
import { generateCoverArt } from "@/lib/nano-banana";
import { generateThematicSentiments } from "@/lib/thematic-sentiment";
import { saveImageCacheItem } from "@/lib/firebase-admin";
import { checkRateLimit, refundRateLimit } from "@/lib/rate-limiter";
import { logIncident } from "@/lib/incident-logger";
import { isOperationalControlPaused } from "@/lib/operational-controls";
import { resolveOperationId, withOperationId } from "@/lib/operation-diagnostics";

export async function POST(req: NextRequest) {
  const correlationId = resolveOperationId(req, "generation");
  const startTime = Date.now();

  try {
    if (await isOperationalControlPaused("generation")) {
      return withOperationId(NextResponse.json({ success: false, error: "ART_GENERATION_PAUSED", code: "ART_GENERATION_PAUSED", message: "Custom artwork generation is temporarily unavailable." }, { status: 503 }), correlationId);
    }
    // Determine client identifier for rate limiting
    const forwardedFor = req.headers.get("x-forwarded-for");
    const realIp = req.headers.get("x-real-ip");
    const clientId = (forwardedFor?.split(",")[0] || realIp || "unknown_client").trim();

    // Enforce 5 generations per 10-minute sliding window
    const rateLimit = checkRateLimit(clientId);
    if (!rateLimit.allowed) {
      return withOperationId(NextResponse.json(
        {
          success: false,
          error: "RATE_LIMIT_EXCEEDED",
          code: "RATE_LIMIT_EXCEEDED",
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
      ), correlationId);
    }

    const body = await req.json();
    const prompt = (body.prompt || "").trim();
    const occasion = (body.occasion || "General").trim();

    if (!prompt) {
      return withOperationId(NextResponse.json(
        {
          success: false,
          error: "INVALID_PROMPT",
          code: "INVALID_PROMPT",
          message: "A description of the artwork is required.",
        },
        { status: 400 }
      ), correlationId);
    }

    // Call AI cover generator
    const art = await generateCoverArt({ prompt, occasion });
    const durationMs = Date.now() - startTime;

    // =========================================================================
    // 1. CONTENT POLICY REFUSAL (HTTP 422, unpenalized)
    // =========================================================================
    if (art.kind === "policy_refusal") {
      // Refund rate limit so customer is not penalized for a blocked request
      refundRateLimit(clientId);

      try {
        await logIncident({
          type: "IMAGE_GEN",
          severity: "info",
          summary: `AI prompt policy refusal for occasion "${occasion}"`,
          technicalDetails: art.error,
          metadata: {
            correlationId,
            durationMs,
            occasion,
            provider: art.provider,
            model: art.model,
            finishReason: art.refusalDetails?.finishReason,
          },
        });
      } catch (logErr) {
        console.warn("[GenerateCover] Incident log notice:", logErr);
      }

      return withOperationId(NextResponse.json(
        {
          success: false,
          error: "ART_REQUEST_BLOCKED",
          code: "ART_REQUEST_BLOCKED",
          message: art.userMessage,
          suggestion: art.refusalDetails?.suggestion,
          finishReason: art.refusalDetails?.finishReason,
          presetRecommendation: art.presetRecommendation
            ? {
                id: art.presetRecommendation.id,
                title: art.presetRecommendation.title,
                imageUrl: art.presetRecommendation.imageUrl,
                occasion: art.presetRecommendation.occasion,
              }
            : null,
          remaining: Math.min(rateLimit.limit, rateLimit.remaining + 1),
          limit: rateLimit.limit,
        },
        { status: 422 }
      ), correlationId);
    }

    // =========================================================================
    // 2. CONFIG / AUTH ERROR (HTTP 503)
    // =========================================================================
    if (art.kind === "auth_error") {
      refundRateLimit(clientId);

      try {
        await logIncident({
          type: "IMAGE_GEN",
          severity: "error",
          summary: "AI art generation credential/configuration error",
          technicalDetails: art.error,
          metadata: { correlationId, durationMs },
        });
      } catch {}

      return withOperationId(NextResponse.json(
        {
          success: false,
          error: "ART_PROVIDER_CONFIG_ERROR",
          code: "ART_PROVIDER_CONFIG_ERROR",
          message: art.userMessage,
          presetRecommendation: art.presetRecommendation
            ? {
                id: art.presetRecommendation.id,
                title: art.presetRecommendation.title,
                imageUrl: art.presetRecommendation.imageUrl,
                occasion: art.presetRecommendation.occasion,
              }
            : null,
          remaining: Math.min(rateLimit.limit, rateLimit.remaining + 1),
          limit: rateLimit.limit,
        },
        { status: 503 }
      ), correlationId);
    }

    // =========================================================================
    // 3. PROVIDER UNAVAILABLE / TEMPORARY OUTAGE (HTTP 503)
    // =========================================================================
    if (art.kind === "provider_unavailable") {
      try {
        await logIncident({
          type: "IMAGE_GEN",
          severity: "warning",
          summary: `AI art provider unavailable for "${occasion}"`,
          technicalDetails: art.error,
          metadata: { correlationId, durationMs, occasion },
        });
      } catch {}

      return withOperationId(NextResponse.json(
        {
          success: false,
          error: "ART_PROVIDER_UNAVAILABLE",
          code: "ART_PROVIDER_UNAVAILABLE",
          message: art.userMessage,
          presetRecommendation: art.presetRecommendation
            ? {
                id: art.presetRecommendation.id,
                title: art.presetRecommendation.title,
                imageUrl: art.presetRecommendation.imageUrl,
                occasion: art.presetRecommendation.occasion,
              }
            : null,
          remaining: rateLimit.remaining,
          limit: rateLimit.limit,
        },
        { status: 503 }
      ), correlationId);
    }

    // =========================================================================
    // 4. UNEXPECTED ERROR (HTTP 502)
    // =========================================================================
    if (art.kind === "unexpected_error" || !art.imageUrl) {
      try {
        await logIncident({
          type: "IMAGE_GEN",
          severity: "error",
          summary: `AI art generation unexpected error for "${occasion}"`,
          technicalDetails: art.error,
          metadata: { correlationId, durationMs, occasion },
        });
      } catch {}

      return withOperationId(NextResponse.json(
        {
          success: false,
          error: "ART_GENERATION_FAILED",
          code: "ART_GENERATION_FAILED",
          message:
            art.userMessage ||
            "Unable to generate artwork for this prompt. Please try a different description or choose a ready-made card.",
          presetRecommendation: art.presetRecommendation
            ? {
                id: art.presetRecommendation.id,
                title: art.presetRecommendation.title,
                imageUrl: art.presetRecommendation.imageUrl,
                occasion: art.presetRecommendation.occasion,
              }
            : null,
          remaining: rateLimit.remaining,
          limit: rateLimit.limit,
        },
        { status: 502 }
      ), correlationId);
    }

    // =========================================================================
    // 5. SUCCESS: Custom Artwork Generated
    // =========================================================================
    // Optional thematic sentiment generation (bounded latency, fallback to heuristic)
    let thematic: { sentiments: any[]; themeTag: string } = { sentiments: [], themeTag: occasion };
    try {
      thematic = await generateThematicSentiments({ prompt, occasion });
    } catch (thematicErr) {
      console.warn("[GenerateCover] Thematic sentiment fallback applied:", thematicErr);
    }

    // Cache ONLY real generated artwork in Firestore image_cache_pool
    const cacheId = `cache_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    try {
      await saveImageCacheItem({
        id: cacheId,
        occasion,
        prompt,
        imageUrl: art.imageUrl,
        status: "AVAILABLE",
        createdAt: Date.now(),
        provider: art.provider,
        model: art.model,
        isGenerated: true,
      });
    } catch (cacheErr) {
      // Do not let a cache-write failure erase or fail the generated image returned to user!
      console.warn("[GenerateCover] Cache-write notice:", cacheErr);
    }

    return withOperationId(NextResponse.json({
      success: true,
      cacheId,
      imageUrl: art.imageUrl,
      prompt: art.prompt,
      occasion: art.occasion,
      isMock: false,
      aspectRatio: art.aspectRatio,
      provider: art.provider,
      model: art.model,
      matchedSentiments: thematic.sentiments,
      themeTag: thematic.themeTag,
      remaining: rateLimit.remaining,
      limit: rateLimit.limit,
    }), correlationId);
  } catch (error: unknown) {
    const rawMsg = error instanceof Error ? error.message : "Error generating cover";
    console.error("[Cover Gen Exception]", rawMsg);

    try {
      await logIncident({
        type: "IMAGE_GEN",
        severity: "error",
        summary: "AI Image Generation Unhandled Exception",
        technicalDetails: rawMsg,
        metadata: { correlationId },
      });
    } catch {}

    return withOperationId(NextResponse.json(
      {
        success: false,
        error: "SERVER_ERROR",
        code: "SERVER_ERROR",
        message:
          "Our AI art studio is temporarily busy. Please choose from our curated signature cards or try again shortly.",
      },
      { status: 500 }
    ), correlationId);
  }
}
