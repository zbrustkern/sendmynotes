import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EnvelopePreview } from "../components/flow/EnvelopePreview";

const sender = {
  fullName: "Maya O’Neil",
  street1: "0042 Rue de l’Église",
  street2: "Apt. 3B",
  city: "Montréal",
  state: "QC",
  zip: "H2X 1Y4",
  country: "CA",
};
const recipient = {
  fullName: "Zoë 李",
  street1: "12 Rue des Fleurs",
  street2: "Unit 07, étage 2",
  city: "Lyon",
  state: "Auvergne-Rhône-Alpes",
  zip: "69002",
  country: "FR",
};
const render = (props: Partial<React.ComponentProps<typeof EnvelopePreview>> = {}) =>
  renderToStaticMarkup(React.createElement(EnvelopePreview, { sender, recipient, ...props }));
const check = (condition: boolean, label: string) => {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
};

const exact = render({ countryName: "France", fontClass: "font-hwDavid" });
check(exact.includes("Maya O’Neil") && exact.includes("0042 Rue de l’Église"), "sender address values remain exact and selectable DOM text");
check(exact.includes("Apt. 3B") && exact.includes("Unit 07, étage 2"), "sender and recipient apartment lines stay on their own lines");
check(exact.includes("Zoë 李") && exact.includes("Montréal") && exact.includes("H2X 1Y4"), "Unicode and leading-zero postal data are preserved");
check(exact.includes("Auvergne-Rhône-Alpes") && exact.includes("France"), "region and catalog country name are rendered without loss");
check(exact.includes("font-hwDavid") && exact.includes("aria-label=\"Recipient address\""), "fontClass contract and accessible recipient label remain");
check(render({ sender: { ...sender, city: "", state: "", zip: "" } }).includes("City, State ZIP"), "fully empty domestic locality uses neutral example text");
check(exact.includes("/images/envelope-preview/envelope-paper.webp") && exact.includes("bg-white"), "paper image has an underlying white fallback surface");
check(exact.includes("/images/envelope-preview/postage-domestic.webp") === false, "international destination gets neutral CSS postage, not domestic stamp art");
check(exact.includes("Postage") && !exact.includes("AIRMAIL"), "international postage stays neutral without a service claim");
check(exact.includes("Illustrative preview · Postage design may vary."), "illustrative caption remains visible");

const deferred = render({ isAddressDeferred: true, countryName: "France" });
check(deferred.includes("Street address to be added later"), "deferred address state names the missing street address");
check(!deferred.includes("12 Rue des Fleurs") && !deferred.includes("Unit 07, étage 2") && !deferred.includes("69002"), "deferred state does not imply placeholder mailing lines are ready");

const fallback = render({ recipient: { ...recipient, country: "FR" }, countryName: undefined });
check(fallback.includes("FR"), "country code is used only when catalog country name is unavailable");
