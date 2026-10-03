import { NextRequest } from "next/server";
import { getSystemConfig, setSystemConfig } from "./firebase-admin";

export const FEATURE_FLAGS_CONFIG_ID = "feature_flags";

export const FEATURE_FLAG_KEYS = {
  REWORK_V3_EXPERIENCE: "reworkV3Experience",
} as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[keyof typeof FEATURE_FLAG_KEYS] | string;

export interface FeatureFlagsMap {
  reworkV3Experience: boolean;
  [key: string]: boolean;
}

export interface FeatureFlagsDoc {
  flags?: Record<string, boolean>;
  updatedAt?: number;
  updatedBy?: string;
  [key: string]: unknown;
}

export interface FeatureFlagsState {
  flags: FeatureFlagsMap;
  updatedAt?: number;
  updatedBy?: string;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlagsMap = {
  reworkV3Experience: false,
};

export const COOKIE_REWORK_V3 = "smn_rework_v3";
export const QUERY_PARAM_V3 = "v3";

/**
 * Loads the complete feature flags state from Firestore with fallback defaults.
 */
export async function getFeatureFlagsState(): Promise<FeatureFlagsState> {
  try {
    const config = await getSystemConfig<FeatureFlagsDoc>(FEATURE_FLAGS_CONFIG_ID);

    const mergedFlags: FeatureFlagsMap = {
      ...DEFAULT_FEATURE_FLAGS,
    };

    if (config) {
      // 1. Check nested 'flags' object
      if (config.flags && typeof config.flags === "object") {
        for (const [k, v] of Object.entries(config.flags)) {
          if (typeof v === "boolean") {
            mergedFlags[k] = v;
          }
        }
      }

      // 2. Also check top-level booleans (in case config stored them directly)
      for (const [k, v] of Object.entries(config)) {
        if (
          k !== "flags" &&
          k !== "updatedAt" &&
          k !== "updatedBy" &&
          k !== "id" &&
          typeof v === "boolean"
        ) {
          mergedFlags[k] = v;
        }
      }
    }

    return {
      flags: mergedFlags,
      updatedAt: typeof config?.updatedAt === "number" ? config.updatedAt : undefined,
      updatedBy: typeof config?.updatedBy === "string" ? config.updatedBy : undefined,
    };
  } catch (error) {
    console.warn("[getFeatureFlagsState] Error reading feature flags from Firestore, using defaults:", error);
    return {
      flags: { ...DEFAULT_FEATURE_FLAGS },
    };
  }
}

/**
 * Returns all active feature flags from Firestore, merged with default fallbacks.
 */
export async function getFeatureFlags(): Promise<FeatureFlagsMap> {
  const state = await getFeatureFlagsState();
  return state.flags;
}

/**
 * Updates a specific feature flag key in Firestore and returns the updated flag map.
 */
export async function updateFeatureFlag(
  key: string,
  value: boolean,
  updatedBy: string = "system"
): Promise<FeatureFlagsMap> {
  const currentState = await getFeatureFlagsState();
  const updatedFlags: FeatureFlagsMap = {
    ...currentState.flags,
    [key]: Boolean(value),
  };

  const now = Date.now();
  await setSystemConfig(FEATURE_FLAGS_CONFIG_ID, {
    flags: updatedFlags,
    updatedAt: now,
    updatedBy,
  });

  return updatedFlags;
}

export type FeatureFlagRequest =
  | NextRequest
  | Request
  | {
      searchParams?:
        | URLSearchParams
        | Record<string, string | string[] | undefined>
        | { get(name: string): string | null };
      cookies?:
        | Map<string, string>
        | { get(name: string): { value?: string } | string | undefined }
        | Record<string, string | undefined>;
      url?: string;
      headers?: Headers | Record<string, string | undefined> | { get(name: string): string | null };
    }
  | null
  | undefined;

/**
 * Helper to inspect if the SendMyNotes Rework V3 experience should be served.
 * Priority:
 * 1. Query override: ?v3=1 -> true, ?v3=0 -> false
 * 2. Cookie override: smn_rework_v3=1 -> true, smn_rework_v3=0 -> false
 * 3. Firestore system config: reworkV3Experience (default: false)
 */
export async function isReworkV3Enabled(req?: FeatureFlagRequest): Promise<boolean> {
  if (req) {
    // 1. Query override check
    const queryOverride = extractQueryParam(req, QUERY_PARAM_V3);
    if (queryOverride !== null) {
      const normalized = queryOverride.trim().toLowerCase();
      if (normalized === "1" || normalized === "true") {
        return true;
      }
      if (normalized === "0" || normalized === "false") {
        return false;
      }
    }

    // 2. Cookie override check
    const cookieOverride = extractCookie(req, COOKIE_REWORK_V3);
    if (cookieOverride !== null) {
      const normalized = cookieOverride.trim().toLowerCase();
      if (normalized === "1" || normalized === "true") {
        return true;
      }
      if (normalized === "0" || normalized === "false") {
        return false;
      }
    }
  }

  // 3. Fallback to Firestore system config
  const flags = await getFeatureFlags();
  return Boolean(flags[FEATURE_FLAG_KEYS.REWORK_V3_EXPERIENCE]);
}

/**
 * Safely extracts a query parameter from various request shapes (NextRequest, Request, URLSearchParams, plain object).
 */
function extractQueryParam(req: FeatureFlagRequest, paramName: string): string | null {
  if (!req) return null;

  // NextRequest nextUrl searchParams
  if ("nextUrl" in req && req.nextUrl && "searchParams" in req.nextUrl && req.nextUrl.searchParams) {
    return req.nextUrl.searchParams.get(paramName);
  }

  // Explicit searchParams object/instance
  if ("searchParams" in req && req.searchParams) {
    const sp = req.searchParams;
    if (typeof sp.get === "function") {
      return sp.get(paramName);
    }
    if (typeof sp === "object" && !(sp instanceof URLSearchParams)) {
      const val = (sp as Record<string, string | string[] | undefined>)[paramName];
      if (Array.isArray(val)) return val[0] ?? null;
      if (typeof val === "string") return val;
    }
  }

  // Request url string
  if ("url" in req && typeof req.url === "string") {
    try {
      const parsedUrl = new URL(req.url, "http://localhost:3000");
      return parsedUrl.searchParams.get(paramName);
    } catch {
      // ignore parsing failure
    }
  }

  return null;
}

/**
 * Safely extracts a cookie value from various request shapes (NextRequest cookies, Map, object, or Cookie header).
 */
function extractCookie(req: FeatureFlagRequest, cookieName: string): string | null {
  if (!req) return null;

  // NextRequest cookies or custom cookies collection
  if ("cookies" in req && req.cookies) {
    const c = req.cookies;
    if (c instanceof Map) {
      const val = c.get(cookieName);
      return typeof val === "string" ? val : null;
    }
    if (typeof c.get === "function") {
      const res = c.get(cookieName);
      if (res && typeof res === "object" && "value" in res) {
        return typeof res.value === "string" ? res.value : null;
      }
      if (typeof res === "string") {
        return res;
      }
    }
    if (typeof c === "object") {
      const val = (c as Record<string, string | undefined>)[cookieName];
      if (typeof val === "string") return val;
    }
  }

  // Request headers cookie string
  if ("headers" in req && req.headers) {
    let cookieHeader: string | null = null;
    if (typeof req.headers.get === "function") {
      cookieHeader = req.headers.get("cookie");
    } else if (typeof req.headers === "object") {
      cookieHeader = (req.headers as Record<string, string | undefined>)["cookie"] ?? null;
    }

    if (cookieHeader) {
      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`));
      if (match && match[1]) {
        return decodeURIComponent(match[1]);
      }
    }
  }

  return null;
}
