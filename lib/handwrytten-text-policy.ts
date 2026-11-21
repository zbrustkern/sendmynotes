import { normalizeBodyText } from './multi-send/contracts';

export type HandwryttenFontId =
  | 'hwDavid'
  | 'hwChase'
  | 'hwKate'
  | 'hwAdam'
  | 'hwWill'
  | 'hwAnita'
  | 'hwSeraphim'
  | 'hwDarleen'
  | 'hwJenna'
  | 'hwRuthie'
  | 'hwCaitlin'
  | 'hwMadeline'
  | 'hwJonathan'
  | 'hwCharity';

export interface HandwryttenFontMetric {
  id: HandwryttenFontId;
  label: string;
  lineSpacing: number;
  charsPerLine: number;
  maxLines: number;
  softLineLimit: number;
  maxExplicitBreaks: number;
  maxChars: number;
  recommendedMinChars: number;
  recommendedMaxChars: number;
  recommendedMaxLines: number;
}

const DEFAULT_CARD_LIMITS = {
  maxLines: 11,
  softLineLimit: 9,
  maxExplicitBreaks: 8,
  maxChars: 450,
  recommendedMinChars: 180,
  recommendedMaxChars: 320,
  recommendedMaxLines: 7,
} as const;

const makeMetric = (
  id: HandwryttenFontId,
  label: string,
  lineSpacing: number,
  charsPerLine: number,
): HandwryttenFontMetric => ({
  id,
  label,
  lineSpacing,
  charsPerLine,
  ...DEFAULT_CARD_LIMITS,
});

const CANONICAL_METRICS: Record<HandwryttenFontId, HandwryttenFontMetric> = {
  hwDavid: makeMetric('hwDavid', 'Casual David', 0.60, 45),
  hwChase: makeMetric('hwChase', 'Charming Chase', 0.55, 40),
  hwKate: makeMetric('hwKate', 'Carefree Kate', 0.60, 44),
  hwAdam: makeMetric('hwAdam', 'Executive Adam', 0.60, 42),
  hwWill: makeMetric('hwWill', 'Dapper Will', 0.60, 43),
  hwAnita: makeMetric('hwAnita', 'Ambitious Anita', 0.70, 44),
  hwSeraphim: makeMetric('hwSeraphim', 'Sweet Seraphim', 0.70, 41),
  hwDarleen: makeMetric('hwDarleen', "Darlin' Darleen", 0.65, 43),
  hwJenna: makeMetric('hwJenna', 'Fancy Jenna', 0.60, 41),
  hwRuthie: makeMetric('hwRuthie', 'Loopy Ruthie', 0.70, 40),
  hwCaitlin: makeMetric('hwCaitlin', 'Cozy Caitlin', 0.60, 44),
  hwMadeline: makeMetric('hwMadeline', 'Merry Madeline', 0.50, 46),
  hwJonathan: makeMetric('hwJonathan', 'Genuine Jonathan', 0.70, 42),
  hwCharity: makeMetric('hwCharity', 'Chill Charity', 0.60, 43),
};

export const HANDWRYTTEN_FONT_METRICS: Record<string, HandwryttenFontMetric> = {
  ...CANONICAL_METRICS,
  '1': CANONICAL_METRICS.hwDavid,
  '2': CANONICAL_METRICS.hwChase,
  '3': CANONICAL_METRICS.hwKate,
  '4': CANONICAL_METRICS.hwAdam,
  '5': CANONICAL_METRICS.hwWill,
  ...Object.fromEntries(Object.values(CANONICAL_METRICS).map((m) => [m.label, m])),
  'font-casual': CANONICAL_METRICS.hwDavid,
  'font-calligraphy': CANONICAL_METRICS.hwChase,
  'font-classic': CANONICAL_METRICS.hwAdam,
};

const FONT_ALIAS_LOOKUP: Record<string, HandwryttenFontId> = Object.fromEntries(
  Object.entries(HANDWRYTTEN_FONT_METRICS).map(([key, metric]) => [key.toLowerCase(), metric.id]),
);

export function resolveHandwryttenFontMetric(fontId?: string): HandwryttenFontMetric {
  if (!fontId) return CANONICAL_METRICS.hwDavid;
  const trimmed = fontId.trim();
  const canonicalId = FONT_ALIAS_LOOKUP[trimmed.toLowerCase()];
  return canonicalId ? CANONICAL_METRICS[canonicalId] : CANONICAL_METRICS.hwDavid;
}

export interface HandwryttenSanitizeResult {
  text: string;
  changed: boolean;
  unsupportedChars: string[];
}

const LATIN_EXTENDED_A_ALLOWED = new Set([0x0152, 0x0153, 0x0160, 0x0161, 0x0178, 0x017d, 0x017e]);

function isPenSafeCodePoint(cp: number): boolean {
  if (cp === 0x0a) return true;
  if (cp >= 0x20 && cp <= 0x7e) return true;
  if (cp >= 0xc0 && cp <= 0xd6) return true;
  if (cp >= 0xd8 && cp <= 0xf6) return true;
  if (cp >= 0xf8 && cp <= 0xff) return true;
  return LATIN_EXTENDED_A_ALLOWED.has(cp);
}

function isZeroWidthCodePoint(cp: number): boolean {
  return cp === 0xfeff || (cp >= 0x200b && cp <= 0x200d) || cp === 0x2060;
}

function isControlCodePoint(cp: number): boolean {
  if (cp === 0x0a) return false;
  return cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f);
}

function isPictographicCluster(segment: string): boolean {
  return /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u20E3\u2600-\u27BF]/u.test(segment);
}

function splitGraphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), (part) => part.segment);
  }
  return Array.from(text);
}

function formatCodePointLabel(kind: string, cp: number): string {
  return `${kind} (U+${cp.toString(16).toUpperCase().padStart(4, '0')})`;
}

/** Normalize pen-compatible punctuation/whitespace and detect non-pen glyphs without dropping them silently. */
export function sanitizeHandwryttenText(input: string): HandwryttenSanitizeResult {
  const source = typeof input === 'string' ? input : '';
  const normalizedPunctuation = source
    .normalize('NFC')
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u2012\u2013\u2014\u2015]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ');

  const text = normalizeBodyText(normalizedPunctuation);
  const unsupported: string[] = [];
  const seen = new Set<string>();
  const pushUnsupported = (label: string) => {
    if (!seen.has(label)) {
      seen.add(label);
      unsupported.push(label);
    }
  };

  for (const segment of splitGraphemes(text)) {
    const codePoints = Array.from(segment, (ch) => ch.codePointAt(0)!);
    if (codePoints.every(isPenSafeCodePoint)) continue;
    if (isPictographicCluster(segment)) {
      pushUnsupported(segment);
      continue;
    }
    for (const cp of codePoints) {
      if (isPenSafeCodePoint(cp)) continue;
      if (isZeroWidthCodePoint(cp)) {
        pushUnsupported(formatCodePointLabel('zero-width character', cp));
      } else if (isControlCodePoint(cp)) {
        pushUnsupported(formatCodePointLabel('control character', cp));
      } else {
        pushUnsupported(String.fromCodePoint(cp));
      }
    }
  }

  return {
    text,
    changed: text !== source,
    unsupportedChars: unsupported,
  };
}

export type HandwryttenFitStatus = 'ok' | 'cozy' | 'overflow' | 'unsupported_chars';

export interface HandwryttenFitResult {
  fontId: HandwryttenFontId;
  fontLabel: string;
  normalizedText: string;
  charCount: number;
  maxChars: number;
  wrappedLines: number;
  maxLines: number;
  softLineLimit: number;
  explicitBreaks: number;
  maxExplicitBreaks: number;
  unsupportedChars: string[];
  fits: boolean;
  status: HandwryttenFitStatus;
  issues: string[];
  previewLines: string[];
}

function charWidthWeight(ch: string, fontId: HandwryttenFontId): number {
  const allCaps = fontId === 'hwAdam' || fontId === 'hwWill';
  if (ch === ' ') return 0.55;
  if ("iljtI.,:;!'\"()[]|/\\-`".includes(ch)) return 0.55;
  if ('WMŒÆ'.includes(ch)) return 1.25;
  if ('mw'.includes(ch)) return allCaps ? 1.22 : 1.15;
  if (/[A-ZÀ-ÖØ-ÞŠŸŽ]/.test(ch)) return 1.10;
  if (allCaps && /[a-zß-öø-ÿœšž]/.test(ch)) return 1.05;
  if ('@%&'.includes(ch)) return 1.15;
  return 1.0;
}

function tokenWidth(token: string, fontId: HandwryttenFontId): number {
  let width = 0;
  for (const ch of token) width += charWidthWeight(ch, fontId);
  return width;
}

function wrapTextForCard(normalizedText: string, metric: HandwryttenFontMetric): string[] {
  if (!normalizedText) return [];
  const lines: string[] = [];
  const capacity = metric.charsPerLine;
  const paragraphs = normalizedText.split('\n');

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push('');
      continue;
    }

    const tokens = paragraph.match(/\S+|\s+/g) || [];
    let currentLine = '';
    let currentWidth = 0;

    for (const token of tokens) {
      if (/^\s+$/.test(token)) {
        if (!currentLine) continue;
        const w = tokenWidth(token, metric.id);
        if (currentWidth + w <= capacity + 1e-6) {
          currentLine += token;
          currentWidth += w;
        } else {
          lines.push(currentLine.replace(/ +$/, ''));
          currentLine = '';
          currentWidth = 0;
        }
        continue;
      }

      const w = tokenWidth(token, metric.id);
      if (currentLine && currentWidth + w <= capacity + 1e-6) {
        currentLine += token;
        currentWidth += w;
        continue;
      }

      if (currentLine) {
        lines.push(currentLine.replace(/ +$/, ''));
        currentLine = '';
        currentWidth = 0;
      }

      if (w <= capacity + 1e-6) {
        currentLine = token;
        currentWidth = w;
        continue;
      }

      for (const ch of Array.from(token)) {
        const cw = charWidthWeight(ch, metric.id);
        if (currentLine && currentWidth + cw > capacity + 1e-6) {
          lines.push(currentLine);
          currentLine = ch;
          currentWidth = cw;
        } else {
          currentLine += ch;
          currentWidth += cw;
        }
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine.replace(/ +$/, ''));
    }
  }

  return lines;
}

/** Analyze 2D physical card fit and pen compatibility for an A2 folded portrait card (dimension_id: 4). */
export function analyzeHandwryttenFit(text: string, fontId?: string): HandwryttenFitResult {
  const metric = resolveHandwryttenFontMetric(fontId);
  const sanitized = sanitizeHandwryttenText(text);
  const normalizedText = sanitized.text;
  const charCount = normalizedText.length;
  const explicitBreaks = (normalizedText.match(/\n/g) || []).length;
  const previewLines = wrapTextForCard(normalizedText, metric);
  const wrappedLines = previewLines.length;
  const issues: string[] = [];

  if (sanitized.unsupportedChars.length > 0) {
    const sample = sanitized.unsupportedChars.slice(0, 5).join(', ');
    issues.push(`Real pens can’t draw emojis or special symbols—remove ${sample} to continue.`);
  }
  if (charCount > metric.maxChars) {
    issues.push(`The complete note is ${charCount}/${metric.maxChars} characters.`);
  }
  if (wrappedLines > metric.maxLines) {
    issues.push(
      `This note wraps to ${wrappedLines} lines (max ${metric.maxLines} for ${metric.label}). Shorten it or reduce line breaks so it fits comfortably inside the card.`,
    );
  }
  if (explicitBreaks > metric.maxExplicitBreaks) {
    issues.push(`Use at most ${metric.maxExplicitBreaks} line breaks so the note fits inside the A2 card.`);
  }

  const fits = issues.length === 0;
  let status: HandwryttenFitStatus = 'ok';
  if (sanitized.unsupportedChars.length > 0) {
    status = 'unsupported_chars';
  } else if (!fits) {
    status = 'overflow';
  } else if (wrappedLines >= metric.softLineLimit || charCount >= 380) {
    status = 'cozy';
  }

  return {
    fontId: metric.id,
    fontLabel: metric.label,
    normalizedText,
    charCount,
    maxChars: metric.maxChars,
    wrappedLines,
    maxLines: metric.maxLines,
    softLineLimit: metric.softLineLimit,
    explicitBreaks,
    maxExplicitBreaks: metric.maxExplicitBreaks,
    unsupportedChars: sanitized.unsupportedChars,
    fits,
    status,
    issues,
    previewLines,
  };
}
