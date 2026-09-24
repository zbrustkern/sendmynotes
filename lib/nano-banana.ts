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
  provider?: "gemini_imagen" | "nano_banana" | "pollinations_ai" | "preset_fallback";
}

/**
 * AI Image Generator Client
 * Supports:
 * 1. Google Gemini / Imagen 3 (via GEMINI_API_KEY)
 * 2. Nano Banana API (via NANO_BANANA_API_KEY)
 * 3. Curated 5:7 presets fallback for instant offline testing
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

  // 1. Prioritize Google's Imagen 3 if GEMINI_API_KEY is available
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
              aspectRatio: "3:4", // supported portrait aspect ratio (closest to 5:7)
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
          const err = await response.text();
          console.warn(`[Google Imagen ${model}] API error (${response.status}):`, err);
        }
      } catch (err) {
        console.error(`[Google Imagen ${model}] Exception:`, err);
      }
    }
  }

  // 2. Nano Banana API
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

  // 3. Free Instant Real AI Image Generation via Pollinations (Flux / Stable Diffusion)
  // Generates genuine high-resolution 5:7 vertical artwork directly from prompt without requiring API keys
  try {
    const seed = Math.floor(Math.random() * 10000000);
    const safePrompt = encodeURIComponent(refinedPrompt);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${safePrompt}?width=1000&height=1400&nologo=true&seed=${seed}`;

    return {
      imageUrl: pollinationsUrl,
      prompt,
      occasion,
      isMock: true,
      aspectRatio,
      provider: "pollinations_ai",
    };
  } catch (err) {
    console.warn("[AI Generator] Pollinations fallback encountered error:", err);
  }

  // 4. Graceful fallback: Curated card presets matching occasion/prompt
  const matchedByOccasion = CARD_PRESETS.find(
    (p) => p.occasion.toLowerCase() === occasion.toLowerCase()
  );

  const matchedByPrompt = CARD_PRESETS.find((p) =>
    prompt.toLowerCase().split(" ").some((word) => word.length > 3 && p.prompt.toLowerCase().includes(word))
  );

  const selectedPreset: CardPreset = matchedByPrompt || matchedByOccasion || CARD_PRESETS[0];
  const mockImageUrl = `${selectedPreset.imageUrl}&prompt=${encodeURIComponent(prompt.slice(0, 30))}&seed=${Date.now()}`;

  return {
    imageUrl: mockImageUrl,
    prompt,
    occasion,
    isMock: true,
    aspectRatio,
    provider: "preset_fallback",
  };
}
