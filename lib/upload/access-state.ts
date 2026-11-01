export type UploadStudioAccessState = "resolving" | "checking" | "active" | "inactive" | "error";

export function classifyUploadStudioAccess(input: {
  emailVerified: boolean;
  status: number;
  allowed: unknown;
}): UploadStudioAccessState {
  if (!input.emailVerified || input.status === 401 || input.status === 403) return "inactive";
  if (input.status < 200 || input.status >= 300) return "error";
  return input.allowed === true ? "active" : "inactive";
}
