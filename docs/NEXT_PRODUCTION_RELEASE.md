# Next production release

## Shipped November 18, 2026

The combined release included checkout retry handling, the custom cover gallery experiment and the private repeat-buyer report. [Production commit](https://github.com/zbrustkern/sendmynotes/commit/2a9a891a2307219fc75451a0cd4468fc5dd3899a) · [Deployment and browser checks](sprints/evidence/SPRINT-0032/RELEASE.json)

- [x] The production release includes the envelope-name fix. The greeting and sign-off belong to the card. Envelope names come from address entry, a selected contact, a saved return address, or an existing draft. Older drafts preserve any name already saved, including a partial name that the sender may need to correct. [Application commit 2180562](https://github.com/zbrustkern/sendmynotes/commit/218056289e22460a3b58baa4dc43e16e91c654a0)

## Checks on the combined candidate

- [x] Ran `node tests/envelope-names-browser.test.mjs` with Playwright and Chromium available. It types “Dear Tess,” and “Warmly,” one character at a time, checks the guest envelope, then checks manual names, address-book selection and the account return address through a note edit and reload.
- [x] The checkout resume suite passed. On staging and production, a resumed draft retained corrected envelope names and the original card text through review.

## For the multi-send release

- [ ] When multi-send is included, add a second recipient and edit their greeting. Verify each recipient’s envelope and inside greeting in review, including the two-line sign-off. Run `node --import tsx tests/multi-send-contracts.test.ts` for the shared greeting and preview rules.
