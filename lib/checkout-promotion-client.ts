import type { CheckoutPriceComponents } from './checkout-promotion';

export type CheckoutOfferSource = { code: string; reference?: never } | { reference: string; code?: never };
export type CheckoutPromotionPreview = {
  valid: boolean;
  code?: string;
  type?: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value?: number;
  isFree?: boolean;
  price?: CheckoutPriceComponents;
  reason?: string;
  error?: string;
  requiresExchange?: boolean;
};
export type CheckoutPriceInput = { country: string | null; addressDeferred?: boolean } | {
  workflow: 'multisend'; recipients: { id: string; country: string | null }[];
};

declare global {
  interface Window { smnLinkedOffer?: Promise<string | null> }
}

export async function exchangePromotion(code: string): Promise<string | null> {
  const response = await fetch('/api/discount/exchange', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, referrerPolicy: 'no-referrer', body: JSON.stringify({ code }),
  });
  if (!response.ok) return null;
  const result = await response.json();
  return typeof result.reference === 'string' ? result.reference : null;
}

export async function previewCheckoutPromotion(basket: CheckoutPriceInput, source?: CheckoutOfferSource, authToken?: string | null) {
  const read = async (offer?: CheckoutOfferSource): Promise<CheckoutPromotionPreview> => {
    const response = await fetch('/api/discount/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
      referrerPolicy: 'no-referrer',
      body: JSON.stringify({ action: 'price', ...basket, ...offer }),
    });
    return response.json();
  };
  const initial = await read(source);
  if (initial.requiresExchange && source?.code) {
    const reference = await exchangePromotion(source.code);
    if (reference) {
      const exchanged: CheckoutOfferSource = { reference };
      return { result: await read(exchanged), source: exchanged };
    }
    return { result: initial, source: undefined };
  }
  return { result: initial, source };
}
