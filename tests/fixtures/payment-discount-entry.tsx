import React from "react";
import { createRoot } from "react-dom/client";
import { CheckoutStep, AppliedDiscountInfo } from "../../components/CheckoutStep";
import { Step4ReviewAndPayment } from "../../components/v3/Step4ReviewAndPayment";

declare global {
  interface Window {
    __discountResponses: Record<string, { clientSecret: string | null; discount: AppliedDiscountInfo }>;
    __applyCalls: string[];
    __providerMounts: string[];
    __paymentConfirms: Array<{ providerSecret: string; submittedElements: string }>;
    __expressConfirmCalls: number;
    __fetchCalls: Array<{ url: string; options: RequestInit }>;
    __retryCount: number;
    __successCount: number;
    __resolveApply?: () => void;
    __updateProps: (patch: Record<string, any>) => void;
    __startHarness: (kind: string, initialProps?: Record<string, any>) => void;
    __Component: React.ComponentType<any>;
    __props: Record<string, any>;
    __root: ReturnType<typeof createRoot>;
  }
}

const defaultDiscount = null;
const common = {
  orderId: "test-order",
  publishableKey: "pk_test_browser_harness",
  customerEmail: "sender@example.test",
  onChangeCustomerEmail: () => {},
  isMock: false,
  isFree: false,
  checkoutError: null,
  isUpdatingCheckout: false,
  onRetryCheckout: () => { window.__retryCount = (window.__retryCount || 0) + 1; },
  appliedDiscount: defaultDiscount,
  onApplyDiscount: async (code: string) => {
    window.__applyCalls.push(code);
    await new Promise<void>((resolve) => { window.__resolveApply = resolve; });
    const discount = window.__discountResponses[code];
    if (!discount) return { success: false, error: "Invalid code" };
    window.__updateProps({
      appliedDiscount: discount.discount,
      isFree: discount.discount.finalAmountInCents === 0,
      clientSecret: discount.clientSecret,
    });
    return { success: true };
  },
  onRemoveDiscount: async () => {
    window.__updateProps({ appliedDiscount: null, isFree: false, clientSecret: "seti_full_900" });
  },
};

function makeProps(kind: string, overrides: Record<string, any> = {}) {
  const props = {
    ...common,
    clientSecret: "seti_full_900",
    onSuccess: () => { window.__successCount = (window.__successCount || 0) + 1; },
    onPaymentSuccess: () => { window.__successCount = (window.__successCount || 0) + 1; },
    onBack: () => {},
    ...(kind === "v3" ? {
      cardTitle: "A card", cardUrl: "/card.png", salutation: "Dear Friend,", bodyNote: "Thinking of you.",
      signOff: "Warmly, Sender", fontClass: "font-handwriting", occasion: "Thinking of You",
      recipient: { fullName: "Friend", street1: "1 Test St", city: "Test", state: "IL", zip: "60000" },
      sender: { fullName: "Sender", street1: "2 Test St", city: "Test", state: "IL", zip: "60000" },
    } : {}),
    ...(kind === "legacy" ? {
      scheduledSendDate: undefined,
    } : {}),
    ...overrides,
  };
  return props;
}

window.__discountResponses = {
  PARTIAL: { clientSecret: "seti_partial_600", discount: { code: "PARTIAL", type: "FIXED_AMOUNT", value: 3, discountAmountInCents: 300, finalAmountInCents: 600, isFree: false } },
  PERCENT: { clientSecret: "seti_percent_450", discount: { code: "PERCENT", type: "PERCENTAGE", value: 50, discountAmountInCents: 450, finalAmountInCents: 450, isFree: false } },
  FREE: { clientSecret: null, discount: { code: "FREE", type: "PERCENTAGE", value: 100, discountAmountInCents: 900, finalAmountInCents: 0, isFree: true } },
  FIXED_FREE: { clientSecret: null, discount: { code: "FIXED_FREE", type: "FIXED_AMOUNT", value: 9, discountAmountInCents: 900, finalAmountInCents: 0, isFree: true } },
};
window.__startHarness = (kind: string, initialProps: Record<string, any> = {}) => {
window.__applyCalls = [];
window.__providerMounts = [];
window.__paymentConfirms = [];
window.__expressConfirmCalls = 0;
window.__fetchCalls = [];
window.__retryCount = 0;
window.fetch = async (input: RequestInfo | URL, options: RequestInit = {}) => {
  const url = String(input);
  window.__fetchCalls.push({ url, options });
  return { ok: true, json: async () => ({ success: true, viewToken: "local-test", status: "CONFIRMED" }) } as Response;
};
window.__updateProps = (patch: Record<string, any>) => {
  window.__props = { ...window.__props, ...patch };
  window.__root.render(React.createElement(window.__Component, window.__props));
};
window.__Component = kind === "v3" ? Step4ReviewAndPayment : CheckoutStep;
window.__props = makeProps(kind, initialProps);
window.__root = createRoot(document.getElementById("root")!);
window.__root.render(React.createElement(window.__Component, window.__props));
};
