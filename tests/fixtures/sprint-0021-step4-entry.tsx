import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Step4ReviewAndPayment } from "../../components/v3/Step4ReviewAndPayment";

const completeRecipient = {
  fullName: "Alex Sample", street1: "123 Example Lane", street2: "", city: "Sampleville", state: "IL", zip: "60000", country: "US",
};
const deferredRecipient = { ...completeRecipient, street1: "", street2: "" };
const sender = { fullName: "Sam Sender", street1: "456 Return Street", street2: "", city: "Sampletown", state: "CA", zip: "90000", country: "US" };
const partialDiscount = { code: "PARTIAL", type: "FIXED_AMOUNT" as const, value: 3, discountAmountInCents: 300, finalAmountInCents: 600, isFree: false };
const freeDiscount = { code: "FREE", type: "PERCENTAGE" as const, value: 100, discountAmountInCents: 900, finalAmountInCents: 0, isFree: true };

function Fixture() {
  const [email, setEmail] = useState("sender@example.test");
  const [emailRequired, setEmailRequired] = useState(false);
  const [mountKey, setMountKey] = useState(0);
  const [deferred, setDeferred] = useState(false);
  const [wallet, setWallet] = useState(false);
  const [free, setFree] = useState(false);
  const [discount, setDiscount] = useState<typeof partialDiscount | typeof freeDiscount | null>(null);
  const [contactOutcome, setContactOutcome] = useState<"success" | "failure">("success");
  const [confirmOutcome, setConfirmOutcome] = useState<"success" | "reconfirm">("success");
  const [delayContact, setDelayContact] = useState(false);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState({ contact: 0, card: 0, wallet: 0, free: 0, success: 0, retry: 0 });
  const [routes, setRoutes] = useState<string[]>([]);
  const [choice, setChoice] = useState("No contact preference saved yet");
  const recipient = deferred ? deferredRecipient : completeRecipient;

  const recordRoute = (path: string, savedEmail?: string) => {
    setRoutes((current) => [...current, path]);
    if (path === "/api/checkout/contact") {
      setCounts((current) => ({ ...current, contact: current.contact + 1 }));
      setChoice(savedEmail ? "Email preference submission attempted (value redacted)" : "Blank email preference submission attempted");
    }
    if (path === "/api/checkout/confirm-order") setCounts((current) => ({ ...current, [window.__fixtureOutcome.wallet ? "wallet" : "card"]: current[window.__fixtureOutcome.wallet ? "wallet" : "card"] + 1 }));
    if (path === "/api/checkout/complete-free-order") setCounts((current) => ({ ...current, free: current.free + 1 }));
  };
  window.__fixtureCounters = { record: recordRoute };

  const applyDiscount = async (code: string) => {
    if (code.trim().toUpperCase() === "FAIL") return { success: false, error: "Fixture promo failure" };
    const next = code.trim().toUpperCase() === "FREE" ? freeDiscount : partialDiscount;
    setDiscount(next);
    setFree(next.isFree);
    return { success: true };
  };
  const removeDiscount = () => { setDiscount(null); setFree(false); };

  const props = {
    cardTitle: "A thoughtful note", cardUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='110' viewBox='0 0 80 110'%3E%3Crect width='80' height='110' fill='%23e8e3cf'/%3E%3Cpath d='M0 65h80v45H0z' fill='%237c9275'/%3E%3C/svg%3E", salutation: "Dear Alex,",
    bodyNote: "Thinking of you and sending a little joy.", signOff: "Warmly, Sam", fontClass: "font-hwDavid", fontStyleId: "hwDavid", occasion: "Thinking of You",
    recipient, sender, customerEmail: email, onChangeCustomerEmail: setEmail,
    orderId: "fixture-order", viewToken: "fixture-view-token", clientSecret: free ? null : "seti_fixture_900",
    publishableKey: "pk_test_local_fixture_only", isMock: false, isFree: free, amountInCents: discount?.finalAmountInCents ?? 900,
    destinationCountry: "US", isUpdatingCheckout: false, checkoutError: null,
    onRetryCheckout: () => setCounts((current) => ({ ...current, retry: current.retry + 1 })),
    onApplyDiscount: applyDiscount, onRemoveDiscount: removeDiscount, appliedDiscount: discount,
    onPaymentSuccess: () => setCounts((current) => ({ ...current, success: current.success + 1 })),
    onPaymentStateChange: setBusy, onBack: () => {},
  };

  const remount = () => setMountKey((value) => value + 1);
  return (
    <main className="fixture-root">
      <header className="fixture-controls">
        <h1>Step 4 checkout state fixture</h1>
        <p>Actual Step 4 component · fictional data · local mock payment/provider only · no real checkout requests.</p>
        <div className="fixture-row" role="group" aria-label="Contact and address scenarios">
          <button type="button" onClick={() => setEmail("alex@example.test")}>Simulate late auth email</button>
          <button type="button" onClick={() => setEmail("")}>Clear email</button>
          <button type="button" onClick={remount}>Remount Step 4</button>
          <button type="button" aria-pressed={!deferred} onClick={() => setDeferred(false)}>Complete address</button>
          <button type="button" aria-pressed={deferred} onClick={() => setDeferred(true)}>Deferred address</button>
        </div>
        <div className="fixture-row" role="group" aria-label="Payment scenarios">
          <button type="button" aria-pressed={!wallet} onClick={() => { setWallet(false); window.__fixtureSetOutcome("wallet", false); }}>Card path</button>
          <button type="button" aria-pressed={wallet} onClick={() => { setWallet(true); window.__fixtureSetOutcome("wallet", true); }}>Wallet path</button>
          <button type="button" aria-pressed={free} onClick={() => { setDiscount(freeDiscount); setFree(true); }}>Free order</button>
          <button type="button" onClick={() => setDiscount(partialDiscount)}>Partial promo</button>
          <button type="button" onClick={() => { setDiscount(null); setFree(false); }}>Remove promo</button>
        </div>
        <div className="fixture-row" role="group" aria-label="Mock API outcomes">
          <label>Contact save
            <select aria-label="Contact save outcome" value={contactOutcome} onChange={(event) => { const value = event.target.value as "success" | "failure"; setContactOutcome(value); window.__fixtureSetOutcome("contact", value); }}>
              <option value="success">Success</option><option value="failure">Failure</option>
            </select>
          </label>
          <label>Confirm order
            <select aria-label="Confirm order outcome" value={confirmOutcome} onChange={(event) => { const value = event.target.value as "success" | "reconfirm"; setConfirmOutcome(value); window.__fixtureSetOutcome("confirm", value); }}>
              <option value="success">Success</option><option value="reconfirm">Capture then 409 reconfirm</option>
            </select>
          </label>
          <button type="button" onClick={() => { setEmailRequired((value) => !value); setEmail(emailRequired ? "" : "invalid"); }}>
            {emailRequired ? "Use ordinary email state" : "Invalid email"}
          </button>
          <label><input type="checkbox" checked={delayContact} onChange={(event) => { setDelayContact(event.target.checked); window.__fixtureSetOutcome("delayContact", event.target.checked); }} /> Delay contact save</label>
        </div>
        <div className="fixture-observations" role="status" aria-live="polite">
          <strong>Redacted observations</strong>
          <span>Contact writes: {counts.contact}</span><span>Card confirms: {counts.card}</span><span>Wallet confirms: {counts.wallet}</span><span>Free completions: {counts.free}</span>
          <span>Payment callbacks: {counts.success}</span><span>Retry callbacks: {counts.retry}</span><span>In progress: {String(busy)}</span>
          <span>{choice}</span>
          <span>Mock routes: {routes.length ? routes.join(" → ") : "none"}</span>
        </div>
      </header>
      <section className="fixture-payment" aria-label="Checkout payment interface">
        <Step4ReviewAndPayment key={mountKey} {...props} />
      </section>
      <div hidden data-fixture-mock-state>{contactOutcome}|{confirmOutcome}|{String(wallet)}</div>
    </main>
  );
}

const root = createRoot(document.getElementById("root")!);
window.__fixtureOutcome = { contact: "success", confirm: "success", wallet: false, delayContact: false };
window.__fixtureSetOutcome = (key: "contact" | "confirm" | "wallet" | "delayContact", value: string | boolean) => {
  (window.__fixtureOutcome as Record<string, string | boolean>)[key] = value;
};
root.render(<Fixture />);

declare global {
  interface Window {
    __fixtureOutcome: { contact: string; confirm: string; wallet: boolean; delayContact: boolean };
    __fixtureSetOutcome: (key: "contact" | "confirm" | "wallet" | "delayContact", value: string | boolean) => void;
    __fixtureCounters?: { record: (path: string, email?: string) => void };
  }
}
