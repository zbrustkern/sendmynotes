import { CARD_PRESETS, CardPreset } from "./card-presets";

export interface GenerateCoverParams {
  prompt: string;
  occasion?: string;
}

export interface GenerateCoverResult {
  imageUrl: string;
  prompt: string;
  occasion: string;
  isMock: boolean;
  aspectRatio: string;
  provider?: "gemini_imagen" | "nano_banana" | "preset_fallback";
  error?: string;
}

/**
 * AI Image Generator Client
 * 1. Google Gemini / Imagen 3 (via GEMINI_API_KEY / GOOGLE_API_KEY)
 * 2. Nano Banana API (via NANO_BANANA_API_KEY)
 * 3. Fallback: Curated Aster & Blanche 5:7 boutique presets
 */
export async function generateCoverArt(params: GenerateCoverParams): Promise<GenerateCoverResult> {
  const geminiApiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    process.env["gemini-api-key"];
  const nanoApiKey = process.env.NANO_BANANA_API_KEY;
  const prompt = params.prompt.trim();
  const occasion = params.occasion || "Just Because";
  const aspectRatio = "5:7"; // standard 5x7 folded card portrait ratio

  const refinedPrompt = `${prompt}, ${occasion} greeting card cover art, vertical 5:7 portrait orientation, detailed illustration, fine art paper texture, high print resolution`;

  const errors: string[] = [];

  // 1. Prioritize Google's Imagen 3 if API key is available
  if (geminiApiKey) {
    const modelsToTry = [
      "imagen-3.0-generate-002",
      "imagen-3.0-generate-001",
    ];

    for (const model of modelsToTry) {
      try {
        const imagenUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${geminiApiKey}`;
        const response = await fetch(imagenUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": geminiApiKey,
          },
          body: JSON.stringify({
            instances: [{ prompt: refinedPrompt }],
            parameters: {
              sampleCount: 1,
              aspectRatio: "3:4", // closest standard ratio to 5:7
              outputOptions: {
                mimeType: "image/jpeg",
              },
            },
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const prediction = data.predictions?.[0];
          const base64Bytes = prediction?.bytesBase64Encoded || prediction?.image?.bytesBase64Encoded;
          const mimeType = prediction?.mimeType || "image/jpeg";
          if (base64Bytes) {
            const dataUrl = `data:${mimeType};base64,${base64Bytes}`;
            console.log(`[Google Imagen] Successfully generated artwork using ${model}`);
            return {
              imageUrl: dataUrl,
              prompt,
              occasion,
              isMock: false,
              aspectRatio,
              provider: "gemini_imagen",
            };
          }
        } else {
          const errText = await response.text();
          console.warn(`[Google Imagen ${model}] API error (${response.status}):`, errText);
          let parsedMsg = errText;
          try {
            const parsed = JSON.parse(errText);
            parsedMsg = parsed.error?.message || errText;
          } catch {}
          errors.push(`Google Imagen (${response.status}): ${parsedMsg}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Google Imagen ${model}] Exception:`, msg);
        errors.push(`Google Imagen network exception: ${msg}`);
      }
    }
  } else {
    errors.push("GEMINI_API_KEY environment variable was not found in runtime container");
  }

  // 2. Nano Banana API (if configured)
  if (nanoApiKey && !nanoApiKey.includes("your_nano_banana_api_key_here")) {
    try {
      const response = await fetch("https://api.nanobanana.ai/v1/images/generate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${nanoApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: refinedPrompt,
          aspect_ratio: aspectRatio,
          width: 1250,
          height: 1750,
          format: "png",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const imageUrl = data.image_url || data.data?.[0]?.url || data.url;
        if (imageUrl) {
          return {
            imageUrl,
            prompt,
            occasion,
            isMock: false,
            aspectRatio,
            provider: "nano_banana",
          };
        }
      }
      console.warn("[Nano Banana] API returned error or empty response.");
    } catch (error) {
      console.error("[Nano Banana] Failed to call generation API:", error);
    }
  }

  // 3. Fallback: Curated Aster & Blanche 5:7 boutique card presets (No Pollinations)
  const matchedByOccasion = CARD_PRESETS.find(
    (p) => p.occasion.toLowerCase() === occasion.toLowerCase()
  );

  const matchedByPrompt = CARD_PRESETS.find((p) =>
    prompt.toLowerCase().split(" ").some((word) => word.length > 3 && p.prompt.toLowerCase().includes(word))
  );

  const selectedPreset: CardPreset = matchedByPrompt || matchedByOccasion || CARD_PRESETS[0];
  const presetImageUrl = selectedPreset.imageUrl;

  return {
    imageUrl: presetImageUrl,
    prompt,
    occasion,
    isMock: true,
    aspectRatio,
    provider: "preset_fallback",
    error: errors.join(" | "),
  };
}
