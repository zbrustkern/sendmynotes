import Stripe from "stripe";

export function getStripeSecretKey(): string {
  return (
    process.env["stripe-secret-key"] ||
    process.env.STRIPE_SECRET_KEY ||
    "sk_test_placeholder_key_for_dev"
  );
}

export function getStripeClient(): Stripe {
  return new Stripe(getStripeSecretKey(), {
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
  const secret = getStripeSecretKey();
  const amountToCharge = params.amountInCents !== undefined ? params.amountInCents : CARD_FLAT_RATE_CENTS;

  if (!secret || secret.startsWith("sk_test_placeholder")) {
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
      product: "5x7 Physical Folded Greeting Card with Real Pen Inking",
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
