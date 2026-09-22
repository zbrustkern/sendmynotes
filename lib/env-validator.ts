/**
 * Runtime Environment and Secrets Validator
 * Enforces strict boundary separation between public frontend and sensitive backend secrets.
 */

export interface EnvStatus {
  isProduction: boolean;
  stripeSecretConfigured: boolean;
  stripeWebhookConfigured: boolean;
  handwryttenConfigured: boolean;
  aiProviderConfigured: "gemini_imagen" | "nano_banana" | "mock_fallback";
  firebaseConfigured: boolean;
  leaksDetected: string[];
}

export function validateEnvironment(): EnvStatus {
  const isProduction = process.env.NODE_ENV === "production";

  // Check for dangerous client-side leakage (private secrets prefixed with NEXT_PUBLIC_)
  const leaksDetected: string[] = [];
  Object.keys(process.env).forEach((key) => {
    if (key.startsWith("NEXT_PUBLIC_")) {
      const lower = key.toLowerCase();
      if (
        lower.includes("secret") ||
        lower.includes("private") ||
        (lower.includes("handwrytten") && lower.includes("key")) ||
        (lower.includes("gemini") && lower.includes("key"))
      ) {
        leaksDetected.push(key);
      }
    }
  });

  if (leaksDetected.length > 0) {
    const errorMsg = `[CRITICAL SECURITY WARNING] Sensitive secret keys detected with NEXT_PUBLIC_ prefix: ${leaksDetected.join(
      ", "
    )}. These keys are exposed to every web browser. Remove NEXT_PUBLIC_ immediately!`;
    console.error(errorMsg);
    if (isProduction) {
      throw new Error(errorMsg);
    }
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const stripeSecretConfigured = Boolean(
    stripeSecret && !stripeSecret.startsWith("sk_test_placeholder")
  );

  const stripeWebhook = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeWebhookConfigured = Boolean(
    stripeWebhook && !stripeWebhook.startsWith("whsec_placeholder")
  );

  const handwryttenKey = process.env.HANDWRYTTEN_API_KEY;
  const handwryttenConfigured = Boolean(
    handwryttenKey && handwryttenKey.trim().length > 0
  );

  let aiProvider: EnvStatus["aiProviderConfigured"] = "mock_fallback";
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0) {
    aiProvider = "gemini_imagen";
  } else if (process.env.NANO_BANANA_API_KEY && process.env.NANO_BANANA_API_KEY.trim().length > 0) {
    aiProvider = "nano_banana";
  }

  const firebaseConfigured = Boolean(
    process.env.FIREBASE_PROJECT_ID || process.env.K_SERVICE // Cloud Run environment
  );

  return {
    isProduction,
    stripeSecretConfigured,
    stripeWebhookConfigured,
    handwryttenConfigured,
    aiProviderConfigured: aiProvider,
    firebaseConfigured,
    leaksDetected,
  };
}
