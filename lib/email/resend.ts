import { Resend } from "resend";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

let cachedApiKey: string | null = null;
let gsmClient: SecretManagerServiceClient | null = null;
let resendSingleton: Resend | null = null;

/**
 * Retrieves the Resend API key securely.
 * Checks memory cache first, then queries Google Secret Manager under `resend-key`,
 * falling back to `process.env.RESEND_API_KEY` for local development.
 */
export async function getResendApiKey(): Promise<string | null> {
  if (cachedApiKey) {
    return cachedApiKey;
  }

  // 1. Try Google Secret Manager ('resend-key')
  try {
    if (!gsmClient) {
      gsmClient = new SecretManagerServiceClient();
    }
    const projectId =
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.FIREBASE_PROJECT_ID ||
      process.env.GCP_PROJECT ||
      "sendmynotes-2a417";
    const secretPath = `projects/${projectId}/secrets/resend-key/versions/latest`;
    const [version] = await gsmClient.accessSecretVersion({ name: secretPath });
    const secretValue = version.payload?.data?.toString();
    if (secretValue && secretValue.trim()) {
      cachedApiKey = secretValue.trim();
      return cachedApiKey;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("Could not refresh access token") && !msg.includes("not allowed by policy")) {
      console.warn(`[Resend GSM] Notice: Could not retrieve 'resend-key' from GSM (${msg}). Checking fallback env.`);
    }
  }

  // 2. Fall back to process.env.RESEND_API_KEY for local development or App Hosting runtime injection
  const fallbackKey =
    process.env.RESEND_API_KEY ||
    process.env["resend-key"] ||
    process.env["resend-api-key"];

  if (fallbackKey && fallbackKey.trim()) {
    cachedApiKey = fallbackKey.trim();
    return cachedApiKey;
  }

  console.warn(
    "[Resend] Warning: 'resend-key' is unavailable in both Google Secret Manager and process.env.RESEND_API_KEY. Transactional emails will run in safe simulation mode."
  );
  return null;
}

/**
 * Lazily resolves and returns the singleton Resend client instance.
 * Gracefully logs a warning and returns null if the secret cannot be fetched,
 * preventing server boot crashes.
 */
export async function getResendClient(): Promise<Resend | null> {
  if (resendSingleton) {
    return resendSingleton;
  }

  const apiKey = await getResendApiKey();
  if (!apiKey) {
    return null;
  }

  resendSingleton = new Resend(apiKey);
  return resendSingleton;
}

// Eager initialization attempt if env key is available at boot (without throwing if missing)
if (process.env.RESEND_API_KEY) {
  try {
    cachedApiKey = process.env.RESEND_API_KEY.trim();
    resendSingleton = new Resend(cachedApiKey);
  } catch (bootErr) {
    console.warn("[Resend] Safe boot init notice:", bootErr);
  }
}

/**
 * Exported singleton Resend client safely wrapped in a transparent proxy.
 * Safe to import and reference anywhere at boot time without crashing.
 * Dynamically resolves GSM/env credentials upon method execution.
 */
export const resend: Resend = new Proxy({} as Resend, {
  get(_target, prop) {
    if (prop === "emails") {
      return {
        send: async (payload: any) => {
          if (process.env.STAGING_REVIEW_ONLY === "true") return { data: null, error: { name: "staging_review_only", message: "Email delivery is disabled in staging review." } };
          const client = await getResendClient();
          if (!client) {
            console.warn(
              `[Resend Simulation] No API key available. Would send email to: ${payload?.to} with subject: "${payload?.subject}"`
            );
            return {
              data: { id: `sim_${Date.now()}` },
              error: null,
            };
          }
          if (cachedApiKey && (cachedApiKey.startsWith("re_mock") || cachedApiKey.startsWith("mock_"))) {
            console.log(
              `[Resend Mock Simulation] Mock key active. Simulating email send to: ${payload?.to} with subject: "${payload?.subject}"`
            );
            return {
              data: { id: `mock_${Date.now()}` },
              error: null,
            };
          }
          return client.emails.send(payload);
        },
      };
    }
    return async (...args: any[]) => {
      const client = await getResendClient();
      if (!client) {
        console.warn(`[Resend Simulation] Method '${String(prop)}' invoked without configured client.`);
        return { data: null, error: { message: "Resend client not configured", name: "missing_api_key" } };
      }
      const member = (client as any)[prop];
      if (typeof member === "function") {
        return member.apply(client, args);
      }
      return member;
    };
  },
});

export default resend;
