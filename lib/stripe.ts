import Stripe from "stripe";

import { resolvePaymentMode, normalizeStripeSecretKey } from "./payment-mode";

export function getStripeSecretKey(): string {
  return normalizeStripeSecretKey(process.env).secret;
}

export function getStripeClient(): Stripe {
  const secretKey = getStripeSecretKey() || "sk_test_unconfigured_placeholder";
  return new Stripe(secretKey, {
    apiVersion: "2025-01-27.acacia" as unknown as Stripe.LatestApiVersion,
    typescript: true,
  });
}

// Export singleton for backward compatibility
export const stripe = getStripeClient();

export const CARD_FLAT_RATE_CENTS = 900; // $9.00 flat rate (Card + Robot Pen + Envelope + USPS Postage)

export interface CreateIntentParams {
  orderId: string;
  customerEmail?: string;
  amountInCents?: number;
  metadata?: Record<string, string>;
}

export interface PaymentIntentResult {
  clientSecret: string | null;
  paymentIntentId: string;
  isMock: boolean;
}

export async function createCardPaymentIntent(params: CreateIntentParams): Promise<PaymentIntentResult> {
  const mode = resolvePaymentMode();
  const amountToCharge = params.amountInCents !== undefined ? params.amountInCents : CARD_FLAT_RATE_CENTS;

  if (mode === "local_mock") {
    console.log("[MOCK Stripe] Creating simulated PaymentIntent for order:", params.orderId, "amount:", amountToCharge);
    return {
      clientSecret: `mock_pi_secret_${params.orderId}_${Date.now()}`,
      paymentIntentId: `pi_mock_${params.orderId}`,
      isMock: true,
    };
  }

  const client = getStripeClient();
  const paymentIntent = await client.paymentIntents.create({
    amount: amountToCharge,
    currency: "usd",
    receipt_email: params.customerEmail,
    metadata: {
      orderId: params.orderId,
      product: "Folded A2 greeting card, written in pen and mailed",
      ...(params.metadata || {}),
    },
    payment_method_types: ["card", "link"],
  });

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    isMock: false,
  };
}

export function constructWebhookEvent(
  rawBody: string | Buffer,
  signature: string,
  secret?: string
): Stripe.Event {
  const webhookSecret =
    secret ||
    process.env["stripe-webhook-secret"] ||
    process.env.STRIPE_WEBHOOK_SECRET ||
    "";
  const client = getStripeClient();
  return client.webhooks.constructEvent(rawBody, signature, webhookSecret);
}
