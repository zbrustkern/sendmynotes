/* Browser acceptance with synthetic records. This exercise does not initiate checkout. */
const assert = require("node:assert/strict");
const { chromium } = require(process.env.SMN_PLAYWRIGHT_MODULE || "playwright");
const base = process.env.WEDDING_BROWSER_BASE || "http://127.0.0.1:3141";
if (
  ![
    "127.0.0.1",
    "localhost",
    "sendmynotes-staging--sendmynotes-staging.us-central1.hosted.app",
  ].includes(new URL(base).hostname)
)
  throw new Error("Use local development or SendMyNotes staging.");
(async () => {
  const browser = await chromium.launch({
    ...(process.env.SMN_CHROMIUM_PATH
      ? { executablePath: process.env.SMN_CHROMIUM_PATH }
      : {}),
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(18000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const run = [];
  const dir = process.env.WEDDING_EVIDENCE_DIR;
  const capture = async (name) => {
    if (dir) {
      require("node:fs").mkdirSync(dir, { recursive: true });
      await page.screenshot({
        path: require("node:path").join(dir, name + ".png"),
        fullPage: false,
      });
    }
  };

  try {
    await page.goto(base + "/thank-you/wedding");
    await page
      .getByRole("button", { name: "Start my thank-yous", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Your card", exact: true })
      .waitFor();
    run.push("blank guest project");
    await page
      .getByRole("button", { name: "Your people", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Add a household", exact: true })
      .click();
    await page
      .getByLabel("Envelope name", { exact: true })
      .fill("Noor Vale and Kit Gale");
    await page.getByLabel("Names inside the card").fill("Noor and Kit");
    await page.getByLabel(/Use this exact envelope label/).check();
    await page.getByLabel("Gift or gesture").fill("The blue bowl");
    await page.getByLabel("Mailing country").selectOption("US");
    await page
      .getByLabel("Street address", { exact: true })
      .fill("101 Example Lane");
    await page.getByLabel("City or locality").fill("Chicago");
    await page.getByLabel("State", { exact: true }).fill("IL");
    await page.getByLabel("ZIP code").fill("60601");
    await page.getByLabel("I’ve reviewed the mailing address.").check();
    await page.getByRole("button", { name: "Save household" }).click();
    await page
      .getByRole("heading", { name: "1 household", exact: true })
      .waitFor();
    run.push("manual household");
    await page.getByRole("button", { name: "Your words", exact: true }).click();
    await page
      .getByLabel("Your shared note")
      .fill("Thank you for thinking of us!");
    await page
      .getByLabel("Sign-off", { exact: true })
      .fill("With love, Alex and Jamie");
    await page.getByRole("button", { name: "Select 1 shown" }).click();
    await page
      .getByRole("button", { name: "Review selected shared notes" })
      .click();
    await page
      .getByRole("button", {
        name: "Approve shared note for 1 selected households",
      })
      .click();
    await page.getByText("1 of 1 notes approved").waitFor();
    run.push("personal greeting and shared approval");
    await page.setViewportSize({ width: 1280, height: 850 });
    await capture("writing-desktop");
    await page.getByRole("button", { name: "Write personal wording" }).click();
    await page
      .getByLabel("Your words", { exact: true })
      .fill("Thank you for the blue bowl. We used it for lemon pasta.");
    await page.getByText("0 of 1 notes approved").waitFor();
    await page.getByRole("button", { name: "Approve & next" }).click();
    await page.getByText("1 of 1 notes approved").waitFor();
    run.push("personal override and reapproval");
    const personal = page.getByLabel("Your words", { exact: true }),
      original = await personal.inputValue();
    const total = Number(
      (
        await page
          .getByText(/^\d+\/450 characters$/)
          .first()
          .textContent()
      ).split("/")[0],
    );
    const other = total - original.length;
    for (const units of [449, 450, 451]) {
      await personal.fill("a".repeat(units - other));
      await page
        .getByText(units + "/450 characters", { exact: true })
        .waitFor();
      assert.equal(
        await page.getByRole("button", { name: "Approve & next" }).isDisabled(),
        units > 450,
      );
    }
    await personal.fill(original);
    await page.getByRole("button", { name: "Approve & next" }).click();
    await page.getByText("1 of 1 notes approved").waitFor();
    run.push("449/450/451 whole-note bounds");
    await page.reload();
    await page
      .getByRole("heading", { name: "Your words", exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel("Your words", { exact: true }).inputValue(),
      "Thank you for the blue bowl. We used it for lemon pasta.",
    );
    run.push("private resume");
    await page
      .getByRole("button", { name: "Review & send", exact: true })
      .click();
    await page.getByText(/1 ready · 0 held/).waitFor();
    assert.equal(await page.getByText(/Estimated \$9.00/).count(), 1);
    run.push("graduated review");
    await page.setViewportSize({ width: 320, height: 700 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
    );
    run.push("320px layout");
    await capture("review-mobile");
    await page.getByText("Manage sharing, recovery and tracker").click();
    await page
      .getByRole("button", { name: "Recovery or add-device link" })
      .click();
    const recovery = await page
      .getByLabel("Private link", { exact: true })
      .inputValue();
    const phone = await browser.newContext({
      viewport: { width: 320, height: 700 },
    });
    const second = await phone.newPage();
    await second.goto(recovery);
    await second
      .getByRole("button", { name: "Your words", exact: true })
      .click();
    await second.getByText("1 of 1 notes approved").waitFor();
    assert.equal(new URL(second.url()).hash, "");
    run.push("recovery on second device");
    await phone.close();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: run }, null, 2));
  } catch (e) {
    console.error(
      JSON.stringify(
        {
          passed: run,
          headings: await page.locator("h1,h2").allTextContents(),
          alerts: await page.getByRole("alert").allTextContents(),
          errors,
        },
        null,
        2,
      ),
    );
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
