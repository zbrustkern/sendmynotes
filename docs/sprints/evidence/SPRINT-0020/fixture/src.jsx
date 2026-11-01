import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { EnvelopePreview } from "../../../../../components/flow/EnvelopePreview.tsx";

const samples = {
  normal: {
    sender: { fullName: "Maya O’Neil", street1: "42 Maple Avenue", street2: "Apt. 3B", city: "Chicago", state: "IL", zip: "60601", country: "US" },
    recipient: { fullName: "Jordan Rivera", street1: "18 Pine Street", street2: "Unit 07", city: "Madison", state: "WI", zip: "53703", country: "US" },
  },
  long: {
    sender: { fullName: "Renée Dvořák-Sato", street1: "0042 Rue de l’Église, Bâtiment C", street2: "Appartement 12, étage 4", city: "Montréal", state: "Québec", zip: "H2X 1Y4", country: "CA" },
    recipient: { fullName: "Zoë 李 O’Connor-Sánchez", street1: "123456789012345678901234567890123456789012345678901234567890", street2: "Unit 07, étage 2 — arrière", city: "Saint-Jean-sur-Richelieu", state: "Auvergne-Rhône-Alpes", zip: "00007", country: "FR" },
  },
  unbroken: {
    sender: { fullName: "Alexandertheexceptionallylongsendernamewithoutspaces", street1: "999999999999999999999999999999999999999999999999999999999999", city: "Chicago", state: "IL", zip: "60601", country: "US" },
    recipient: { fullName: "Recipientnamewithaverylongunbrokenstring", street1: "Apartmentbuildingaddresswithoutanyspaces012345678901234567890123456789", street2: "Suiteeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", city: "Madison", state: "WI", zip: "53703", country: "US" },
  },
  empty: {
    sender: { fullName: "", street1: "", city: "", state: "", zip: "", country: "US" },
    recipient: { fullName: "", street1: "", city: "", state: "", zip: "", country: "US" },
  },
  partial: {
    sender: { fullName: "Maya O’Neil", street1: "42 Maple Avenue", city: "Chicago", state: "IL", zip: "60601", country: "US" },
    recipient: { fullName: "Jordan Rivera", street1: "", city: "", state: "", zip: "", country: "US" },
  },
  international: {
    sender: { fullName: "Maya O’Neil", street1: "42 Maple Avenue", city: "Chicago", state: "IL", zip: "60601", country: "US" },
    recipient: { fullName: "Zoë 李", street1: "12 Rue des Fleurs", street2: "Unit 07, étage 2", city: "Lyon", state: "Auvergne-Rhône-Alpes", zip: "69002", country: "FR" },
  },
  deferred: {
    sender: { fullName: "Maya O’Neil", street1: "42 Maple Avenue", city: "Chicago", state: "IL", zip: "60601", country: "US" },
    recipient: { fullName: "Jordan Rivera", street1: "", city: "", state: "", zip: "", country: "US" },
  },
};

const fontOptions = [
  ["font-hwDavid", "Casual David (default)"],
  ["font-hwChase", "Charming Chase"],
  ["font-hwKate", "Carefree Kate"],
  ["font-hwAdam", "Executive Adam"],
  ["font-hwWill", "Dapper Will"],
];

function Fixture() {
  const params = new URLSearchParams(window.location.search);
  const initialMode = params.has("fail") ? `failure: ${params.get("fail")}` : "normal assets";
  const [scenario, setScenario] = useState("normal");
  const [fontClass, setFontClass] = useState("font-hwDavid");
  const [textScale, setTextScale] = useState("100");
  const [addresses, setAddresses] = useState(samples.normal);

  const changeScenario = (next) => {
    setScenario(next);
    setAddresses(samples[next]);
  };
  const changeAddress = (person, field, value) => {
    setAddresses((current) => ({ ...current, [person]: { ...current[person], [field]: value } }));
  };

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Isolated browser fixture · no checkout or provider calls</p>
          <h1 className="text-2xl font-semibold">SPRINT-0020 envelope preview</h1>
        </div>
        <p className="text-xs text-stone-500">Current load mode: {initialMode}</p>
      </header>

      <section className="mb-5 grid gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Address scenario
          <select value={scenario} onChange={(event) => changeScenario(event.target.value)} className="mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2">
            <option value="normal">Normal domestic</option>
            <option value="long">Long names, Unicode, apartment lines</option>
            <option value="unbroken">Long unbroken text</option>
            <option value="empty">Empty fields</option>
            <option value="partial">Partial recipient address</option>
            <option value="international">International (France)</option>
            <option value="deferred">Deferred recipient address</option>
          </select>
        </label>
        <label className="text-sm font-medium">Handwriting style
          <select value={fontClass} onChange={(event) => setFontClass(event.target.value)} className="mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2">
            {fontOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Address text size
          <select value={textScale} onChange={(event) => setTextScale(event.target.value)} className="mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2">
            <option value="100">100%</option>
            <option value="200">200%</option>
          </select>
        </label>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.15fr)]">
        <section className="min-w-0" data-preview-scale={textScale}>
          <p className="mb-2 text-sm font-semibold">Mounted production component</p>
          <EnvelopePreview
            sender={addresses.sender}
            recipient={addresses.recipient}
            fontClass={fontClass}
            isAddressDeferred={scenario === "deferred"}
            isInternational={scenario === "international"}
            countryName={scenario === "international" ? "France" : undefined}
          />
        </section>

        <section className="grid min-w-0 gap-4 sm:grid-cols-2">
          {[["sender", "Return address"], ["recipient", "Recipient address"]].map(([person, title]) => (
            <fieldset key={person} className="grid content-start gap-2 rounded-xl border border-stone-200 bg-white p-4">
              <legend className="px-1 text-sm font-semibold">{title}</legend>
              {[["fullName", "Name"], ["street1", "Street"], ["street2", "Apartment / unit"], ["city", "City"], ["state", "State / region"], ["zip", "ZIP / postal code"]].map(([field, label]) => (
                <label key={field} className="text-xs font-medium text-stone-600">{label}
                  <input value={addresses[person][field] || ""} onChange={(event) => changeAddress(person, field, event.target.value)} className="mt-1 block w-full min-w-0 rounded-md border border-stone-300 px-2.5 py-2 text-base text-stone-900" />
                </label>
              ))}
            </fieldset>
          ))}
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-stone-200 bg-white p-4 text-sm">
        <h2 className="font-semibold">Failure-state links</h2>
        <p className="mt-1 text-stone-600">Open a link to make the local fixture server return 404 for the selected resources. A reload resets browser state.</p>
        <nav className="mt-2 flex flex-wrap gap-x-4 gap-y-2 underline underline-offset-2">
          <a href="/?fail=paper">Paper texture fails</a>
          <a href="/?fail=stamp">Domestic postage fails</a>
          <a href="/?fail=fonts">Handwriting fonts fail</a>
          <a href="/?fail=all">All image and font assets fail</a>
          <a href="/">Normal assets</a>
        </nav>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<Fixture />);
