# Wedding portal browser acceptance

The guest writing exercise opens the staging homepage, follows **Thank-you notes** from the general sending page, and creates private synthetic projects through the same buttons available to a sender. Its receipts contain counts and outcomes. The screenshots show fictional households.

| Exercise | Observed on staging build 012 |
| --- | --- |
| Start and resume | A new project opened empty. A guest added an envelope and inside names, refreshed, and recovered the same approved card in a second browser context. The recovery page cleared the token from the address bar. |
| Personal and shared writing | Two sample households received individual wording and approvals. One shared approval covered the other 98. A subsequent change to the shared body reopened those 98 and preserved the two individual approvals. |
| Address readiness and pricing | With 100 notes approved, 96 sample envelopes were ready, including three international destinations. Four awaited addresses. The separate single domestic envelope showed a $9.00 estimate. |
| Length and mobile layout | The complete-note counter allowed approval at 449 and 450 characters and held the 451-character draft. Review fit a 320-pixel-wide viewport. |
| Continue a general batch | The original two-envelope draft remained available after transfer. The wedding project preserved the explicitly written greeting, explicitly blank greeting and shared body, and requested fresh approvals. |
| Retain the approved card after payment | A separate guest pilot cropped and lettered a private photo, composed a personalized note and paid $9 in Stripe test mode. Changing the project cover and sign-off left the paid PNG byte-identical to the original approved master and preserved the full approved text. An independent project owner's requests for the draft front, paid front and paid note each returned 404. |

**Observed friction and retests**

- On build 011, switching directly from a newly typed shared body into a personal edit could raise a concurrent-edit notice for the same sender. The editor now finishes saving the shared revision before opening an individual edit. The two-personal-plus-98-shared exercise passed on build 012.
- Keyboard testing found that moving to the next household could return focus to the page body. The editor now focuses the new heading after React commits the household change. Local Chrome verified that Enter advances focus and announces the approval. The same run exercised separate photo and guest-list controls via keyboard and mobile review at 200% magnification.

**Records**

- [Hosted writing receipt](hosted-ui/writing-checks.json), [two-recipient transfer receipt](hosted-ui/transfer-checks.json), [100-household desktop](hosted-ui/writing-100-households.png) and [320-pixel mobile review](hosted-ui/review-mobile.png).
- [Local browser receipt](local-ui/writing-checks.json), [writing test](../../../../scripts/wedding/check-writing-ui.cjs) and [transfer test](../../../../scripts/wedding/check-transfer-ui.cjs).
- [Private paid-card verification](hosted-paid-cover.json) and [resumable staging verifier](hosted-paid-cover.mjs). This separate V2 fixture captured one $9 Stripe test payment for held fulfillment.

The exercises automate Chrome with synthetic data. Founder and tester observation sessions remain a separate, pending usability milestone.
