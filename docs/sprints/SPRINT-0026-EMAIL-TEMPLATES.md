# SPRINT-0026 — Follow-up template pack

Proposed copy · November 3, 2026 · No emails sent. Pair with [SPRINT-0026](SPRINT-0026.md).

## Shared implementation contract

Implement pure renderers returning `{subject, previewText, html, text, headers, templateVersion}`. Store templateVersion and the exact immutable rendered dispatch payload before sending; keep it in restricted storage. Never persist unescaped substitutions in HTML. Generate HTML and plain text from the same content model, with inline email-safe styles, one-column layout, readable type and a text fallback for every button. No tracking pixel, stock photo, recipient photo or private note excerpt.

T1 and T2 below seed the initial flow-settings draft. Admin may edit their subject, preview, structured body paragraphs, sign-off and offer button label using allowlisted variable chips; publish an immutable configuration version. Required footers, offer terms, true values and generated destinations remain locked. Unsupported variables, missing required fields, arbitrary HTML or links fail validation. Render both formats from the same published version. Each enrollment pins the version approved when scheduling; editing defaults never silently rewrites queued emails. T0 remains the maintained receipt template outside these marketing controls.

Use **SendMyNotes** throughout. Receipt sender uses the verified existing order sender. Optional sender display name is **Zeke at SendMyNotes** on a verified sending address, with `replyTo` set to Zeke's confirmed monitored mailbox. Do not invent a working email address or imply replies are monitored until verified.

Variables: `greeting` ("Hi Alex," or "Hi there," from sender name only), `cardPhrase` ("your card" / "your cards"), `paidTotal`, `shortOrderReference`, `orderStatusUrl`, `completeAddressUrl`, `offerAmount`, `offerCode`, `offerUrl`, `expiryDisplay`, `businessPostalAddress`, `unsubscribeUrl`. Order links retain existing private-access controls; optional emails never contain them. Optional name fallback does not use the recipient's name. Preview uses synthetic people and a visibly inactive example code.

All monetary/expiry strings come from the persisted order or grant; no hard-coded paid amount. No unresolved token can reach a live send. A missing business address or reply-to blocks optional sends and is visible in admin.

## T0 — Immediate receipt with thank-you

Template ID: `order_receipt_v2` (extend existing receipt variants; no additional campaign message).

**Subject:** Thanks—your SendMyNotes order is confirmed

**Preview:** Payment received. Here is what happens next.

```text
{{greeting}}

Thank you for trusting SendMyNotes with {{cardPhrase}}.

Payment received: {{paidTotal}}
Order: {{shortOrderReference}}

We have your order. Preparation and mailing updates will appear on your order page.

View your order: {{orderStatusUrl}}

Have a question or need help? Reply to this email.

Thank you,
SendMyNotes
```

For deferred addresses, use subject **Your card is reserved—add the mailing address when you're ready**, replace the preparation paragraph with **“Your card is reserved. Add the recipient's mailing address so we can prepare it for mailing.”**, and replace the CTA with **Add the mailing address: {{completeAddressUrl}}**. Preserve existing necessary receipt details through secure rendering; do not introduce claims of immediate manufacture or guaranteed arrival.

For multi-card orders use correct singular/plural wording. An explicitly scheduled order describes its saved schedule accurately. Do not send the confirmed-payment variant for an unsettled payment, comp or mock event. Discounted receipts show actual capture and any existing itemized discount, never $9 by assumption. No promotional footer, discount, referral ask or marketing unsubscribe in this necessary transaction message.

## T1 — Experience check-in

Template ID: `experience_check_v1`.

**Subject:** A quick check-in from Zeke at SendMyNotes

**Preview:** I'd love to hear how sending your card went.

```text
{{greeting}}

Zeke here, founder of SendMyNotes. Thank you for trusting us with {{cardPhrase}}.

If you've heard from the person you sent it to, I'd love to know how it went.
Was there anything about sending it that felt confusing or harder than it should have?

Just reply here—I read these myself.

Thanks,
Zeke
Founder, SendMyNotes

You're receiving this because you chose SendMyNotes follow-ups and offers.
Stop follow-ups and offers: {{unsubscribeUrl}}
Order receipts and necessary order updates will continue.
SendMyNotes · {{businessPostalAddress}}
```

For multiple recipients, replace the first question with **“If you've heard from anyone you sent a card to, I'd love to know how it went.”** Do not infer relationships, occasions or recipient sentiment from private card text. Main action is reply; no coupon, review-site ask or extra CTA. Record replies manually in admin; never imply an automated sentiment/reply classifier exists.

Eligibility requires the optional-message permission described in the plan, plus no unresolved delivery/support issue. The footer explanation must match the actual recorded disclosure. If documented legacy consent uses different wording, render an accurate reason; do not falsely assert that the checkbox was selected.

## T2 — Next-card offer

Template ID: `next_card_offer_v1`.

**Subject:** {{offerAmount}} off a little note for someone on your mind

**Preview:** A thank-you from SendMyNotes. Use it yourself or pass it along.

```text
{{greeting}}

A thank-you, a birthday wish, or simply a little hello—someone else may be on your mind.

As a thank-you for trying SendMyNotes, here's {{offerAmount}} off one card.

Send another card: {{offerUrl}}

Your code: {{offerCode}}
Use it yourself or pass the code to a friend. No account needed.

One redemption total, by you or a friend, through {{expiryDisplay}}.
Cannot be combined with another offer.

Thanks,
Zeke
Founder, SendMyNotes

This is a promotional offer from SendMyNotes.
You're receiving it because you chose SendMyNotes follow-ups and offers.
Stop follow-ups and offers: {{unsubscribeUrl}}
Order receipts and necessary order updates will continue.
SendMyNotes · {{businessPostalAddress}}
```

HTML primary button: **Send another card**. Use the same auto-apply URL in text. Format expiration with a clear date/time/timezone drawn from the stored grant, e.g. an actual end-of-day America/Chicago timestamp if that is the stored value. Do not use a false countdown or reset expiry. For the first program `offerAmount` is `$1`; changing it requires updating the grant, not only copy.

Sharing means passing the public code/offer link, not giving SendMyNotes a friend's address. Do not build an email-your-friend form. The shared link reveals no source order, sender email, personal card content or account access. A forwarded email contains a sender-specific unsubscribe link; only that token can opt its original subscriber out, and it grants no other access. The sharing instruction specifically asks for the code, not the whole email.

## Shared optional-email headers and unsubscribe page

```text
List-Unsubscribe: <{{unsubscribeUrl}}>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

Provider tags: program `post_purchase_v1`, stage, template version and opaque message ID. No customer data in tags. SDK request options carry the stable idempotency key separately from the payload.

Visible unsubscribe GET page:

> Stop SendMyNotes follow-ups and offers?
>
> You will still receive receipts and necessary updates about your orders.
>
> **Stop follow-ups and offers**

POST confirmation:

> You're unsubscribed from SendMyNotes follow-ups and offers.
>
> Your order receipts and necessary order updates will continue.

Repeated POST is successful and harmless. RFC 8058 POST returns 200/202 with no interactive confirmation; ordinary browser GET alone never changes preferences. No login, reason questionnaire or upsell. Invalid tokens show a generic help path without revealing an address. Suppression updates immediately and remains effective even if the scheduler is paused.

## Preview and acceptance checklist

Verify synthetic one-card/multiple-card, missing name, HTML injection, long code, exact expiration/timezone, discounted receipt, deferred-address and support-hold cases. Inspect desktop/mobile HTML and plain text. Confirm the test CTA cannot redeem a real offer or access a real order. Check reply-to, visible footer, both unsubscribe methods, and no raw placeholders. Controlled-inbox evidence is a live activation check, distinct from renderer tests.
