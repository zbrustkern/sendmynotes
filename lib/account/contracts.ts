import type { MailingAddress } from '@/lib/types';
import type { SelectedDesign, NoteDraft, AddressDraft } from '@/lib/draft/types';

export type AccountActor = { uid: string; email: string; emailVerified: boolean };
export type VersionedRecord = { id: string; version: number; createdAt: number; updatedAt: number };
export type AccountContact = VersionedRecord & {
  displayName: string; relationship: string; notes: string; address: MailingAddress | null;
};
export type AccountOccasion = VersionedRecord & {
  contactId: string; title: string; type: 'birthday' | 'anniversary' | 'other';
  month: number; day: number; year?: number; recurrence: 'annual' | 'once';
  leapDayPolicy: 'feb28' | 'mar1'; reminderEnabled: boolean; leadDays: 14;
  consentAt?: number; lateReminderRequested?: boolean; nextOccurrence?: string; nextReminderAt?: number;
};
export type AccountPreferences = {
  displayName: string; defaultReturnAddress: MailingAddress | null;
  timeZone: string;
  timeZoneConfirmed?: boolean; remindersPaused: boolean; version: number; updatedAt: number;
  reminderEmail: string; emailVerified: boolean; reminderDeliveryAvailable: boolean;
};
export type AccountImageSelection = { imageId: string; version: number; masterSha256: string };
export type AccountImage = VersionedRecord & {
  title: string; kind: 'generated_front' | 'uploaded_source' | 'upload_front';
  width: number; height: number; previewPath: string; contentType?: 'image/png'|'image/jpeg'|'image/webp'; prompt?: string;
  requiresUploadGrant: boolean; selection?: AccountImageSelection; expiresAt?: number;
};
export type AccountDraftContent = {
  selectedDesign: SelectedDesign | null; accountImage?: AccountImageSelection | null;
  note: NoteDraft; recipient: AddressDraft | null; sender: AddressDraft | null;
  contactId?: string; occasionId?: string; currentStep?: 'card' | 'note' | 'address';
};
export type AccountDraft = VersionedRecord & {
  title: string; content: AccountDraftContent; expiresAt: number;
};
export type AccountList<T> = { data: T[]; nextCursor: string | null };
