import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "sk_test_placeholder_key_for_dev";

export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2025-01-27.acacia" as unknown as Stripe.LatestApiVersion,
  typescript: true,
});

export const CARD_FLAT_RATE_CENTS = 900; // $9.00 flat rate (Card + Robot Pen + Envelope + USPS Postage)

export interface CreateIntentParams {
  orderId: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}

export interface PaymentIntentResult {
  clientSecret: string | null;
  paymentIntentId: string;
  isMock: boolean;
}

export async function createCardPaymentIntent(params: CreateIntentParams): Promise<PaymentIntentResult> {
  const secret = process.env.STRIPE_SECRET_KEY;

  if (!secret || secret.startsWith("sk_test_placeholder")) {
    console.log("[MOCK Stripe] Creating simulated PaymentIntent for order:", params.orderId);
    return {
      clientSecret: `mock_pi_secret_${params.orderId}_${Date.now()}`,
      paymentIntentId: `pi_mock_${params.orderId}`,
      isMock: true,
    };
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: CARD_FLAT_RATE_CENTS,
    currency: "usd",
    receipt_email: params.customerEmail,
    metadata: {
      orderId: params.orderId,
      product: "5x7 Physical Folded Greeting Card with Robot Pen Inking",
      ...(params.metadata || {}),
    },
    automatic_payment_methods: {
      enabled: true,
    },
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
  secret: string
): Stripe.Event {
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}
