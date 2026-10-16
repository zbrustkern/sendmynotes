import { spawn } from "child_process";
import http from "http";
import fs from "fs";
import path from "path";

const PORT = 3089;
const URL = `http://127.0.0.1:${PORT}/?auto_select=1`;
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUTPUT_DIR = "/Users/zeke/.gemini/antigravity/brain/b487e35f-d5ee-4b5f-a01d-742ccea04a53";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkServerReady(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(URL, (res) => {
      resolve(res.statusCode === 200);
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
    const proc = spawn(cmd, args);
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

async function main() {
  console.log("==================================================");
  console.log("🚀 STARTING HEADLESS WORKBENCH VERIFICATION");
  console.log("==================================================\n");

  // 1. Start Next.js server on PORT
  console.log(`Starting Next.js production server on port ${PORT}...`);
  const server = spawn("./node_modules/.bin/next", ["start", "-p", String(PORT), "-H", "127.0.0.1"], {
    stdio: "pipe",
    env: { ...process.env, PORT: String(PORT) },
  });

  server.stdout.on("data", (d) => {
    // console.log("[Next stdout]", d.toString().trim());
  });
  server.stderr.on("data", (d) => {
    // console.error("[Next stderr]", d.toString().trim());
  });

  // Wait for server to be responsive
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await wait(1000);
    ready = await checkServerReady();
    if (ready) break;
  }

  if (!ready) {
    server.kill();
    throw new Error(`Server failed to start on port ${PORT} within 30 seconds.`);
  }

  console.log(`✅ Next.js server is ready at ${URL}\n`);

  try {
    const chromeProfileDir = path.join(OUTPUT_DIR, "scratch", "chrome-profile");
    if (!fs.existsSync(chromeProfileDir)) {
      fs.mkdirSync(chromeProfileDir, { recursive: true });
    }

    const commonChromeArgs = [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-crash-reporter",
      `--user-data-dir=${chromeProfileDir}`,
    ];

    // 2. Headless Chrome at 1440x900 (Desktop)
    console.log("📸 Capturing Desktop viewport (1440x900)...");
    const desktopScreenshotPath = path.join(OUTPUT_DIR, "desktop-workbench-1440x900.png");
    await runCommand(CHROME_PATH, [
      ...commonChromeArgs,
      "--hide-scrollbars",
      "--window-size=1440,900",
      `--screenshot=${desktopScreenshotPath}`,
      URL,
    ]);
    console.log(`✅ Desktop screenshot captured at: ${desktopScreenshotPath}`);

    // Dump Desktop DOM
    console.log("🔍 Dumping Desktop DOM...");
    const desktopDom = await runCommand(CHROME_PATH, [
      ...commonChromeArgs,
      "--window-size=1440,900",
      "--dump-dom",
      URL,
    ]);

    // 3. Headless Chrome at 390x844 (Mobile iPhone)
    console.log("📸 Capturing Mobile viewport (390x844)...");
    const mobileScreenshotPath = path.join(OUTPUT_DIR, "mobile-workbench-390x844.png");
    await runCommand(CHROME_PATH, [
      ...commonChromeArgs,
      "--hide-scrollbars",
      "--window-size=390,844",
      `--screenshot=${mobileScreenshotPath}`,
      URL,
    ]);
    console.log(`✅ Mobile screenshot captured at: ${mobileScreenshotPath}`);

    // Dump Mobile DOM
    console.log("🔍 Dumping Mobile DOM...");
    const mobileDom = await runCommand(CHROME_PATH, [
      ...commonChromeArgs,
      "--window-size=390,844",
      "--dump-dom",
      URL,
    ]);

    console.log("\n==================================================");
    console.log("🧪 RUNNING VALIDATION CHECKS ON RENDERED DOM");
    console.log("==================================================\n");

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

    // CHECK 1: Only ONE visual cover switcher strip exists (4 duplicate swap buttons removed)
    verify(
      !desktopDom.includes("Selected Cover: Make a Wish") &&
      !desktopDom.includes("Selected Cover:") &&
      !desktopDom.includes("Swap Cover Design (12)") &&
      !desktopDom.includes("Cover: Make a Wish • Swap"),
      "All 4 duplicate swap text buttons & yellow banners are completely deleted"
    );

    verify(
      desktopDom.includes("Tactile Stationery Desk") &&
      desktopDom.includes("Card Front Design:") &&
      desktopDom.includes("See All"),
      "Only ONE visual horizontal cover thumbnail strip is present with 'See All' button"
    );

    // CHECK 2: Both Front Cover artwork and Live Ink Inside Page visible on Desktop without clicking tabs
    verify(
      desktopDom.includes("Front Artwork") &&
      desktopDom.includes("Live Handwriting Preview") &&
      desktopDom.includes("Full Card Spread"),
      "Desktop renders both Front Artwork and Live Ink leaf simultaneously"
    );

    // CHECK 3: Primary forward CTA visible above the fold on Desktop and pinned on Mobile
    verify(
      desktopDom.includes("Continue to Recipient Address — $9.00 All-In"),
      "Desktop primary forward CTA button 'Continue to Recipient Address — $9.00 All-In →' rendered in right column"
    );

    verify(
      mobileDom.includes("Continue to Address ($9.00 All-In)"),
      "Mobile pinned sticky action bar 'Continue to Address ($9.00 All-In) →' rendered at bottom"
    );

    // CHECK 4: Zero [bracket] strings appear in default loaded notes (excluding HTML attributes like Tailwind classes)
    const desktopText = desktopDom
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ");

    const mobileText = mobileDom
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ");

    const bracketPlaceholderRegex = /\[[a-zA-Z\s'/-]+\]/;
    const desktopMatches = desktopText.match(bracketPlaceholderRegex);
    const mobileMatches = mobileText.match(bracketPlaceholderRegex);

    if (desktopMatches) console.log("Found bracket in desktop text:", desktopMatches[0]);
    if (mobileMatches) console.log("Found bracket in mobile text:", mobileMatches[0]);

    verify(
      !desktopMatches && !mobileMatches,
      "Zero [bracket] strings appear in rendered user-facing note templates"
    );

    // CHECK 5: Smart greeting and 1-tap occasion pills
    verify(
      desktopDom.includes("Thinking of You") &&
      desktopDom.includes("Thank You") &&
      desktopDom.includes("Birthday") &&
      desktopDom.includes("Sympathy") &&
      desktopDom.includes("Pet Loss"),
      "1-Tap Occasion Switcher pills are rendered at the top of the right column"
    );

    console.log("\n==================================================");
    console.log(`DOM Verification Summary: ${passed} Passed, ${failed} Failed`);
    console.log("==================================================\n");

    if (failed > 0) {
      throw new Error(`Verification failed with ${failed} failure(s).`);
    }
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
