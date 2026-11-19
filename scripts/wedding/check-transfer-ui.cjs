/* Verify the normal transfer control with a synthetic persisted legacy draft. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.SMN_PLAYWRIGHT_MODULE || "playwright");
const base = process.env.WEDDING_BROWSER_BASE || "http://127.0.0.1:3141";
if (
  ![
    "localhost",
    "127.0.0.1",
    "staging.sendmynotes.com",
    "sendmynotes-staging--sendmynotes-staging.us-central1.hosted.app",
  ].includes(new URL(base).hostname)
)
  throw new Error("Use local development or staging.");
(async () => {
  const browser = await chromium.launch({
    ...(process.env.SMN_CHROMIUM_PATH
      ? { executablePath: process.env.SMN_CHROMIUM_PATH }
      : {}),
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1000, height: 780 },
    });
    page.setDefaultTimeout(35000);
    await page.addInitScript(() => {
      if (
        location.pathname !== "/preview/entry" ||
        sessionStorage.getItem("sendmynotes_draft_v1")
      )
        return;
      const date = Date.now(),
        person = (name, n) => ({
          name,
          addressLine1: n + 100 + " Example Lane",
          addressLine2: "",
          city: "Chicago",
          state: "IL",
          zip: "60601",
          country: "US",
        });
      const recipients = [
        {
          id: crypto.randomUUID(),
          address: person("Noor Vale and Kit Gale", 1),
          greeting: { mode: "custom", text: "Dear Noor and Kit," },
        },
        {
          id: crypto.randomUUID(),
          address: person("Robin Finch", 2),
          greeting: { mode: "custom", text: "" },
        },
      ];
      const note = {
        salutation: "Dear friends,",
        text: "Thank you for your kindness.",
        signOff: "With love, Alex",
        style: "hwDavid",
      };
      sessionStorage.setItem(
        "sendmynotes_draft_v1",
        JSON.stringify({
          schemaVersion: 1,
          createdAt: date,
          updatedAt: date,
          draftRevision: 5,
          experienceVersion: "candidate_v1",
          entryContext: "general",
          selectedDesign: {
            presetId: "preset-thankyou-botanical",
            imageUrl: "/presets/thank-you-botanical.jpg",
            title: "Wildflower Meadow",
            source: "preset",
            accepted: true,
            occasion: "Thank You",
          },
          note,
          recipient: recipients[0].address,
          sender: person("Alex and Jamie", 0),
          multiSend: {
            version: 1,
            checkoutId: crypto.randomUUID(),
            note,
            recipients,
          },
          schedule: null,
          discountCode: null,
          attribution: null,
          customGeneration: { status: "idle" },
          checkoutSnapshotId: null,
          checkoutContact: { choice: "omitted", email: "" },
          currentStep: "address",
        }),
      );
    });
    await page.goto(base + "/preview/entry?step=address");
    await page
      .getByRole("button", {
        name: "Continue as a thank-you project",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: "Copy my batch into a wedding project",
        exact: true,
      })
      .click();
    await page.waitForURL("**/thank-you/wedding", { timeout: 35000 });
    await page
      .getByRole("button", { name: "Your people", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "2 households", exact: true })
      .waitFor();
    const result = await page.evaluate(async () => {
      const r = await fetch("/api/wedding/project", { cache: "no-store" }),
        d = await r.json();
      const rows = d.households.sort((a, b) =>
        a.envelopeName.localeCompare(b.envelopeName),
      );
      return {
        households: rows.length,
        customGreeting: rows[0].greeting === "Dear Noor and Kit,",
        blankGreeting: rows[1].greeting === "",
        notesUnapproved: rows.every(
          (x) => !x.approvedFingerprint && !x.paidBatchId,
        ),
        sharedBody: d.project.sharedBody === "Thank you for your kindness.",
        previousDraftRetained: !!JSON.parse(
          sessionStorage.getItem("sendmynotes_draft_v1") || "{}",
        ).multiSend,
      };
    });
    assert.deepEqual(result, {
      households: 2,
      customGreeting: true,
      blankGreeting: true,
      notesUnapproved: true,
      sharedBody: true,
      previousDraftRetained: true,
    });
    const receipt = {
      host: new URL(base).host,
      observedAt: new Date().toISOString(),
      passed: result,
    };
    if (process.env.WEDDING_EVIDENCE_DIR) {
      fs.mkdirSync(process.env.WEDDING_EVIDENCE_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(process.env.WEDDING_EVIDENCE_DIR, "transfer-checks.json"),
        JSON.stringify(receipt, null, 2) + "\n",
      );
    }
    console.log(JSON.stringify(receipt, null, 2));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
