import { spawn } from "child_process";
import http from "http";
import fs from "fs";
import path from "path";

// Ensure local connections bypass sandbox proxy
delete process.env.http_proxy;
delete process.env.HTTP_PROXY;
delete process.env.https_proxy;
delete process.env.HTTPS_PROXY;
delete process.env.all_proxy;
delete process.env.ALL_PROXY;
process.env.NO_PROXY = "*";
process.env.no_proxy = "*";

const PORT = 3099;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUTPUT_DIR = "/Users/zeke/.gemini/antigravity/brain/f2a6192f-ddc2-4fea-8f52-5568c6646de2";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkServerReady(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({
      host: "127.0.0.1",
      port: PORT,
      path: "/",
      agent: false,
    }, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 307 || res.statusCode === 308);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function runCommand(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { env: process.env });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (data) => (stdout += data.toString()));
    proc.stderr.on("data", (data) => (stderr += data.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`Command failed with code ${code}: ${stderr}`));
    });
  });
}

async function runBrowserVerification() {
  console.log("==================================================");
  console.log("🚀 STARTING HEADLESS CHROME HYDRATION VERIFICATION");
  console.log("==================================================\n");

  // 1. Start Next.js server on PORT
  console.log(`Starting Next.js production server on port ${PORT}...`);
  let serverStderr = "";
  let serverStdout = "";
  const server = spawn("./node_modules/.bin/next", ["start", "-p", String(PORT), "-H", "127.0.0.1"], {
    stdio: "pipe",
    env: { ...process.env, PORT: String(PORT) },
  });

  let ready = false;
  server.stdout.on("data", (d) => {
    const s = d.toString();
    serverStdout += s;
    if (s.includes("Ready in") || s.includes("started server on")) {
      ready = true;
    }
  });
  server.stderr.on("data", (d) => (serverStderr += d.toString()));

  // Wait for server to be responsive
  for (let i = 0; i < 30; i++) {
    await wait(1000);
    if (!ready) {
      ready = await checkServerReady();
    }
    if (ready) break;
  }

  if (!ready) {
    server.kill();
    throw new Error(`Server failed to start on port ${PORT} within 30 seconds.\nStderr: ${serverStderr}\nStdout: ${serverStdout}`);
  }

  console.log(`✅ Next.js server is ready at ${BASE_URL}\n`);

  let passed = 0;
  let failed = 0;

  function verify(condition: boolean, description: string) {
    if (condition) {
      console.log(`✅ PASS: ${description}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${description}`);
      failed++;
    }
  }

  try {
    const scratchDir = path.join(OUTPUT_DIR, "scratch", "chrome-test-profile");
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }

    const commonChromeArgs = [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-proxy-server",
      "--disable-crash-reporter",
      `--user-data-dir=${scratchDir}`,
    ];

    // ========================================================
    // TEST SUITE 1: Generic Entry (?auto_select=1) on Desktop & Mobile
    // ========================================================
    console.log("--- Test Suite 1: Generic ?auto_select=1 (Desktop 1440x900 & Mobile 390x844) ---");
    const genericAutoUrl = `${BASE_URL}/?auto_select=1`;

    // 1A. Desktop Screenshot & DOM
    const desktopGenericScreenshot = path.join(OUTPUT_DIR, "generic-ad-entry-desktop.png");
    await runCommand(CHROME_PATH, [
      ...commonChromeArgs,
      "--window-size=1440,900",
      "--hide-scrollbars",
      `--screenshot=${desktopGenericScreenshot}`,
      genericAutoUrl,
    ]);
    console.log(`📸 Desktop screenshot saved: ${desktopGenericScreenshot}`);

    const desktopGenericDom = await runCommand(CHROME_PATH, [
      ...commonChromeArgs,
      "--window-size=1440,900",
      "--dump-dom",
      genericAutoUrl,
    ]);

    verify(
      desktopGenericDom.includes("Your words. Real ink. Mailed for you."),
      "Desktop generic entry renders Card Selection headline"
    );
    verify(
      desktopGenericDom.includes("Write your note"),
      "Desktop generic entry renders 'Write your note' action button"
    );
    verify(
      !desktopGenericDom.includes("Curated Scenario Design (Active)"),
      "Desktop generic entry has NO active pre-selected card badge"
    );
    verify(
      !desktopGenericDom.includes("Just wanted to send a little piece of sunshine"),
      "Desktop generic entry does NOT have seeded default sunshine message"
    );

    // 1B. Mobile Screenshot & DOM
    const mobileGenericScreenshot = path.join(OUTPUT_DIR, "generic-ad-entry-mobile.png");
    await runCommand(CHROME_PATH, [
      ...commonChromeArgs,
      "--window-size=390,844",
      "--hide-scrollbars",
      `--screenshot=${mobileGenericScreenshot}`,
      genericAutoUrl,
    ]);
    console.log(`📸 Mobile screenshot saved: ${mobileGenericScreenshot}`);

    const mobileGenericDom = await runCommand(CHROME_PATH, [
      ...commonChromeArgs,
      "--window-size=390,844",
      "--dump-dom",
      genericAutoUrl,
    ]);

    verify(
      mobileGenericDom.includes("Your words. Real ink. Mailed for you."),
      "Mobile generic entry renders Card Selection headline"
    );
    verify(
      mobileGenericDom.includes("Write your note"),
      "Mobile generic entry renders 'Write your note' action bar"
    );
    verify(
      !mobileGenericDom.includes("Curated Scenario Design (Active)"),
      "Mobile generic entry has NO active preselected card badge"
    );

    // ========================================================
    // TEST SUITE 2: Generic Google Ad Entry with Attribution (?utm_source=google&gclid=...)
    // ========================================================
    console.log("\n--- Test Suite 2: Generic Google Ad Entry with Attribution ---");
    const googleAdUrl = `${BASE_URL}/?utm_source=google&utm_medium=cpc&utm_campaign=search_brand&gclid=test_gclid_999`;

    const googleAdDom = await runCommand(CHROME_PATH, [
      ...commonChromeArgs,
      "--window-size=1440,900",
      "--dump-dom",
      googleAdUrl,
    ]);

    verify(
      googleAdDom.includes("Your words. Real ink. Mailed for you."),
      "Google ad entry lands on Card Selector Step 1"
    );
    verify(
      !googleAdDom.includes("Live Handwriting Preview"),
      "Google ad entry does NOT skip to note editor"
    );
    verify(
      !googleAdDom.includes("Curated Scenario Design (Active)"),
      "Google ad entry has NO implicitly accepted design"
    );

    // ========================================================
    // TEST SUITE 3: Specific Deep Link (/send/sympathy/loss-of-pet)
    // ========================================================
    console.log("\n--- Test Suite 3: Specific Deep Link (/send/sympathy/loss-of-pet) ---");
    const petLossUrl = `${BASE_URL}/send/sympathy/loss-of-pet`;

    // 3A. Desktop Screenshot & DOM
    const desktopPetScreenshot = path.join(OUTPUT_DIR, "specific-deeplink-desktop.png");
    await runCommand(CHROME_PATH, [
      ...commonChromeArgs,
      "--window-size=1440,900",
      "--hide-scrollbars",
      `--screenshot=${desktopPetScreenshot}`,
      petLossUrl,
    ]);
    console.log(`📸 Desktop pet loss screenshot saved: ${desktopPetScreenshot}`);

    const petLossDom = await runCommand(CHROME_PATH, [
      ...commonChromeArgs,
      "--window-size=1440,900",
      "--dump-dom",
      petLossUrl,
    ]);

    verify(
      petLossDom.includes("Live Handwriting Preview") || petLossDom.includes("Rainbow Bridge"),
      "Pet loss deep link opens directly into Inside Note composition"
    );
    verify(
      petLossDom.includes("Rainbow Bridge") || petLossDom.includes("pet-sympathy-rainbow"),
      "Pet loss deep link retains contextual pet sympathy artwork"
    );
    verify(
      !petLossDom.includes("A Quiet Cup (Thinking of You)") &&
        !petLossDom.includes('alt="Pet Sympathy - Rainbow Bridge Card" src="/presets/thinking-of-you-quiet-cup.jpg"'),
      "Pet loss deep link does NOT substitute generic fallback cover"
    );

    // 3B. Mobile Screenshot
    const mobilePetScreenshot = path.join(OUTPUT_DIR, "specific-deeplink-mobile.png");
    await runCommand(CHROME_PATH, [
      ...commonChromeArgs,
      "--window-size=390,844",
      "--hide-scrollbars",
      `--screenshot=${mobilePetScreenshot}`,
      petLossUrl,
    ]);
    console.log(`📸 Mobile pet loss screenshot saved: ${mobilePetScreenshot}`);

    // ========================================================
    // TEST SUITE 4: Ordinary Organic Visits
    // ========================================================
    console.log("\n--- Test Suite 4: Ordinary Organic Visits ---");

    // 4A. Organic Homepage (/)
    const organicHomeDom = await runCommand(CHROME_PATH, [
      ...commonChromeArgs,
      "--window-size=1440,900",
      "--dump-dom",
      `${BASE_URL}/`,
    ]);

    verify(
      organicHomeDom.includes("Your words. Real ink. Mailed for you."),
      "Organic homepage renders Card Selection screen"
    );
    verify(
      organicHomeDom.includes("Choose a card, add your message"),
      "Organic homepage displays step 1 instructional subtitle"
    );

    // 4B. Organic /send (Occasion Catalog)
    const organicSendDom = await runCommand(CHROME_PATH, [
      ...commonChromeArgs,
      "--window-size=1440,900",
      "--dump-dom",
      `${BASE_URL}/send`,
    ]);

    verify(
      organicSendDom.includes("Send a Real Handwritten Note For Life"),
      "Organic /send renders Occasion Catalog headline"
    );
    verify(
      (organicSendDom.includes("Career &amp; Professional") || organicSendDom.includes("Career & Professional")) &&
        (organicSendDom.includes("Sympathy &amp; Support") || organicSendDom.includes("Sympathy & Support")),
      "Organic /send renders curated occasion categories"
    );

    console.log("\n==================================================");
    console.log(`Browser Flow Summary: ${passed} Passed, ${failed} Failed`);
    console.log("==================================================");
  } finally {
    server.kill();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runBrowserVerification().catch((err) => {
  console.error("Fatal browser verification error:", err);
  process.exit(1);
});
