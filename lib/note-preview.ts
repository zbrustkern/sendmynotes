import { ALL_FONT_CANDIDATES, type FontOption } from './card-presets';

const FONT_ALIASES: Record<string, string> = {
  '1': 'hwDavid', '2': 'hwChase', '3': 'hwKate', '4': 'hwAdam', '5': 'hwWill',
  hwCharity: 'hwDavid', 'font-casual': 'hwDavid', 'font-calligraphy': 'hwChase', 'font-classic': 'hwAdam',
};

export type ResolvedHandwritingStyle = {
  id: string;
  label: string;
  fontFamily: string;
  fontClass: string;
  available: boolean;
  candidate?: FontOption;
};

/** Mirrors buildSingleStepOrderPayload's trim-and-join behavior without changing fulfillment. */
export function resolvePreviewMessage(printedMessage?: string | null, handwrittenNote?: string | null): string {
  const greeting = (printedMessage || '').trim();
  const note = (handwrittenNote || '').trim();
  return greeting ? `${greeting}\n\n${note}` : note;
}

/** Step 2 sends salutation as printedMessage and body/sign-off as handwrittenNote. */
export function resolveStep2PreviewMessage(salutation: string, bodyNote: string, signOff: string): string {
  return resolvePreviewMessage('', [salutation, bodyNote, signOff].filter(Boolean).join('\n\n'));
}

/** Resolve both current IDs and the legacy values stored by older drafts/orders. */
export function resolveHandwritingStyle(value?: string | number | null): ResolvedHandwritingStyle {
  const requested = value == null || value === '' ? '1' : String(value);
  const id = FONT_ALIASES[requested] || requested;
  const candidate = ALL_FONT_CANDIDATES.find((font) => font.id === id || font.handwryttenFontId === id);
  if (!candidate) {
    return { id: requested, label: 'Handwriting style unavailable', fontFamily: 'system-ui, sans-serif', fontClass: '', available: false };
  }
  return { id: candidate.id, label: candidate.handwryttenFontLabel, fontFamily: candidate.fontFamily, fontClass: candidate.fontClass, available: true, candidate };
}
