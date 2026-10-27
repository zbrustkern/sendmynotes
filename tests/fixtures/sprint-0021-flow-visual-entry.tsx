import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { EnvelopePreview } from "../../components/flow/EnvelopePreview";
import { FlowHeader } from "../../components/flow/FlowHeader";

type State = "normal" | "long" | "international" | "deferred";

const sender = {
  fullName: "Sam Sender",
  street1: "456 Return Street",
  street2: "Suite 2",
  city: "Sampletown",
  state: "CA",
  zip: "90000",
  country: "US",
};

const recipients = {
  normal: {
    fullName: "Alex Sample",
    street1: "123 Example Lane",
    city: "Exampleville",
    state: "IL",
    zip: "60000",
    country: "US",
  },
  long: {
    fullName: "Zoë 李 🌿 Александра-Константинопольская",
    street1: "長い通りの名前 12345678901234567890 — Rue de l'Exemple-International",
    street2: "Apartment 1204 — 北側 · bâtiment arrière",
    city: "São Paulo",
    state: "SP",
    zip: "01000-000",
    country: "BR",
  },
  international: {
    fullName: "María-José García",
    street1: "8 Rue de l'Église, Appartement 4B",
    street2: "Quartier Saint-Jean",
    city: "Montréal",
    state: "QC",
    zip: "H2Y 1C6",
    country: "CA",
  },
  deferred: {
    fullName: "Jordan Sample",
    street1: "",
    city: "",
    state: "",
    zip: "",
    country: "US",
  },
};

function Fixture() {
  const [state, setState] = useState<State>("normal");
  const [largeText, setLargeText] = useState(false);
  const [busy, setBusy] = useState(false);
  const [total, setTotal] = useState(900);
  const [resetCount, setResetCount] = useState(0);
  const recipient = recipients[state];
  const international = state === "international" || state === "long";

  return (
    <main className={largeText ? "fixture fixture-large" : "fixture"}>
      <FlowHeader
        showClearDraft
        onClearDraft={() => setResetCount((count) => count + 1)}
        orderTotalCents={total}
        resetDisabled={busy}
      />
      <section className="controls" aria-label="Visual fixture controls">
        <h1>Envelope and reset interaction fixture</h1>
        <p>Actual flow components · fictional addresses · no checkout, APIs, or persistence.</p>
        <div className="control-row" role="group" aria-label="Recipient preview state">
          {(["normal", "long", "international", "deferred"] as State[]).map((item) => (
            <button key={item} type="button" aria-pressed={state === item} onClick={() => setState(item)}>
              {item === "long" ? "Long Unicode" : item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
        <div className="control-row">
          <label><input type="checkbox" checked={largeText} onChange={(event) => setLargeText(event.target.checked)} /> Larger text</label>
          <label><input type="checkbox" checked={busy} onChange={(event) => setBusy(event.target.checked)} /> Busy / pending reconciliation</label>
          <label>Total
            <select aria-label="Displayed authoritative total" value={total} onChange={(event) => setTotal(Number(event.target.value))}>
              <option value={900}>$9.00</option><option value={1275}>$12.75</option><option value={0}>$0.00</option>
            </select>
          </label>
        </div>
        <p role="status" aria-live="polite">Reset callbacks: <strong>{resetCount}</strong>{busy ? " · reset unavailable while busy" : ""}</p>
      </section>
      <section className="preview" aria-label="Envelope preview">
        <EnvelopePreview sender={sender} recipient={recipient} isAddressDeferred={state === "deferred"} isInternational={international} countryName={international ? (recipient.country === "CA" ? "Canada" : "Brazil") : undefined} />
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
