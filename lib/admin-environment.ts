import type { AdminGlobalScope } from "./admin-scope";

export function configuredAdminEnvironment(): AdminGlobalScope["environment"] {
  const runtime = `${process.env.K_SERVICE || ""} ${process.env.FIREBASE_CONFIG || ""}`.toLowerCase();
  if (runtime.includes("staging")) return "staging";
  const project = (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    ""
  ).toLowerCase();
  if (project.includes("staging")) return "staging";
  if (project.includes("test")) return "test";
  if (project.includes("dev")) return "development";
  if (project) return "production";
  if (process.env.NODE_ENV === "test") return "test";
  if (process.env.NODE_ENV === "development") return "development";
  return "production";
}

export function adminEnvironmentMatches(requested: AdminGlobalScope["environment"]): boolean {
  return requested === configuredAdminEnvironment();
}
