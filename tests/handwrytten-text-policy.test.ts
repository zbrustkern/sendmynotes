import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  HANDWRYTTEN_FONT_METRICS,
  analyzeHandwryttenFit,
  resolveHandwryttenFontMetric,
  sanitizeHandwryttenText,
} from '../lib/handwrytten-text-policy';
import {
  blankWeddingAddress,
  newWeddingHousehold,
  weddingNoteFit,
  weddingOverflow,
  weddingWordingIssues,
  type WeddingProject,
} from '../lib/wedding/domain';
import { validateWeddingDraftOutput } from '../lib/wedding/ai-schema';

let checks = 0;
function check(label: string, fn: () => void) {
  fn();
  checks++;
  console.log(`PASS ${label}`);
}

function makeProject(handwriting = 'hwDavid'): WeddingProject {
  const now = Date.now();
  return {
    id: 'wp_fit_test',
    revision: 1,
    ownerId: 'wa_owner',
    sharedBody: '',
    signOff: '',
    handwriting,
    cover: { kind: 'preset', id: 'preset-thankyou-botanical', url: '/presets/thank-you-botanical.jpg' },
    returnAddress: { ...blankWeddingAddress(), firstName: 'Alex', lastName: 'Kim' },
    templates: [],
    purchasedCount: 0,
    activeBatchId: null,
    householdCount: 1,
    writingMode: 'shared',
    createdAt: now,
    updatedAt: now,
    expiresAt: now + 86_400_000,
    claimedAt: null,
  };
}

check('client-safe module has zero Node-only imports', () => {
  const source = readFileSync(path.join(process.cwd(), 'lib/handwrytten-text-policy.ts'), 'utf8');
  assert.doesNotMatch(source, /from\s+['"]node:|require\(['"]node:/);
});

check('normalizes curly quotes, dashes, ellipses, unicode spaces, and newlines', () => {
  const raw = '“Thank\u00A0you”—truly…\r\n‘You’re\u2003kind.’   \r\n\r\n\r\nWith\u202Flove   ';
  const result = sanitizeHandwryttenText(raw);
  assert.equal(result.changed, true);
  assert.deepEqual(result.unsupportedChars, []);
  assert.equal(result.text, '"Thank you"-truly...\n\'You\'re kind.\'\n\nWith love');
});

check('preserves Latin-1 and Latin-Extended-A accented letters including NFD normalization', () => {
  const raw = 'Chère Anaïs, Noël, François, Œuvre, Šárka, Žofie, Ÿ & e\u0301!';
  const result = sanitizeHandwryttenText(raw);
  assert.deepEqual(result.unsupportedChars, []);
  assert.equal(result.text, 'Chère Anaïs, Noël, François, Œuvre, Šárka, Žofie, Ÿ & é!');
});

check('detects and dedupes emojis, pictographs, dingbats, zero-width, and control characters', () => {
  const emoji = sanitizeHandwryttenText('Thank you ❤️❤️❤️ 😀 👩🏽‍💻 ★');
  assert.deepEqual(emoji.unsupportedChars, ['❤️', '😀', '👩🏽‍💻', '★']);

  const invisible = sanitizeHandwryttenText('Hello\u200B\uFEFFworld\u0007\u001B');
  assert.ok(invisible.unsupportedChars.some((c) => c.includes('U+200B')));
  assert.ok(invisible.unsupportedChars.some((c) => c.includes('U+FEFF')));
  assert.ok(invisible.unsupportedChars.some((c) => c.includes('U+0007')));
  assert.ok(invisible.unsupportedChars.some((c) => c.includes('U+001B')));

  const fit = analyzeHandwryttenFit('Thank you so much ❤️', 'hwDavid');
  assert.equal(fit.fits, false);
  assert.equal(fit.status, 'unsupported_chars');
  assert.match(fit.issues[0], /Real pens can’t draw emojis.*remove ❤️ to continue/);
});

check('resolves all 5 verified fonts and numeric/label aliases with calibrated metrics', () => {
  const expected: Array<[string, string, number]> = [
    ['hwDavid', 'Casual David', 0.60],
    ['1', 'Casual David', 0.60],
    ['Casual David', 'Casual David', 0.60],
    ['hwChase', 'Charming Chase', 0.55],
    ['2', 'Charming Chase', 0.55],
    ['Charming Chase', 'Charming Chase', 0.55],
    ['hwKate', 'Carefree Kate', 0.60],
    ['3', 'Carefree Kate', 0.60],
    ['hwAdam', 'Executive Adam', 0.60],
    ['4', 'Executive Adam', 0.60],
    ['hwWill', 'Dapper Will', 0.60],
    ['5', 'Dapper Will', 0.60],
  ];
  for (const [alias, label, lineSpacing] of expected) {
    assert.ok(HANDWRYTTEN_FONT_METRICS[alias], `Missing metric alias ${alias}`);
    const metric = resolveHandwryttenFontMetric(alias);
    assert.equal(metric.label, label);
    assert.equal(metric.lineSpacing, lineSpacing);
    assert.equal(metric.maxLines, 11);
    assert.equal(metric.softLineLimit, 9);
    assert.equal(metric.maxExplicitBreaks, 8);
    assert.equal(metric.maxChars, 450);
  }
});

check('2D width weighting wraps wide uppercase faster than narrow letters and differs across fonts', () => {
  const wide = 'W'.repeat(420);
  const narrow = 'i'.repeat(420);
  const wideFit = analyzeHandwryttenFit(wide, 'hwDavid');
  const narrowFit = analyzeHandwryttenFit(narrow, 'hwDavid');
  assert.equal(wideFit.fits, false);
  assert.equal(wideFit.status, 'overflow');
  assert.ok(wideFit.wrappedLines > 11);
  assert.equal(narrowFit.fits, true);
  assert.ok(narrowFit.wrappedLines < 8);

  const prose =
    'Dear Jamie and Taylor, thank you so much for celebrating our wedding with us and for the generous espresso maker. We already used it this morning and thought of your kindness. Every moment together meant the world to us and we cannot wait to host you for dinner soon!';
  const davidFit = analyzeHandwryttenFit(prose, 'hwDavid');
  const chaseFit = analyzeHandwryttenFit(prose, 'hwChase');
  assert.ok(chaseFit.wrappedLines >= davidFit.wrappedLines);
});

check('449-450 char single-paragraph note in hwDavid fits within 11 lines with cozy status', () => {
  const note449 =
    'Thank you so much for celebrating our wedding day with us and for the gorgeous linen table runner. We set it out in our dining room right away and smiled thinking of all the dinners we will share around that table. Your warmth, generosity, and encouragement over the years have meant everything to both of us, and we feel so lucky to have you in our lives as we begin this new chapter together. We hope to see you soon for coffee and catching up.';
  assert.ok(note449.length >= 445 && note449.length <= 450);
  const fit = analyzeHandwryttenFit(note449, 'hwDavid');
  assert.equal(fit.fits, true);
  assert.equal(fit.status, 'cozy');
  assert.ok(fit.wrappedLines <= 11);
});

check('enforces max 8 explicit line breaks and soft/hard wrapped line limits', () => {
  const tenShortLines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join('\n');
  const breakFit = analyzeHandwryttenFit(tenShortLines, 'hwDavid');
  assert.equal(breakFit.fits, false);
  assert.equal(breakFit.status, 'overflow');
  assert.equal(breakFit.explicitBreaks, 9);
  assert.ok(breakFit.issues.some((m) => m.includes('at most 8 line breaks')));

  const okNote = 'Thank you for the lovely salad bowl. We used it last night and loved every detail!';
  const okFit = analyzeHandwryttenFit(okNote, 'hwDavid');
  assert.equal(okFit.fits, true);
  assert.equal(okFit.status, 'ok');

  const cozyNote = Array.from({ length: 9 }, (_, i) => `Short line ${i + 1}`).join('\n');
  const cozyFit = analyzeHandwryttenFit(cozyNote, 'hwDavid');
  assert.equal(cozyFit.fits, true);
  assert.equal(cozyFit.explicitBreaks, 8);
  assert.equal(cozyFit.wrappedLines, 9);
  assert.equal(cozyFit.status, 'cozy');
});

check('domain weddingWordingIssues, weddingNoteFit, and weddingOverflow integrate 2D fit', () => {
  const project = makeProject('hwChase');
  const row = {
    ...newWeddingHousehold('h1'),
    envelopeName: 'Noor',
    firstName: 'Noor',
    insideName: 'Noor',
    insideNameConfirmed: true,
    identityConfirmed: true,
    greeting: 'Dear Noor,',
    bodyOverride: 'Thank you for the bowl! ❤️',
    signOffOverride: 'Love,\nAlex',
  };
  const fit = weddingNoteFit(project, row);
  assert.equal(fit.fontId, 'hwChase');
  assert.equal(fit.fits, false);
  assert.ok(weddingWordingIssues(project, row).some((s) => s.includes('❤️')));
  const overflow = weddingOverflow(project, [row]);
  assert.equal(overflow.length, 1);
  assert.equal(overflow[0].id, 'h1');
  assert.equal(overflow[0].status, 'unsupported_chars');
});

check('AI draft output validation sanitizes punctuation and rejects emojis and 2D overflow', () => {
  const inputs = [{ id: 'r1', gift: 'blue bowl', memory: '', maxChars: 380 }];
  const clean = validateWeddingDraftOutput(
    { suggestions: [{ id: 'r1', text: '“Thank you” for the blue bowl—it’s lovely…' }] },
    inputs,
    'hwDavid',
  );
  assert.equal(clean[0].text, '"Thank you" for the blue bowl-it\'s lovely...');

  assert.throws(
    () => validateWeddingDraftOutput({ suggestions: [{ id: 'r1', text: 'Thank you for the blue bowl! ❤️' }] }, inputs, 'hwDavid'),
    (e: any) => e.code === 'unsafe_output',
  );

  const tooManyBreaks = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join('\n');
  assert.throws(
    () => validateWeddingDraftOutput({ suggestions: [{ id: 'r1', text: tooManyBreaks }] }, inputs, 'hwDavid'),
    (e: any) => e.code === 'note_overflow',
  );
});

console.log(`Passed ${checks} handwrytten-text-policy checks.`);
