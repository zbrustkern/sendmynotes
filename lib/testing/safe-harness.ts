/**
 * lib/testing/safe-harness.ts
 *
 * Safe test harness for SendMyNotes test suites (SPRINT-0001-T05).
 * Enforces production safety by:
 * 1. Setting safe environment flags (HANDWRYTTEN_SANDBOX_MODE=true,
 *    STRIPE_PAYMENT_MODE=test, DISABLE_LIVE_EXTERNAL_EFFECTS=true).
 * 2. Monkey-patching globalThis.fetch to block all outbound external network
 *    calls to production APIs (Handwrytten, Stripe, Resend, Meta Graph, etc.).
 * 3. Permitting local/in-memory fakes or registered fake mock handlers.
 * 4. Tracking all blocked attempts and throwing ExternalEffectDeniedError.
 *
 * Reference: docs/sprints/SPRINT-0001.md, AGENTS.md
 */

export class ExternalEffectDeniedError extends Error {
  public readonly targetUrl: string;
  public readonly method: string;

  constructor(targetUrl: string, method: string = "GET") {
    super(
      `[SafeTestHarness] Access to live external effect denied: ${method} ${targetUrl}. Production operations and billable supplier calls are prohibited in tests.`
    );
    this.name = "ExternalEffectDeniedError";
    this.targetUrl = targetUrl;
    this.method = method;
  }
}

export interface BlockedExternalCall {
  url: string;
  method: string;
  timestamp: number;
  stack?: string;
}

export type FakeResponseHandler = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response> | Response;

interface RegisteredFake {
  matcher: string | RegExp | ((url: string) => boolean);
  handler: FakeResponseHandler;
}

// Internal state
let isInstalled = false;
let originalFetch: typeof globalThis.fetch | null = null;
let originalEnvSnapshot: Record<string, string | undefined> = {};
const blockedCalls: BlockedExternalCall[] = [];
const registeredFakes: RegisteredFake[] = [];

/**
 * List of prohibited external domains and substrings.
 */
const PROHIBITED_DOMAINS = [
  "api.handwrytten.com",
  "handwrytten.com",
  "api.stripe.com",
  "stripe.com",
  "api.resend.com",
  "resend.com",
  "graph.facebook.com",
  "facebook.com",
  "google-analytics.com",
  "analytics.google.com",
  "googletagmanager.com",
];

function isExternalProhibitedUrl(urlStr: string): boolean {
  // Allow relative URLs, local paths, and localhost / 127.0.0.1
  if (urlStr.startsWith("/") || urlStr.startsWith("./") || urlStr.startsWith("../")) {
    return false;
  }

  try {
    const parsed = new URL(urlStr, "http://localhost:3000");
    const hostname = parsed.hostname.toLowerCase();

    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith(".localhost")
    ) {
      return false;
    }

    for (const domain of PROHIBITED_DOMAINS) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return true;
      }
    }

    // Default policy: Any other external non-localhost HTTP(S) request is prohibited in test harness
    return true;
  } catch {
    // If URL parsing fails, check substring matching defensively
    for (const domain of PROHIBITED_DOMAINS) {
      if (urlStr.includes(domain)) {
        return true;
      }
    }
    return false;
  }
}

/**
 * Installs the safe test harness, configuring safe environment variables
 * and intercepting outbound network requests.
 */
export function installSafeTestHarness(): void {
  if (isInstalled) {
    return;
  }

  // 1. Snapshot and set environment flags
  originalEnvSnapshot = {
    HANDWRYTTEN_SANDBOX_MODE: process.env.HANDWRYTTEN_SANDBOX_MODE,
    HANDWRYTTEN_TEST_MODE: process.env.HANDWRYTTEN_TEST_MODE,
    STRIPE_PAYMENT_MODE: process.env.STRIPE_PAYMENT_MODE,
    DISABLE_LIVE_EXTERNAL_EFFECTS: process.env.DISABLE_LIVE_EXTERNAL_EFFECTS,
    NODE_ENV: process.env.NODE_ENV,
  };

  process.env.HANDWRYTTEN_SANDBOX_MODE = "true";
  process.env.HANDWRYTTEN_TEST_MODE = "true";
  process.env.STRIPE_PAYMENT_MODE = "test";
  process.env.DISABLE_LIVE_EXTERNAL_EFFECTS = "true";

  // 2. Monkey-patch globalThis.fetch
  originalFetch = globalThis.fetch;

  globalThis.fetch = async function safeFetch(
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> {
    const urlStr =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

    const method =
      init?.method ||
      (input instanceof Request ? input.method : "GET");

    // Check if there is an explicit registered fake handler
    for (const fake of registeredFakes) {
      let matches = false;
      if (typeof fake.matcher === "string") {
        matches = urlStr.includes(fake.matcher);
      } else if (fake.matcher instanceof RegExp) {
        matches = fake.matcher.test(urlStr);
      } else if (typeof fake.matcher === "function") {
        matches = fake.matcher(urlStr);
      }

      if (matches) {
        return fake.handler(input, init);
      }
    }

    // If it's a prohibited external call, record attempt and deny
    if (isExternalProhibitedUrl(urlStr)) {
      const blockedCall: BlockedExternalCall = {
        url: urlStr,
        method: method.toUpperCase(),
        timestamp: Date.now(),
        stack: new Error().stack,
      };
      blockedCalls.push(blockedCall);

      throw new ExternalEffectDeniedError(urlStr, method.toUpperCase());
    }

    // Local / unblocked fetch delegation
    if (originalFetch) {
      return originalFetch(input, init);
    }

    throw new Error(
      `[SafeTestHarness] No underlying fetch implementation found for ${urlStr}`
    );
  };

  isInstalled = true;
}

/**
 * Restores original environment variables, clears fakes, and unpatches globalThis.fetch.
 */
export function uninstallSafeTestHarness(): void {
  if (!isInstalled) {
    return;
  }

  // Restore fetch
  if (originalFetch) {
    globalThis.fetch = originalFetch;
    originalFetch = null;
  }

  // Restore environment variables
  for (const [key, val] of Object.entries(originalEnvSnapshot)) {
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }
  originalEnvSnapshot = {};

  // Clear fakes and blocked calls
  registeredFakes.length = 0;
  blockedCalls.length = 0;

  isInstalled = false;
}

/**
 * Registers an in-memory fake handler for a matching URL pattern.
 */
export function registerFakeHandler(
  matcher: string | RegExp | ((url: string) => boolean),
  handler: FakeResponseHandler
): () => void {
  const item: RegisteredFake = { matcher, handler };
  registeredFakes.push(item);
  return () => {
    const idx = registeredFakes.indexOf(item);
    if (idx !== -1) {
      registeredFakes.splice(idx, 1);
    }
  };
}

/**
 * Returns a read-only list of all external calls that were blocked during the session.
 */
export function getBlockedExternalCalls(): ReadonlyArray<BlockedExternalCall> {
  return [...blockedCalls];
}

/**
 * Clears the record of blocked external calls.
 */
export function clearBlockedCalls(): void {
  blockedCalls.length = 0;
}

/**
 * Helper to execute a synchronous or asynchronous test function within
 * an isolated safe test harness lifecycle.
 */
export async function withSafeTestHarness<T>(fn: () => Promise<T> | T): Promise<T> {
  installSafeTestHarness();
  try {
    return await fn();
  } finally {
    uninstallSafeTestHarness();
  }
}
