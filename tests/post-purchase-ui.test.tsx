import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OrderFollowupPanel } from "../components/admin/OrderFollowupPanel";
import { PostPurchaseSettingsPanel } from "../components/admin/PostPurchaseSettingsPanel";
import { PostPurchaseQueuePanel } from "../components/admin/PostPurchaseQueuePanel";
import { OrderJourneyDrawer } from "../components/admin/OrderJourneyDrawer";
import type { Order } from "../lib/types";

const followup = renderToStaticMarkup(<OrderFollowupPanel orderId="synthetic-order" />);
assert.match(followup, /Loading follow-up eligibility/);
assert.doesNotMatch(followup, /example\.com|synthetic@example/);

const settings = renderToStaticMarkup(<PostPurchaseSettingsPanel />);
assert.match(settings, /Loading follow-up settings/);
assert.match(renderToStaticMarkup(<PostPurchaseQueuePanel />), /Loading follow-up queue/);

const order: Order = { id: "synthetic-order", customerEmail: "masked@example.com", status: "PAYMENT_RECEIVED", amountInCents: 900 } as Order;
const drawer = renderToStaticMarkup(<OrderJourneyDrawer order={order} />);
assert.match(drawer, /Loading follow-up eligibility/);
assert.match(drawer, /Loading follow-up eligibility/);

console.log("Post-purchase UI render checks passed.");
