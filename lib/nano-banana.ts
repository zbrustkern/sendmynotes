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
}

/**
 * Nano Banana AI Image Generator Client
 * Generates 5:7 portrait greeting card illustrations.
 * Falls back to high-res curated card art when API key is not configured.
 */
export async function generateCoverArt(params: GenerateCoverParams): Promise<GenerateCoverResult> {
  const apiKey = process.env.NANO_BANANA_API_KEY;
  const prompt = params.prompt.trim();
  const occasion = params.occasion || "Just Because";
  const aspectRatio = "5:7"; // standard 5x7 folded card portrait ratio

  // Format refined prompt tailored for physical 5x7 folded greeting card printing
  const refinedPrompt = `${prompt}, ${occasion} greeting card cover art, vertical 5:7 portrait orientation, detailed illustration, fine art paper texture, high print resolution`;

  if (apiKey) {
    try {
      const response = await fetch("https://api.nanobanana.ai/v1/images/generate", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
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
          };
        }
      }
      console.warn("[Nano Banana] API returned error or empty response, falling back to curated preset pool.");
    } catch (error) {
      console.error("[Nano Banana] Failed to call generation API:", error);
    }
  }

  // Graceful fallback: Select the closest curated preset or pick based on occasion
  const matchedByOccasion = CARD_PRESETS.find(
    (p) => p.occasion.toLowerCase() === occasion.toLowerCase()
  );

  const matchedByPrompt = CARD_PRESETS.find((p) =>
    prompt.toLowerCase().split(" ").some((word) => word.length > 3 && p.prompt.toLowerCase().includes(word))
  );

  const selectedPreset: CardPreset = matchedByPrompt || matchedByOccasion || CARD_PRESETS[0];

  // In mock mode, we append a timestamp or salt query param to allow preview refreshes
  const mockImageUrl = `${selectedPreset.imageUrl}&prompt=${encodeURIComponent(prompt.slice(0, 30))}`;

  return {
    imageUrl: mockImageUrl,
    prompt,
    occasion,
    isMock: true,
    aspectRatio,
  };
}
