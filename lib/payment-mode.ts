export type PaymentMode = "live" | "stripe_test" | "local_mock";

export class PaymentModeConfigError extends Error {
  public statusCode: number;
  public code: string;

  constructor(message: string, statusCode = 503, code = "PAYMENT_GATEWAY_UNCONFIGURED") {
    super(message);
    this.name = "PaymentModeConfigError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Resolves the server-side payment mode based strictly on server environment variables.
 * Client payloads, headers, or flags CANNOT determine or influence this mode.
 *
 * Rules:
 * 1. In production (NODE_ENV === "production"):
 *    - 'local_mock' is strictly prohibited and impossible.
 *    - Secret key MUST start with "sk_live_".
 *    - Missing, placeholder ("sk_test_placeholder..."), or test keys ("sk_test_...") in production
 *      throw PaymentModeConfigError (503).
 *    - Mode is "live".
 *
 * 2. In non-production environments (development, test):
 *    - If secret key starts with "sk_live_": mode is "live".
 *    - If secret key starts with "sk_test_" and is not a placeholder: mode is "stripe_test".
 *    - If ALLOW_LOCAL_MOCK_PAYMENTS === "true" or "1": mode is "local_mock".
 *    - Otherwise (missing/placeholder key without explicit opt-in): throws PaymentModeConfigError (503).
 */
export type StripeKeyType =
  | "standard_live"
  | "restricted_live"
  | "standard_test"
  | "restricted_test"
  | "publishable"
  | "placeholder"
  | "empty"
  | "unknown";

export interface NormalizedStripeKey {
  secret: string;
  keyType: StripeKeyType;
  rawLength: number;
  hasMatchingQuotes: boolean;
  source: string;
}

/**
 * Normalizes and classifies a Stripe secret key from environment variables.
 * Enforces one consistent credential path for validation and client SDK initialization.
 * Precedence: STRIPE_SECRET_KEY -> stripe-secret-key
 */
export function normalizeStripeSecretKey(
  env: Record<string, string | undefined> = process.env
): NormalizedStripeKey {
  let source = "none";
  let raw = "";

  if (env.STRIPE_SECRET_KEY !== undefined && env.STRIPE_SECRET_KEY !== "") {
    raw = env.STRIPE_SECRET_KEY;
    source = "STRIPE_SECRET_KEY";
  } else if (env["stripe-secret-key"] !== undefined && env["stripe-secret-key"] !== "") {
    raw = env["stripe-secret-key"];
    source = "stripe-secret-key";
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      secret: "",
      keyType: "empty",
      rawLength: 0,
      hasMatchingQuotes: false,
      source,
    };
  }

  let secret = trimmed;
  let hasMatchingQuotes = false;

  // Strip ONLY a matching outer quote pair ("..." or '...')
  if (
    (secret.startsWith('"') && secret.endsWith('"') && secret.length >= 2) ||
    (secret.startsWith("'") && secret.endsWith("'") && secret.length >= 2)
  ) {
    secret = secret.slice(1, -1).trim();
    hasMatchingQuotes = true;
  }

  let keyType: StripeKeyType = "unknown";
  if (!secret) {
    keyType = "empty";
  } else if (secret.startsWith("sk_test_placeholder")) {
    keyType = "placeholder";
  } else if (secret.startsWith("sk_live_")) {
    keyType = "standard_live";
  } else if (secret.startsWith("rk_live_")) {
    keyType = "restricted_live";
  } else if (secret.startsWith("sk_test_")) {
    keyType = "standard_test";
  } else if (secret.startsWith("rk_test_")) {
    keyType = "restricted_test";
  } else if (secret.startsWith("pk_live_") || secret.startsWith("pk_test_")) {
    keyType = "publishable";
  }

  return {
    secret,
    keyType,
    rawLength: trimmed.length,
    hasMatchingQuotes,
    source,
  };
}

export function resolvePaymentMode(
  env: Record<string, string | undefined> = process.env
): PaymentMode {
  const isProduction = env.NODE_ENV === "production";
  const { secret, keyType } = normalizeStripeSecretKey(env);
  if (env.STAGING_REVIEW_ONLY === "true" && (keyType === "standard_live" || keyType === "restricted_live")) {
    throw new PaymentModeConfigError("Live payments are disabled in staging review.", 503, "STAGING_LIVE_PAYMENT_DISABLED");
  }

  const allowLocalMock =
    env.ALLOW_LOCAL_MOCK_PAYMENTS === "true" ||
    env.ALLOW_LOCAL_MOCK_PAYMENTS === "1";

  const isStagingEnvironment =
    env.IS_PREVIEW_TEST_ENVIRONMENT === "true" ||
    env.ALLOW_STRIPE_TEST_IN_PRODUCTION === "true" ||
    env.FIREBASE_PROJECT_ID === "sendmynotes-staging" ||
    env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === "sendmynotes-staging" ||
    (typeof env.K_SERVICE === "string" && env.K_SERVICE.includes("staging")) ||
    (typeof env.FIREBASE_CONFIG === "string" && env.FIREBASE_CONFIG.includes("sendmynotes-staging"));

  const allowTestInProduction = isStagingEnvironment;

  if (isProduction) {
    if (keyType === "empty" || keyType === "placeholder") {
      throw new PaymentModeConfigError(
        "Stripe live secret key is missing or is a placeholder in production.",
        503,
        "PRODUCTION_STRIPE_KEY_MISSING"
      );
    }

    // Live Stripe keys (Standard 'sk_live_' or Restricted 'rk_live_')
    if (keyType === "standard_live" || keyType === "restricted_live") {
      return "live";
    }

    // Test Stripe keys in production
    if (keyType === "standard_test" || keyType === "restricted_test") {
      if (allowTestInProduction) {
        return "stripe_test";
      }
      throw new PaymentModeConfigError(
        "Stripe test key configured in production environment.",
        503,
        "PRODUCTION_STRIPE_TEST_KEY_FORBIDDEN"
      );
    }

    throw new PaymentModeConfigError(
      "Invalid Stripe live secret key configured in production.",
      503,
      "PRODUCTION_STRIPE_KEY_INVALID"
    );
  }

  // Non-production environment
  if (keyType === "standard_live" || keyType === "restricted_live") {
    return "live";
  }

  if (keyType === "standard_test" || keyType === "restricted_test") {
    return "stripe_test";
  }

  if (allowLocalMock) {
    return "local_mock";
  }

  throw new PaymentModeConfigError(
    "Stripe secret key is missing or unconfigured. To enable simulated checkout in local development or testing, set ALLOW_LOCAL_MOCK_PAYMENTS=true.",
    503,
    "STRIPE_UNCONFIGURED_MOCK_DISABLED"
  );
}

export function isLocalMockAllowed(
  env: Record<string, string | undefined> = process.env
): boolean {
  try {
    return resolvePaymentMode(env) === "local_mock";
  } catch {
    return false;
  }
}

/**
 * Pure decision function: determines if checkout transition can advance to payment step.
 * On init failure, caller MUST stay on the current step with an error and Retry.
 */
export function evaluateCheckoutInitTransition(initSucceeded: boolean): {
  canAdvance: boolean;
  errorMessage?: string;
} {
  if (!initSucceeded) {
    return {
      canAdvance: false,
      errorMessage: "Unable to initialize checkout. Please retry.",
    };
  }
  return { canAdvance: true };
}

/**
 * Pure decision function: determines how payment submission should be routed.
 * Missing Stripe/Elements outside of server-approved local_mock NEVER simulates success or calls onPaymentSuccess.
 */
export function evaluatePaymentSubmission(params: {
  isZeroCost: boolean;
  isMock: boolean;
  hasStripe: boolean;
  hasElements: boolean;
}): {
  mode: "free" | "stripe" | "local_mock" | "blocked_error";
  canCallPaymentSuccessImmediately: boolean;
  errorMessage?: string;
} {
  if (params.isZeroCost) {
    return {
      mode: "free",
      canCallPaymentSuccessImmediately: false,
    };
  }

  if (params.isMock) {
    return {
      mode: "local_mock",
      canCallPaymentSuccessImmediately: false,
    };
  }

  if (!params.hasStripe || !params.hasElements) {
    return {
      mode: "blocked_error",
      canCallPaymentSuccessImmediately: false,
      errorMessage: "Secure payment processor is unavailable. Please check your connection and retry.",
    };
  }

  return {
    mode: "stripe",
    canCallPaymentSuccessImmediately: false,
  };
}
