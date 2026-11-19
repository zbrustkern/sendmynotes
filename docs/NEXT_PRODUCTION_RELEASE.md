# Next production release

## Queued from staging

- [ ] Include the envelope-name fix in the production candidate. The greeting and sign-off belong to the card. Envelope names come from address entry, a selected contact, a saved return address, or an existing draft. Older drafts preserve any name already saved, including a partial name that the sender may need to correct. [Application commit 2180562](https://github.com/zbrustkern/sendmynotes/commit/218056289e22460a3b58baa4dc43e16e91c654a0)

## Checks on the combined candidate

- [ ] Run `node tests/envelope-names-browser.test.mjs` with Playwright and Chromium available. It types “Dear Tess,” and “Warmly,” one character at a time, checks the guest envelope, then checks manual names, address-book selection and the account return address through a note edit and reload.
- [ ] With checkout resume included, run `npm run test:checkout-resume`. In the candidate builder, resume a saved draft, correct an envelope name and verify the corrected name in review alongside the original card text.
- [ ] With multi-send included, add a second recipient and edit their greeting. Verify each recipient’s envelope and inside greeting in review, including the two-line sign-off. Run `node --import tsx tests/multi-send-contracts.test.ts` for the shared greeting and preview rules.
