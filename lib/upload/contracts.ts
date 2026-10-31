/** Frozen SPRINT-0022 contracts. Client responses never contain private object keys. */
export type UploadTreatment = 'playful-stack' | 'gentle-arch' | 'classic-serif';
export type UploadSelection = { source: 'upload'; designId: string; revision: number; masterSha256: string; title: string; accepted: true };
export type UploadAsset = { id: string; uid: string; key: string; width: number; height: number; mimeType: 'image/png'; createdAt: number; expiresAt: number };
export type UploadGeneration = { id: string; uid: string; assetId: string; status: 'pending' | 'ready' | 'failed' | 'unresolved'; key?: string; standardsVersion: number; createdAt: number; expiresAt: number; error?: string; requestHash: string; providerModel?: string; harnessVersion?: string };
export type UploadDesign = { id: string; uid: string; generationId: string; revision: number; masterSha256: string; masterKey: string; exactText: string; treatmentId: UploadTreatment; standardsVersion: number; acceptedAt?: number; createdAt: number; expiresAt: number; ordered?: boolean };
export type UploadStandards = { version: number; creativeGuidance: string; enabledTreatments: UploadTreatment[]; defaultTreatment: UploadTreatment; paused: boolean; publishedAt: number; publishedBy: string };
export type UploadGrant = { uid: string; email: string; expiresAt: number; dailyLimit: number; revoked: boolean; grantedAt: number; grantedBy: string };
export type UploadAccess = { allowed: boolean; reason?: string; paused: boolean; used: number; dailyLimit: number; expiresAt?: number; standards: Pick<UploadStandards,'version'|'enabledTreatments'|'defaultTreatment'> };
export type UploadOrderMaster = { designId: string; revision: number; masterSha256: string; masterKey: string; uid: string };
export class UploadError extends Error { constructor(public code: string, message: string, public status = 400) { super(message); this.name = 'UploadError'; } }
export const UPLOAD_LIMITS = { bytes: 15 * 1024 * 1024, pixels: 40_000_000, minEdge: 512, promptChars: 1000, textGraphemes: 40, daily: 20, width: 1275, height: 1650 } as const;
