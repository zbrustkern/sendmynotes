import assert from 'node:assert/strict';
import { ALL_FONT_CANDIDATES } from '../lib/card-presets';
import { resolveHandwritingStyle, resolvePreviewMessage, resolveStep2PreviewMessage } from '../lib/note-preview';

assert.equal(resolvePreviewMessage('  Dear Alex  ', '  Happy birthday.\n\nLove,\nSam  '), 'Dear Alex\n\nHappy birthday.\n\nLove,\nSam');
assert.equal(resolvePreviewMessage('', '   '), '');
assert.equal(resolvePreviewMessage('  ', '  Note with\n\ninternal blanks  '), 'Note with\n\ninternal blanks');
const step2 = resolveStep2PreviewMessage(' Dear Pat ', 'Hello.\n\nStill thinking of you.', ' Love,\nRae ');
assert.equal(step2, 'Dear Pat \n\nHello.\n\nStill thinking of you.\n\n Love,\nRae');
assert.equal(resolveStep2PreviewMessage('', '', ''), '');
assert.equal(ALL_FONT_CANDIDATES.length, 5);
for (const id of ['hwDavid', 'hwChase', 'hwKate', 'hwAdam', 'hwWill']) {
  assert.equal(resolveHandwritingStyle(id).available, true, `${id} resolves`);
}
for (const [legacy, current] of [['1','hwDavid'],['2','hwChase'],['3','hwKate'],['4','hwAdam'],['5','hwWill'],['hwCharity','hwDavid'],['font-casual','hwDavid'],['font-calligraphy','hwChase'],['font-classic','hwAdam']]) {
  assert.equal(resolveHandwritingStyle(legacy).id, current, `${legacy} maps to ${current}`);
}
assert.equal(resolveHandwritingStyle(undefined).id, 'hwDavid');
assert.equal(resolveHandwritingStyle('made-up-style').available, false);
console.log('note-interior-preview tests passed');
