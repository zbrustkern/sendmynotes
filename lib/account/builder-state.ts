import { createInitialDraft } from '@/lib/draft/reducer';
import type { AccountDraftContent } from './contracts';
import type { DraftState } from '@/lib/draft/types';

/** Account resumes never carry payment, schedule, acceptance, or another identity. */
export function restoreAccountDraft(content:AccountDraftContent,uid:string,experienceVersion:string):DraftState {
  return {...createInitialDraft(experienceVersion),
    selectedDesign:content.selectedDesign?{...content.selectedDesign,accepted:false,imageUrl:content.accountImage?'':content.selectedDesign.imageUrl}:null,
    accountImage:content.accountImage||null,accountOwnerUid:content.accountImage?uid:null,
    note:{...content.note},recipient:content.recipient?{...content.recipient}:null,sender:content.sender?{...content.sender}:null,
    currentStep:'card',
  };
}
