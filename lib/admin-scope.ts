/**
 * lib/admin-scope.ts
 *
 * Core administration scope model, URL serialization/parsing, evidence navigation,
 * and stale-request race guards for the SendMyNotes Admin Portal (SPRINT-0006).
 *
 * References:
 * - docs/sprints/SPRINT-0006.md (T01, T03)
 * - docs/ADMIN_PORTAL_OVERHAUL_SPEC_2026-10-18.md
 * - lib/contracts/admin-overhaul.ts (DEFAULT_ADMIN_TIMEZONE, REPORTING_POLICY_VERSION)
 */

import { DEFAULT_ADMIN_TIMEZONE, GlobalReportScope } from "./contracts/admin-overhaul";
import type { ExecutiveReportingOverview } from "./reporting-engine";

export type { ExecutiveReportingOverview, ExecutiveReportingOverview as ExecutiveOverviewReport };

export type AdminWorkspaceId =
  | "overview"
  | "growth"
  | "promotions"
  | "journeys"
  | "orders"
  | "reliability"
  | "controls"
  | "economics";

export interface WorkspaceDefinition {
  id: AdminWorkspaceId;
  label: string;
  shortLabel: string;
  description: string;
  iconName: string;
}

export const ADMIN_WORKSPACES: readonly WorkspaceDefinition[] = [
  {
    id: "overview",
    label: "Executive Overview",
    shortLabel: "Overview",
    description: "Compact executive KPI scorecard, complete observed funnel, and ranked actionable exceptions.",
    iconName: "LayoutDashboard",
  },
  {
    id: "growth",
    label: "Growth & Acquisition",
    shortLabel: "Growth",
    description: "Full-cohort campaign attribution, dated ad spend imports, CAC/ROAS economics, and landing page scenarios.",
    iconName: "TrendingUp",
  },
  {
    id: "promotions",
    label: "Promotions & Offers",
    shortLabel: "Promotions",
    description: "Promotional discount lifecycle, redemption quotas, reservation locks, and compensation codes.",
    iconName: "Tag",
  },
  {
    id: "journeys",
    label: "Visitor Journeys",
    shortLabel: "Journeys",
    description: "Observed visitor sessions, step-by-step milestones, active carts, and draft resume tracking.",
    iconName: "Users",
  },
  {
    id: "orders",
    label: "Orders & Fulfillment",
    shortLabel: "Orders",
    description: "Authoritative order ledger, real-ink pen dispatch status, address deferrals, and proof inspection.",
    iconName: "Package",
  },
  {
    id: "reliability",
    label: "Reliability & Alerts",
    shortLabel: "Reliability",
    description: "Telemetry collector health, supplier API latency, transactional outbox status, and system incidents.",
    iconName: "ShieldAlert",
  },
  {
    id: "controls",
    label: "Controls & Overrides",
    shortLabel: "Controls",
    description: "Feature flags, founder device registry, emergency maintenance killswitches, and audit log.",
    iconName: "Sliders",
  },
  {
    id: "economics",
    label: "Economics & Ledgers",
    shortLabel: "Economics",
    description: "Financial fact ledger, Stripe processing fees, supplier cost allocations, and reconciliation queue.",
    iconName: "DollarSign",
  },
] as const;

export type DatePreset = "today" | "7d" | "30d" | "since_oct13" | "all" | "custom";

export interface AdminGlobalScope {
  workspace: AdminWorkspaceId;
  environment: "production" | "staging" | "development" | "test";
  timezone: string;
  datePreset: DatePreset;
  window?: DatePreset;
  customFrom?: string;
  from?: string;
  customTo?: string;
  to?: string;
  comparePrevious: boolean;
  mode: "customer_reporting" | "operational_all";
  channel: "all" | "paid" | "google_cpc" | "meta_paid" | "organic_direct";
  device: "all" | "mobile" | "desktop" | "tablet";
  inAppBrowserOnly: boolean;
  drilldownMetric?: string;
  drilldownStage?: string;
  drilldownChannel?: string;
  drilldownExceptionId?: string;
  orderId?: string;
}

export const DEFAULT_ADMIN_GLOBAL_SCOPE: AdminGlobalScope = {
  workspace: "overview",
  environment: "production",
  timezone: DEFAULT_ADMIN_TIMEZONE,
  datePreset: "since_oct13",
  window: "since_oct13",
  comparePrevious: true,
  mode: "customer_reporting",
  channel: "all",
  device: "all",
  inAppBrowserOnly: false,
};

// ----------------------------------------------------------------------------
// URL Parsing & Serialization
// ----------------------------------------------------------------------------

export function parseAdminGlobalScope(
  searchParams?: string | URLSearchParams | Record<string, string | string[] | undefined>
): AdminGlobalScope {
  let paramsObj: URLSearchParams | Record<string, string | string[] | undefined> = {};
  if (typeof searchParams === "string") {
    const trimmed = searchParams.startsWith("?") ? searchParams.slice(1) : searchParams;
    paramsObj = new URLSearchParams(trimmed);
  } else if (searchParams) {
    paramsObj = searchParams;
  }

  const getParam = (key: string): string | undefined => {
    if (paramsObj instanceof URLSearchParams) {
      return paramsObj.get(key) || undefined;
    }
    const val = paramsObj[key];
    if (Array.isArray(val)) return val[0];
    return val || undefined;
  };

  // 1. Resolve Workspace (with legacy tab mapping)
  const rawWorkspace = (getParam("workspace") || getParam("tab") || getParam("view") || "").toLowerCase().trim();
  let workspace: AdminWorkspaceId = "overview";

  switch (rawWorkspace) {
    case "orders":
    case "command_center":
      workspace = "orders";
      break;
    case "growth":
    case "campaigns":
    case "scenarios":
      workspace = "growth";
      break;
    case "promotions":
    case "promos":
    case "discounts":
      workspace = "promotions";
      break;
    case "journeys":
    case "abandoned":
    case "sessions":
    case "telemetry":
      workspace = "journeys";
      break;
    case "reliability":
    case "incidents":
    case "health":
      workspace = "reliability";
      break;
    case "controls":
    case "flags":
    case "settings":
      workspace = "controls";
      break;
    case "economics":
    case "margins":
    case "financials":
    case "ledger":
      workspace = "economics";
      break;
    case "overview":
    default:
      workspace = "overview";
      break;
  }

  // 2. Date Preset
  const rawDateRange = (getParam("datePreset") || getParam("dateRange") || "").toLowerCase().trim();
  let datePreset: DatePreset = "since_oct13";
  if (rawDateRange === "today") datePreset = "today";
  else if (rawDateRange === "7d") datePreset = "7d";
  else if (rawDateRange === "30d") datePreset = "30d";
  else if (rawDateRange === "all") datePreset = "all";
  else if (rawDateRange === "custom") datePreset = "custom";
  else if (rawDateRange === "oct13" || rawDateRange === "since_oct13") datePreset = "since_oct13";

  // 3. Classification Mode & Founder Exclusion
  const rawMode = (getParam("mode") || "").toLowerCase().trim();
  const rawExcludeFounder = getParam("excludeFounder");
  let mode: "customer_reporting" | "operational_all" = "customer_reporting";
  if (rawMode === "operational_all" || rawExcludeFounder === "false") {
    mode = "operational_all";
  } else {
    mode = "customer_reporting";
  }

  // 4. Channel filter
  const rawChannel = (getParam("channel") || "all").toLowerCase().trim();
  let channel: AdminGlobalScope["channel"] = "all";
  if (rawChannel === "paid") channel = "paid";
  else if (rawChannel === "google_cpc" || rawChannel === "google cpc") channel = "google_cpc";
  else if (rawChannel === "meta_paid" || rawChannel === "meta paid") channel = "meta_paid";
  else if (rawChannel === "organic_direct") channel = "organic_direct";

  // 5. Device filter
  const rawDevice = (getParam("device") || "all").toLowerCase().trim();
  let device: AdminGlobalScope["device"] = "all";
  if (rawDevice === "mobile") device = "mobile";
  else if (rawDevice === "desktop") device = "desktop";
  else if (rawDevice === "tablet") device = "tablet";

  const customFrom = getParam("from") || getParam("customFrom");
  const customTo = getParam("to") || getParam("customTo");
  const orderId = getParam("orderId") || getParam("order");
  const defaultEnvironment = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.includes("staging") || (typeof window !== "undefined" && window.location.hostname.includes("staging")) ? "staging" : "production";
  const rawEnvironment = (getParam("environment") || defaultEnvironment).toLowerCase().trim();
  const environment: AdminGlobalScope["environment"] =
    rawEnvironment === "production" || rawEnvironment === "staging" ||
    rawEnvironment === "development" || rawEnvironment === "test"
      ? rawEnvironment
      : "production";
  const rawTimezone = getParam("timezone") || DEFAULT_ADMIN_TIMEZONE;
  let timezone = DEFAULT_ADMIN_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: rawTimezone });
    timezone = rawTimezone;
  } catch {
    // Use the documented default when the URL contains an invalid timezone.
  }

  return {
    workspace,
    environment,
    timezone,
    datePreset,
    window: datePreset,
    customFrom,
    from: customFrom,
    customTo,
    to: customTo,
    comparePrevious: getParam("comparePrevious") !== "false",
    mode,
    channel,
    device,
    inAppBrowserOnly: getParam("inApp") === "true" || getParam("inAppBrowserOnly") === "true",
    drilldownMetric: getParam("drilldownMetric"),
    drilldownStage: getParam("drilldownStage"),
    drilldownChannel: getParam("drilldownChannel"),
    drilldownExceptionId: getParam("drilldownExceptionId"),
    orderId,
  };
}

export function serializeAdminGlobalScope(scope: AdminGlobalScope): string {
  const params = new URLSearchParams();

  if (scope.environment && scope.environment !== "production") params.set("environment", scope.environment);
  if (scope.timezone && scope.timezone !== DEFAULT_ADMIN_GLOBAL_SCOPE.timezone) params.set("timezone", scope.timezone);

  if (scope.workspace && scope.workspace !== "overview") {
    params.set("workspace", scope.workspace);
  }

  const effectivePreset = scope.datePreset || scope.window;
  if (effectivePreset && effectivePreset !== "since_oct13") {
    params.set("datePreset", effectivePreset);
  }

  if (effectivePreset === "custom") {
    const fromVal = scope.customFrom || scope.from;
    const toVal = scope.customTo || scope.to;
    if (fromVal) params.set("from", fromVal);
    if (toVal) params.set("to", toVal);
  }

  if (scope.orderId) {
    params.set("orderId", scope.orderId);
  }

  if (scope.mode === "operational_all") {
    params.set("mode", "operational_all");
    params.set("excludeFounder", "false");
  }

  if (scope.channel && scope.channel !== "all") {
    params.set("channel", scope.channel);
  }

  if (scope.device && scope.device !== "all") {
    params.set("device", scope.device);
  }

  if (scope.inAppBrowserOnly) {
    params.set("inApp", "true");
  }

  if (!scope.comparePrevious) {
    params.set("comparePrevious", "false");
  }

  if (scope.drilldownMetric) {
    params.set("drilldownMetric", scope.drilldownMetric);
  }

  if (scope.drilldownStage) {
    params.set("drilldownStage", scope.drilldownStage);
  }

  if (scope.drilldownChannel) {
    params.set("drilldownChannel", scope.drilldownChannel);
  }

  if (scope.drilldownExceptionId) {
    params.set("drilldownExceptionId", scope.drilldownExceptionId);
  }

  return params.toString();
}

/**
 * Builds an evidence drilldown URL that preserves all active global filters
 * while navigating to a target workspace with specific drilldown keys.
 */
export function buildEvidenceDrilldownUrl(
  workspace: AdminWorkspaceId,
  currentScope: AdminGlobalScope,
  target?: {
    highlight?: string;
    orderId?: string;
    drilldownMetric?: string;
    drilldownStage?: string;
    drilldownChannel?: string;
    drilldownExceptionId?: string;
    [key: string]: any;
  }
): string;
export function buildEvidenceDrilldownUrl(
  currentScope: AdminGlobalScope,
  target: {
    workspace: AdminWorkspaceId;
    highlight?: string;
    orderId?: string;
    drilldownMetric?: string;
    drilldownStage?: string;
    drilldownChannel?: string;
    drilldownExceptionId?: string;
    [key: string]: any;
  }
): string;
export function buildEvidenceDrilldownUrl(
  arg1: AdminWorkspaceId | AdminGlobalScope,
  arg2: AdminGlobalScope | { workspace: AdminWorkspaceId; [key: string]: any },
  arg3?: { [key: string]: any }
): string {
  let workspace: AdminWorkspaceId;
  let baseScope: AdminGlobalScope;
  let extra: Record<string, any> = {};

  if (typeof arg1 === "string") {
    workspace = arg1 as AdminWorkspaceId;
    baseScope = arg2 as AdminGlobalScope;
    extra = arg3 || {};
  } else {
    baseScope = arg1 as AdminGlobalScope;
    const targetObj = (arg2 || {}) as { workspace: AdminWorkspaceId; [key: string]: any };
    workspace = targetObj.workspace;
    extra = targetObj;
  }

  const newScope: AdminGlobalScope = {
    ...baseScope,
    workspace,
    drilldownMetric: extra.drilldownMetric,
    drilldownStage: extra.drilldownStage,
    drilldownChannel: extra.drilldownChannel,
    drilldownExceptionId: extra.drilldownExceptionId,
    orderId: extra.orderId || baseScope?.orderId,
  };

  const queryString = serializeAdminGlobalScope(newScope);
  const params = new URLSearchParams(queryString);
  if (extra.highlight) {
    params.set("highlight", extra.highlight);
  }
  if (extra.orderId && !params.has("orderId")) {
    params.set("orderId", extra.orderId);
  }
  const finalQuery = params.toString();
  const destination = ["orders", "journeys", "economics", "promotions", "growth"].includes(workspace)
    ? `/admin/${workspace}`
    : "/admin";
  return finalQuery.length > 0 ? `${destination}?${finalQuery}` : destination;
}

/**
 * Converts AdminGlobalScope to the engine's GlobalReportScope.
 */
export function toGlobalReportScope(scope: AdminGlobalScope): GlobalReportScope {
  let label = "oct13";
  if (scope.datePreset === "today") label = "today";
  else if (scope.datePreset === "7d") label = "7d";
  else if (scope.datePreset === "30d") label = "30d";
  else if (scope.datePreset === "since_oct13") label = "oct13";
  else if (scope.datePreset === "custom") label = "custom";

  return {
    window: {
      start: scope.customFrom || "",
      end: scope.customTo || "",
      label,
    },
    timezone: scope.timezone || DEFAULT_ADMIN_TIMEZONE,
    mode: scope.mode,
    channel: scope.channel !== "all" ? scope.channel : undefined,
    deviceCategory: scope.device,
    excludeFounder: scope.mode === "customer_reporting",
  };
}

// ----------------------------------------------------------------------------
// Stale Response Race Guard
// ----------------------------------------------------------------------------

export interface RequestSequenceGuard {
  nextRequestId: () => number;
  next: () => number;
  isLatest: (id: number) => boolean;
  currentId: () => number;
  reset: () => void;
}

export function createRequestSequenceGuard(): RequestSequenceGuard {
  let counter = 0;

  return {
    nextRequestId: () => {
      counter++;
      return counter;
    },
    next: () => {
      counter++;
      return counter;
    },
    isLatest: (id: number) => id === counter,
    currentId: () => counter,
    reset: () => {
      counter = 0;
    },
  };
}
