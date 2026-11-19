import { NextRequest, NextResponse } from 'next/server';
import { checkoutPromotionBasket, checkoutPromotionDecision, normalizeCheckoutCode, verifiedPromotionOwner } from '@/lib/checkout-promotion';
import { setPromotionSession, takePromotionAttempt } from '@/lib/checkout-promotion-limiter';
import { authorizeInternationalCheckout, normalizeCountryCode } from '@/lib/mailing-destinations';
import { resolvePaymentMode } from '@/lib/payment-mode';
import { MAX_MULTI_SEND_RECIPIENTS } from '@/lib/multi-send/contracts';

const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0', 'Referrer-Policy': 'no-referrer' };

export async function POST(req: NextRequest) {
  try {
    if (Number(req.headers.get('content-length')) > 10_000) return NextResponse.json({ valid: false, error: 'This request is too large.' }, { status: 413, headers: privateHeaders });
    const text = await req.text();
    if (text.length > 10_000) return NextResponse.json({ valid: false, error: 'This request is too large.' }, { status: 413, headers: privateHeaders });
    const body = JSON.parse(text);
    const code = normalizeCheckoutCode(body?.code);
    const reference = typeof body?.reference === 'string' && body.reference.length <= 256 ? body.reference : undefined;
    const attempt = code || reference ? await takePromotionAttempt(req) : null;
    const reply = (data: object, status = 200) => {
      const response = NextResponse.json(data, { status, headers: attempt && !attempt.allowed ? { ...privateHeaders, 'Retry-After': String(attempt.retryAfter) } : privateHeaders });
      return attempt ? setPromotionSession(response, attempt.session) : response;
    };
    if (attempt && !attempt.allowed) return reply({ valid: false, reason: 'rate_limit', error: 'Too many offer attempts. Please try again shortly.' }, 429);
    if (!code && !reference && body?.action !== 'price') return reply({ valid: false, error: 'Please enter a discount code.' }, 400);
    if ((body?.code && !code) || (body?.reference && !reference)) return reply({ valid: false, reason: 'unavailable', error: 'This offer is unavailable.' }, 400);
    const workflow = body?.workflow ?? 'single';
    if (workflow !== 'single' && workflow !== 'multisend') return reply({ valid: false, error: 'Choose a supported checkout.' }, 400);
    const recipients = workflow === 'multisend' ? body?.recipients : [{ id: 'card', country: body?.country === undefined ? 'US' : body.country }];
    if (!Array.isArray(recipients) || recipients.length < 1 || recipients.length > MAX_MULTI_SEND_RECIPIENTS) return reply({ valid: false, error: 'Choose a supported recipient count.' }, 400);
    const ids = new Set<string>();
    const lines: Array<{ id: string; countryCode: string | null }> = [];
    for (const recipient of recipients) {
      const id = recipient?.id;
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id) || ids.has(id)) return reply({ valid: false, error: 'Choose valid recipients.' }, 400);
      ids.add(id);
      const countryCode = recipient.country == null || recipient.country === '' ? null : normalizeCountryCode(recipient.country);
      if ((!countryCode && recipient.country) || (workflow === 'multisend' && countryCode && countryCode !== 'US')) return reply({ valid: false, reason: 'destination_unavailable', error: 'This destination is not currently available for mailing.' }, 400);
      if (countryCode && countryCode !== 'US') {
        let paymentMode: string | undefined;
        try { paymentMode = resolvePaymentMode(); } catch { /* international preview fails closed */ }
        if (!authorizeInternationalCheckout({ countryCode, addressDeferred: Boolean(body?.addressDeferred), paymentMode }).allowed) return reply({ valid: false, reason: 'destination_unavailable', error: 'This destination is not currently available for mailing.' }, 400);
      }
      lines.push({ id, countryCode });
    }
    const ownerUid = code || reference ? await verifiedPromotionOwner(req).catch(() => undefined) : undefined;
    const basket = checkoutPromotionBasket({ recipients: lines, workflow, revision: 'preview', ownerUid });
    const result = await checkoutPromotionDecision({ req, code, reference, basket });
    if (!result.valid) return reply(result, 400);
    return reply({
      valid: true, ...(result.privateOffer ? { privateOffer: true } : { code: result.code }),
      type: result.type, value: result.value, price: result.price,
      discountAmountInCents: result.price.discountCents, finalAmountInCents: result.price.totalCents,
      isFree: result.price.totalCents === 0, lifecycleStatus: 'active',
    });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return NextResponse.json({ valid: false, error: 'Check your request and try again.' }, { status: 400, headers: privateHeaders });
    return NextResponse.json({ valid: false, error: 'Unable to validate code at this time.' }, { status: 503, headers: privateHeaders });
  }
}
