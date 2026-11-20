/** Browser-safe request validation and the exact text shown at the consent boundary. */
import { canonicalFields, type FieldMapping } from './import-contract';
import { analyzeHandwryttenFit, sanitizeHandwryttenText } from '../handwrytten-text-policy';

export class WeddingAiError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); this.name = 'WeddingAiError'; }
}
export const WEDDING_AI_POLICY = 'wedding-ai-2026-11-18-v1';
export const WEDDING_AI_LIMITS = { requestBytes: 24 * 1024, excerptChars: 1600, headers: 40, headerChars: 100, drafts: 100, chunk: 5, images: 3, maps: 4, concurrency: 2, dayMs: 86_400_000 } as const;
export type WeddingAiFeature = 'draft'|'map'|'image';
export type WeddingAiTone = 'warm'|'short'|'personal';
type Consent = { consent: true; idempotencyKey: string };
export type WeddingAiRequest =
  | ({ action: 'draft'; ids: string[]; tone: WeddingAiTone } & Consent)
  | ({ action: 'map'; headers: string[]; excerpt?: never } & Consent)
  | ({ action: 'map'; excerpt: string; headers?: never } & Consent)
  | ({ action: 'image'; prompt: string; assetId?: string } & Consent)
  | ({ action: 'advance'; jobId: string } & Consent)
  | { action: 'cancel'; jobId: string; idempotencyKey: string };
export type WeddingAiDraftInput = { id: string; gift: string; memory: string; maxChars: number };
export type WeddingAiDraftSuggestion = { id: string; text: string };
export type WeddingAiMapSuggestion = { name: string; gift: string; memory: string };
export type WeddingAiResult =
  | { jobId: string; complete: number; total: number; suggestions: WeddingAiDraftSuggestion[] }
  | { suggestions: WeddingAiMapSuggestion[]; provider: string; model: string }
  | { mapping: FieldMapping }
  | { assetId: string; url: string }
  | { jobId: string; canceled: true };

export function aiObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WeddingAiError('invalid_schema', 'Choose a valid AI request.');
  return value as Record<string, unknown>;
}
export function aiExactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new WeddingAiError('invalid_schema', 'This request contains unsupported fields.');
}
export function aiString(value: unknown, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) throw new WeddingAiError('invalid_schema', 'Review the text length and remove control characters.');
  return value;
}
export function aiId(value: unknown): string {
  const id = aiString(value, 128);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new WeddingAiError('invalid_id', 'Choose a valid project item.');
  return id;
}

/** No silent truncation: show this exact result before consent; request parser checks equality. */
export function prepareWeddingAiExcerpt(text: string): string {
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removed]')
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[link removed]')
    .replace(/(?:\b(?:iban|account|routing|card|cvv|cvc|ssn)\s*[:#=]?\s*)[A-Z0-9 -]{3,34}/gi, '[payment details removed]')
    .replace(/\b(?:\d[ -]?){13,19}\b/g, '[payment number removed]')
    .replace(/(?:\+\d{1,3}[ .-]?)?(?:\(\d{3}\)|\b\d{3})[ .-]?\d{3}[ .-]?\d{4}\b/g, '[phone removed]')
    .replace(/^\s*(?:mailing|shipping|billing|return)?\s*(?:address|street|city|state|province|zip|postal\s*code|postcode|country)\s*[:=].*$/gim, '[address field removed]')
    .replace(/\b(?:P\.?\s*O\.?\s+Box\s+\d+|\d{1,6}\s+[^\n;.!?]{1,80}?\s(?:street|st|road|rd|avenue|ave|drive|dr|way|lane|ln|boulevard|blvd|court|ct|place|pl|terrace|crescent))\b\.?[^\n;!?]{0,100}/gi, '[street address removed]')
    .replace(/\b\d{5}(?:-\d{4})?\b|\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b|\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi, '[postal code removed]')
    .replace(/(?:[$€£]\s*\d[\d,.]*|\b\d[\d,.]*\s*(?:USD|EUR|GBP|dollars)\b)/gi, '[amount removed]')
    .trim();
}
export function aiInstructionLike(text: string): boolean {
  return /\b(?:ignore|override|disregard)\b.{0,45}\b(?:instructions|system|rules|prompt)\b|\b(?:system\s*prompt|api\s*key|tool_call|function_call|jailbreak)\b|<\/?(?:script|system|assistant|tool)\b/iu.test(text);
}
/** Show these fields verbatim before draft consent; no greeting/name/address is sent. */
export function prepareWeddingAiDraftFields(row: {gift: string; memory: string; address?: {address1?: string; address2?: string; zip?: string}}, returnAddress?: {address1?: string; address2?: string; zip?: string}) {
  let gift = row.gift || '', memory = row.memory || '';
  for (const address of [row.address,returnAddress]) for (const key of ['address1','address2','zip'] as const) {
    const value = address?.[key];
    if (value && value.length >= 3) {gift=gift.split(value).join('[address removed]');memory=memory.split(value).join('[address removed]');}
  }
  return {gift:prepareWeddingAiExcerpt(gift),memory:prepareWeddingAiExcerpt(memory)};
}
export function validateWeddingAiRequest(value: unknown, headerKey?: string | null): WeddingAiRequest {
  const input = aiObject(value), action = input.action;
  const key = input.idempotencyKey ?? headerKey;
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(key) || (headerKey && input.idempotencyKey && headerKey !== input.idempotencyKey)) throw new WeddingAiError('idempotency_key_required', 'Use a stable idempotency key for this request.');
  const common = ['action','consent','idempotencyKey'];
  if (action !== 'cancel' && input.consent !== true) throw new WeddingAiError('consent_required', 'Review what will be sent and choose to continue.');
  const base = { idempotencyKey: key, consent: true as const };
  if (action === 'draft') {
    aiExactKeys(input, [...common,'ids','tone']);
    if (!Array.isArray(input.ids) || !input.ids.length || input.ids.length > 100) throw new WeddingAiError('invalid_selection', 'Select between one and 100 households.');
    const ids = input.ids.map(aiId);
    if (new Set(ids).size !== ids.length) throw new WeddingAiError('invalid_selection', 'Select each household once.');
    const tone = input.tone ?? 'warm';
    if (!['warm','short','personal'].includes(String(tone))) throw new WeddingAiError('invalid_tone', 'Choose warm, short or personal.');
    return { ...base, action, ids, tone: tone as WeddingAiTone };
  }
  if (action === 'advance' || action === 'cancel') {
    aiExactKeys(input, action === 'cancel' ? ['action','jobId','idempotencyKey'] : [...common,'jobId']);
    return action === 'cancel' ? { action, jobId: aiId(input.jobId), idempotencyKey: key } : { ...base, action, jobId: aiId(input.jobId) };
  }
  if (action === 'map') {
    aiExactKeys(input, [...common,'headers','excerpt']);
    if (input.headers !== undefined && input.excerpt !== undefined) throw new WeddingAiError('invalid_schema', 'Choose headers or one selected excerpt.');
    if (input.headers !== undefined) {
      if (!Array.isArray(input.headers) || !input.headers.length || input.headers.length > WEDDING_AI_LIMITS.headers) throw new WeddingAiError('invalid_headers', 'Choose up to 40 source headers.');
      const headers = input.headers.map(v => aiString(v, WEDDING_AI_LIMITS.headerChars));
      if (new Set(headers).size !== headers.length || headers.some(h => ['__proto__','constructor','prototype'].includes(h) || prepareWeddingAiExcerpt(h) !== h || aiInstructionLike(h))) throw new WeddingAiError('manual_mapping_required', 'Review these headers using manual mapping.');
      return { ...base, action, headers };
    }
    const excerpt = aiString(input.excerpt, WEDDING_AI_LIMITS.excerptChars);
    if (prepareWeddingAiExcerpt(excerpt) !== excerpt) throw new WeddingAiError('excerpt_requires_review', 'Review the locally redacted excerpt before sending it.');
    return { ...base, action, excerpt };
  }
  if (action === 'image') {
    aiExactKeys(input, [...common,'prompt','assetId']);
    const prompt = aiString(input.prompt, 1000);
    if (prepareWeddingAiExcerpt(prompt) !== prompt) throw new WeddingAiError('prompt_requires_review', 'Remove contact, address and payment details from the image direction.');
    if (aiInstructionLike(prompt)) throw new WeddingAiError('manual_review_required', 'Use a description of the artwork you want.');
    return { ...base, action, prompt, ...(input.assetId === undefined ? {} : { assetId: aiId(input.assetId) }) };
  }
  throw new WeddingAiError('invalid_action', 'Choose a supported AI action.');
}

function outputText(value: unknown, max: number, allowEmpty = false): string {
  const text = aiString(value, max, allowEmpty);
  if (prepareWeddingAiExcerpt(text) !== text || aiInstructionLike(text) || /\{\{|\}\}|\[(?:name|guest|recipient|gift|.*removed)\]|<[^>]*>/i.test(text)) throw new WeddingAiError('unsafe_output', 'The suggestion needs manual review. Please keep your existing wording.', 502);
  return text;
}
/** Reject an entire unexpected response; never pick actionable fields out of an untrusted object. */
export function validateWeddingDraftOutput(value: unknown, inputs: WeddingAiDraftInput[], fontId?: string): WeddingAiDraftSuggestion[] {
  const object = aiObject(value); aiExactKeys(object, ['suggestions']);
  if (!Array.isArray(object.suggestions) || object.suggestions.length !== inputs.length) throw new WeddingAiError('invalid_output', 'The provider returned an incomplete suggestion.', 502);
  const used = new Set<string>();
  return object.suggestions.map(v => {
    const row = aiObject(v); aiExactKeys(row, ['id','text']);
    const source = inputs.find(input => input.id === row.id);
    if (!source || used.has(source.id)) throw new WeddingAiError('invalid_output', 'The provider returned an unexpected household.', 502);
    used.add(source.id);
    const rawText = aiString(row.text, 1200);
    const sanitized = sanitizeHandwryttenText(rawText);
    if (sanitized.unsupportedChars.length > 0) throw new WeddingAiError('unsafe_output', 'The suggestion includes emojis or special symbols that pens cannot draw. Keep your existing wording.', 502);
    const text = outputText(sanitized.text, Math.min(400, source.maxChars));
    const fit = analyzeHandwryttenFit(text, fontId);
    if (!fit.fits) throw new WeddingAiError('note_overflow', fit.issues[0] || 'The suggestion is too long to fit inside the card.', 502);
    if (/\b(?:dear|dearest|hello|hi|hey)\s+[\p{L}]/iu.test(text) || /(?:^|\n)\s*(?:love|with love|warmly|sincerely|best(?: wishes)?|yours|cheers)[,!]?\s*(?:\n|$)/iu.test(text)) throw new WeddingAiError('unsafe_greeting', 'The suggestion includes a greeting or signature. Keep those in the card’s own fields.', 502);
    // Keep risky factual claims grounded even if the provider ignores its task.
    const claimGroups = [
      /\b(?:attend(?:ed|ing)?|celebrat(?:ed|ing) with|there with us|at (?:our|the) wedding|danc(?:ed|ing)|seeing you|joining us|travel(?:ed|led)|flew|came to)\b/i,
      /\b(?:used|using|enjoyed|enjoying|bought|spent)\b/i,
    ];
    const relationships = text.match(/\b(?:aunt|uncle|cousin|sister|brother|mother|father|grandmother|grandfather)\b/gi) || [];
    const otherPrivateDetail = inputs.some(other => other.id!==source.id && [other.gift,other.memory].some(detail=>detail.length>3 && !`${source.gift} ${source.memory}`.toLowerCase().includes(detail.toLowerCase()) && text.toLowerCase().includes(detail.toLowerCase())));
    if (claimGroups.some(pattern=>pattern.test(text)&&!pattern.test(source.memory)) || relationships.some(word=>!new RegExp(`\\b${word}\\b`,'i').test(source.memory)) || /\b(?:dollars|euros|pounds|USD|EUR|GBP)\b/i.test(text) || otherPrivateDetail) throw new WeddingAiError('unsupported_detail', 'The suggestion adds a detail you have not supplied.', 502);
    return { id: source.id, text };
  });
}
export function validateWeddingMapOutput(value: unknown, headers?: string[], excerpt?: string): FieldMapping | WeddingAiMapSuggestion[] {
  const object = aiObject(value);
  if (headers) {
    aiExactKeys(object, ['mapping']); const mapping = aiObject(object.mapping), result: FieldMapping = {};
    if (Object.keys(mapping).length > headers.length) throw new WeddingAiError('invalid_output', 'Review the proposed mapping manually.', 502);
    for (const [header,field] of Object.entries(mapping)) {
      if (!headers.includes(header) || !canonicalFields.includes(field as typeof canonicalFields[number]) || ['__proto__','constructor','prototype'].includes(header)) throw new WeddingAiError('invalid_output', 'Review the proposed mapping manually.', 502);
      result[header] = field as typeof canonicalFields[number];
    }
    return result;
  }
  aiExactKeys(object, ['suggestions']);
  if (!Array.isArray(object.suggestions) || object.suggestions.length > 25) throw new WeddingAiError('invalid_output', 'Review the selected excerpt manually.', 502);
  return object.suggestions.map(value => {
    const row = aiObject(value); aiExactKeys(row, ['name','gift','memory']);
    const result = { name: outputText(row.name, 160), gift: outputText(row.gift, 300, true), memory: outputText(row.memory, 400, true) };
    const comparable = (text: string) => text.normalize('NFC').replace(/\s+/g,' ').toLocaleLowerCase();
    if (excerpt !== undefined && Object.values(result).some(text => text && !comparable(excerpt).includes(comparable(text)))) throw new WeddingAiError('unsupported_detail','The proposed fields include a detail outside the approved excerpt. Map this passage manually.',502);
    return result;
  });
}
