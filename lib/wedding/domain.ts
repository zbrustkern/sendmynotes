import { normalizeBodyText, normalizeGreetingText, normalizeSignOffText } from '../multi-send/contracts';
import { analyzeHandwryttenFit, type HandwryttenFitResult } from '../handwrytten-text-policy';
import { getSupplierCountry, validateMailingAddress } from '../mailing-destinations';
import { canonicalWeddingJSON, weddingHash } from './hash';

export const WEDDING_MAX_HOUSEHOLDS = 250;
export const WEDDING_MESSAGE_LIMIT = 450;
export const WEDDING_DAY = 86_400_000;
export interface WeddingAddress { address1: string; address2: string; city: string; state: string; zip: string; country: string }
export interface WeddingReturnAddress extends WeddingAddress { firstName: string; lastName: string }
export interface WeddingTemplate { id: string; name: string; body: string; signOff: string; revision: number }
export interface WeddingCover { kind: 'preset'|'upload'; id: string; url: string; hash?: string; masterKey?: string }
export interface WeddingProject {
  id: string; revision: number; ownerId: string; sharedBody: string; signOff: string; handwriting: string;
  cover: WeddingCover; returnAddress: WeddingReturnAddress; templates: WeddingTemplate[];
  purchasedCount: number; activeBatchId: string|null; householdCount: number;
  writingMode: 'shared'|'individual'; createdAt: number; updatedAt: number; expiresAt: number; claimedAt: number|null;
  pilotInviteId?: string|null; recoveryInviteId?: string|null; deletedAt?: number;
  paymentReconciliationRequired?: boolean; paidHouseholds?: Record<string,string>;
  attribution?: Record<string, unknown>;
}
export interface WeddingProvenance { importId: string; sourceRowId: string; sourceHash: string; sheet?: string; row?: number }
export interface WeddingHousehold {
  id: string; revision: number; envelopeName: string; firstName: string; lastName: string; insideName: string;
  greeting: string|null; gift: string; memory: string; address: WeddingAddress; addressConfirmed: boolean;
  bodyOverride: string|null; signOffOverride: string|null; templateId: string|null; excluded: boolean;
  approvedFingerprint: string|null; paidBatchId: string|null; refundStatus?: "refunded"; refundedCents?: number;
  insideNameConfirmed: boolean; identityConfirmed: boolean; contentRevision: number; addressRevision: number;
  provenance: WeddingProvenance[]; pendingAddress: {address: WeddingAddress; submittedAt: number; requestId: string}|null;
  approvedAt?: number; approvedBy?: string; addressEvidence?: 'unreviewed'|'sender_confirmed'|'recipient_submitted';
  sourceHouseholdId?: string; greetingNeedsReview?: boolean;
}
export interface WeddingActor {
  projectId: string; actorId: string; role: 'owner'|'editor'; verified: boolean; pilot: boolean;
  uid?: string|null; canIssuePilotInvites?: boolean; canPay?: boolean; canExport?: boolean; authTime?: number;
  /** Internal capability context, never serialized to browsers. */
  sessionId?: string; pilotInviteId?: string|null;
}
export function blankWeddingAddress(): WeddingAddress { return {address1:'',address2:'',city:'',state:'',zip:'',country:''}; }
export function newWeddingHousehold(id: string): WeddingHousehold {
  return {id,revision:1,envelopeName:'',firstName:'',lastName:'',insideName:'',greeting:null,gift:'',memory:'',address:blankWeddingAddress(),addressConfirmed:false,bodyOverride:null,signOffOverride:null,templateId:null,excluded:false,approvedFingerprint:null,paidBatchId:null,insideNameConfirmed:false,identityConfirmed:false,contentRevision:1,addressRevision:1,provenance:[],pendingAddress:null,addressEvidence:'unreviewed'};
}
export function weddingResolvedFields(project: WeddingProject,row: WeddingHousehold) {
  const template = project.templates.find(item => item.id === row.templateId);
  return {greeting:normalizeGreetingText(row.greeting === null ? (row.insideNameConfirmed && row.insideName.trim() ? `Dear ${row.insideName.trim()},` : '') : row.greeting),body:normalizeBodyText(row.bodyOverride ?? template?.body ?? project.sharedBody),signOff:normalizeSignOffText(row.signOffOverride ?? template?.signOff ?? project.signOff)};
}
export function resolveWeddingNote(project: WeddingProject,row: WeddingHousehold): string {
  const {greeting,body,signOff} = weddingResolvedFields(project,row);
  return [greeting,body,signOff].filter(Boolean).join('\n\n');
}
/** Only inherited resolved fields participate: street changes preserve wording approval. */
export function weddingApprovalFingerprint(project: WeddingProject,row: WeddingHousehold): string {
  return weddingHash(canonicalWeddingJSON({version:1,id:row.id,identity:[row.envelopeName,row.firstName,row.lastName,row.insideName,row.insideNameConfirmed,row.identityConfirmed],...weddingResolvedFields(project,row)}));
}
export function weddingNoteFit(project: WeddingProject, row: WeddingHousehold): HandwryttenFitResult {
  return analyzeHandwryttenFit(resolveWeddingNote(project, row), project.handwriting);
}
export function weddingWordingIssues(project: WeddingProject,row: WeddingHousehold): string[] {
  const issues: string[] = [], {body,greeting} = weddingResolvedFields(project,row), text = resolveWeddingNote(project,row);
  const fit = analyzeHandwryttenFit(text, project.handwriting);
  if (!row.identityConfirmed || !row.firstName.trim() || !row.envelopeName.trim()) issues.push('Confirm the envelope name.');
  if (row.greeting === null && (!row.insideName.trim() || !row.insideNameConfirmed) || row.greetingNeedsReview) issues.push('Confirm the inside greeting.');
  if (!body) issues.push('Write a note.');
  issues.push(...fit.issues);
  if (/\{\{.*?\}\}|\[(?:name|guest|recipient|gift)\]|<name>/i.test(text)) issues.push('Resolve the placeholder.');
  // Shared bodies must not inherit a named salutation from a previous recipient.
  if (row.bodyOverride === null && /^(?:dear|hi|hello|hey)\s+[^\n,!:]{1,100}[,!:]/i.test(body)) issues.push('Move the greeting into each household’s greeting field.');
  if (greeting.length > 200) issues.push('Review the inside greeting.');
  return issues;
}
export function weddingAddressReady(row: WeddingHousehold): boolean {
  const a = row.address;
  const structural = validateMailingAddress({firstName:row.firstName,lastName:row.lastName,street1:a.address1,street2:a.address2,city:a.city,state:a.state,zip:a.zip,country:a.country});
  return row.addressConfirmed && structural.valid && Boolean(a.zip.trim()) && !!getSupplierCountry(a.country) && Array.from(row.firstName).length <= 80 && Array.from(row.lastName).length <= 80;
}
export function weddingRowReady(project: WeddingProject,row: WeddingHousehold): boolean {
  return !row.excluded && !row.paidBatchId && !project.paidHouseholds?.[row.id] && !weddingWordingIssues(project,row).length && weddingAddressReady(row) && row.approvedFingerprint === weddingApprovalFingerprint(project,row);
}
export function weddingOverflow(project: WeddingProject,rows: WeddingHousehold[]) {
  return rows.flatMap(row => {
    if (row.paidBatchId || project.paidHouseholds?.[row.id] || row.excluded) return [];
    const fit = weddingNoteFit(project, row);
    return fit.fits ? [] : [{id:row.id,envelopeName:row.envelopeName,units:fit.charCount,lines:fit.wrappedLines,maxLines:fit.maxLines,status:fit.status,issues:fit.issues}];
  });
}
