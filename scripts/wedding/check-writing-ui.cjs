/* Browser acceptance with synthetic records. This exercise does not initiate checkout. */
const assert = require("node:assert/strict");
const { chromium } = require(process.env.SMN_PLAYWRIGHT_MODULE || "playwright");
const base = process.env.WEDDING_BROWSER_BASE || "http://127.0.0.1:3141";
if (
  ![
    "127.0.0.1",
    "localhost",
    "staging.sendmynotes.com",
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
  let activePage = page;
  page.setDefaultTimeout(18000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const run = [];
  const dir = process.env.WEDDING_EVIDENCE_DIR;
  const capture = async (name) => {
    if (dir) {
      require("node:fs").mkdirSync(dir, { recursive: true });
      await page.evaluate(async () => {
        await document.fonts.ready;
        document.activeElement?.blur?.();
        window.scrollTo(0, 0);
        await new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        );
      });
      await page.screenshot({
        path: require("node:path").join(dir, name + ".png"),
        fullPage: false,
      });
    }
  };

  try {
    await page.goto(base + "/");
    await page
      .getByRole("link", { name: "Thank-you notes", exact: true })
      .waitFor();
    await page.goto(base + "/send?utm_source=validator");
    await page
      .getByRole("link", { name: "Thank-you notes", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Wedding thank-you notes", exact: true })
      .click();
    assert.equal(
      new URL(page.url()).searchParams.get("utm_source"),
      "validator",
    );
    run.push("discoverable from home and send, attribution retained");
    await page
      .getByRole("button", { name: "Start my thank-yous", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Your card", exact: true })
      .waitFor();
    run.push("blank guest project");
    assert.equal(await page.getByLabel("Choose photo").count(), 1);
    let peopleFocused = false;
    for (let tab = 0; tab < 60 && !peopleFocused; tab++) {
      await page.keyboard.press("Tab");
      peopleFocused = await page
        .getByRole("button", { name: "Your people", exact: true })
        .evaluate((el) => el === document.activeElement);
    }
    assert.equal(peopleFocused, true);
    await page.keyboard.press("Enter");
    await page
      .getByRole("button", { name: "Upload a guest or gift list" })
      .waitFor();
    run.push(
      "keyboard navigation and distinct photo and address upload controls",
    );
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
    const device = await ctx.newCDPSession(page);
    await device.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
    assert.equal(await page.evaluate(() => visualViewport.scale), 2);
    assert.equal(await page.getByText(/1 ready · 0 held/).isVisible(), true);
    await device.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
    await device.detach();
    run.push("mobile review remains readable at 200% browser magnification");
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
    // A separate guest starts a synthetic 100-envelope project. Two personal
    // bodies survive both the batch approval and a subsequent shared edit.
    const familyContext = await browser.newContext({
      viewport: { width: 1280, height: 850 },
    });
    const desk = await familyContext.newPage();
    activePage = desk;
    desk.setDefaultTimeout(30000);
    desk.on("pageerror", (e) => errors.push(e.message));
    await desk.goto(base + "/thank-you/wedding");
    await desk
      .getByRole("button", { name: "Try a sample list", exact: true })
      .click();
    await desk
      .getByRole("heading", { name: "100 households", exact: true })
      .waitFor();
    await desk.getByRole("button", { name: "Your words", exact: true }).click();
    await desk
      .getByLabel("Your shared note", { exact: true })
      .fill("Thank you for celebrating with us. We are so glad to know you.");
    await desk
      .getByLabel("Sign-off", { exact: true })
      .fill("With love, Alex and Jamie");
    for (const n of [1, 2]) {
      await desk
        .locator("label")
        .filter({ hasText: /^Household/ })
        .locator("select")
        .selectOption({ label: "Sample household " + n });
      await desk
        .getByRole("button", { name: "Write personal wording", exact: true })
        .click();
      await desk
        .getByLabel("Your words", { exact: true })
        .fill(
          "Thank you for the lovely gift. This is our personal note " + n + ".",
        );
      await desk
        .getByRole("button", { name: "Approve & next", exact: true })
        .click();
      await desk
        .getByText(n + " of 100 notes approved", { exact: true })
        .waitFor();
    }
    await desk
      .getByRole("button", { name: "Select 100 shown", exact: true })
      .click();
    await desk
      .getByRole("button", {
        name: "Review selected shared notes",
        exact: true,
      })
      .click();
    await desk
      .getByRole("button", {
        name: "Approve shared note for 98 selected households",
        exact: true,
      })
      .click();
    await desk
      .getByText("100 of 100 notes approved", { exact: true })
      .waitFor();
    if (process.env.WEDDING_EXPECT_SAMPLE_READY === "96") {
      await desk.getByText("96 ready to send", { exact: true }).waitFor();
      await desk
        .getByRole("button", { name: "Review & send", exact: true })
        .click();
      await desk
        .getByText("96 ready · 4 held · 0 purchased.", { exact: true })
        .waitFor();
      await desk.getByText(/including 3 international/).waitFor();
      await desk
        .getByRole("button", { name: "Your words", exact: true })
        .click();
      run.push(
        "96 confirmed, four held and three international sample envelopes",
      );
    }
    if (dir) {
      await desk.evaluate(async () => {
        await document.fonts.ready;
        window.scrollTo(0, 0);
        await new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        );
      });
      await desk.screenshot({
        path: require("node:path").join(dir, "writing-100-households.png"),
      });
    }
    await desk
      .getByLabel("Your shared note", { exact: true })
      .fill("Thank you for celebrating with us. We treasure the day.");
    await desk.getByText("2 of 100 notes approved", { exact: true }).waitFor();
    run.push(
      "100 households, 2 personal and 98 shared approvals; inherited-only invalidation",
    );
    await desk.getByRole("button", { name: "Write individual notes" }).click();
    await desk.getByRole("heading", { name: "Your writing list" }).waitFor();
    const current = desk.locator("#wed-current-writer");
    const previousName = await current.innerText();
    const next = desk.getByRole("button", { name: "Approve & next" });
    await desk.waitForFunction(() => {
      const button = [...document.querySelectorAll("button")].find(
        (item) => item.textContent.trim() === "Approve & next",
      );
      return button && !button.disabled;
    });
    await next.press("Enter");
    await desk.waitForFunction((previous) => {
      const heading = document.getElementById("wed-current-writer");
      return (
        heading === document.activeElement && heading?.textContent !== previous
      );
    }, previousName);
    await desk
      .getByRole("status")
      .filter({ hasText: "Approved " })
      .first()
      .waitFor();
    run.push(
      "keyboard approval moves focus to the next household and announces the saved card",
    );
    await familyContext.close();
    assert.deepEqual(errors, []);
    const receipt = {
      host: new URL(base).host,
      observedAt: new Date().toISOString(),
      passed: run,
    };
    if (dir)
      require("node:fs").writeFileSync(
        require("node:path").join(dir, "writing-checks.json"),
        JSON.stringify(receipt, null, 2) + "\n",
      );
    console.log(JSON.stringify(receipt, null, 2));
  } catch (e) {
    console.error(
      JSON.stringify(
        {
          passed: run,
          headings: await activePage.locator("h1,h2").allTextContents(),
          alerts: await activePage.getByRole("alert").allTextContents(),
          focus: await activePage.evaluate(() => ({
            tag: document.activeElement?.tagName,
            id: document.activeElement?.id,
            writer: document.getElementById("wed-current-writer")?.textContent,
          })),
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
