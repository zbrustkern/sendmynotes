import fs from "fs";
import path from "path";
import sharp from "sharp";

async function generateAllPreviewsAndIcons() {
  const bannerPath = path.join(process.cwd(), "assets", "og-banner-source.jpg");
  const iconPath = path.join(process.cwd(), "assets", "app-icon-source.jpg");

  const publicDir = path.join(process.cwd(), "public");
  const appDir = path.join(process.cwd(), "app");

  if (!fs.existsSync(bannerPath) || !fs.existsSync(iconPath)) {
    throw new Error("Source generated assets not found");
  }

  console.log("Generating 1200x630 OpenGraph and Twitter images...");

  // 1. OG Image (1200 x 630) with Value-Focused Typography Composite
  const width = 1200;
  const height = 630;

  const svgOverlay = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="panelGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#191716" stop-opacity="1" />
        <stop offset="46%" stop-color="#191716" stop-opacity="1" />
        <stop offset="54%" stop-color="#191716" stop-opacity="0" />
      </linearGradient>
    </defs>

    <!-- Dark charcoal backdrop over left side for crisp contrast -->
    <rect x="0" y="0" width="${width}" height="${height}" fill="url(#panelGrad)" />

    <!-- Brand Header -->
    <text x="75" y="110" font-family="Georgia, serif" font-size="28" font-weight="bold" fill="#FDFBF7" letter-spacing="1">sendmynotes<tspan fill="#D97706">.com</tspan></text>

    <!-- Value Prop Badge -->
    <g transform="translate(75, 140)">
      <rect width="210" height="26" rx="13" fill="#2E2822" stroke="#4A3F35" stroke-width="1"/>
      <text x="105" y="17" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="11" font-weight="700" fill="#F59E0B" text-anchor="middle" letter-spacing="1.5">REAL PEN ON PAPER</text>
    </g>

    <!-- Main Headline: The WHAT and WHY -->
    <text x="75" y="240" font-family="Georgia, 'Playfair Display', serif" font-size="52" font-weight="700" fill="#FFFFFF">
      <tspan x="75" dy="0">Real Handwritten</tspan>
      <tspan x="75" dy="62">Cards, Mailed</tspan>
      <tspan x="75" dy="62" fill="#F59E0B">For You.</tspan>
    </text>

    <!-- Subhead / Value Description -->
    <text x="75" y="445" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="19" fill="#D6D3D1">
      <tspan x="75" dy="0">Send a real handwritten card in minutes.</tspan>
      <tspan x="75" dy="28">No trip to the store. No hunting for stamps.</tspan>
    </text>

    <!-- Feature Tags -->
    <g transform="translate(75, 525)">
      <!-- Pill 1 -->
      <rect x="0" y="0" width="175" height="34" rx="17" fill="#292524" stroke="#44403C" stroke-width="1"/>
      <text x="87" y="22" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="13" font-weight="600" fill="#E7E5E4" text-anchor="middle">Real Pen &amp; Ink</text>

      <!-- Pill 2 -->
      <rect x="185" y="0" width="165" height="34" rx="17" fill="#292524" stroke="#44403C" stroke-width="1"/>
      <text x="267" y="22" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="13" font-weight="600" fill="#E7E5E4" text-anchor="middle">USPS First Class</text>

      <!-- Pill 3: Price -->
      <rect x="360" y="0" width="105" height="34" rx="17" fill="#D97706" />
      <text x="412" y="22" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="13" font-weight="700" fill="#FFFFFF" text-anchor="middle">$9.00 Flat</text>
    </g>
  </svg>
  `;

  const resizedBackground = await sharp(bannerPath)
    .resize(width, height, { fit: "cover", position: "right" })
    .toBuffer();

  const ogBuffer = await sharp(resizedBackground)
    .composite([
      {
        input: Buffer.from(svgOverlay),
        top: 0,
        left: 0,
      },
    ])
    .png({ quality: 95, compressionLevel: 8 })
    .toBuffer();

  const ogJpgBuffer = await sharp(resizedBackground)
    .composite([
      {
        input: Buffer.from(svgOverlay),
        top: 0,
        left: 0,
      },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();

  fs.writeFileSync(path.join(publicDir, "og-image.png"), ogBuffer);
  fs.writeFileSync(path.join(publicDir, "og-image.jpg"), ogJpgBuffer);
  fs.writeFileSync(path.join(appDir, "opengraph-image.png"), ogBuffer);
  fs.writeFileSync(path.join(appDir, "twitter-image.png"), ogBuffer);
  console.log("✅ Wrote og-image.png, og-image.jpg, app/opengraph-image.png, app/twitter-image.png");

  // 2. Apple Touch Icon (180 x 180)
  const appleTouchBuffer = await sharp(iconPath)
    .resize(180, 180, { fit: "cover" })
    .png({ quality: 95 })
    .toBuffer();

  fs.writeFileSync(path.join(publicDir, "apple-touch-icon.png"), appleTouchBuffer);
  fs.writeFileSync(path.join(publicDir, "apple-touch-icon-precomposed.png"), appleTouchBuffer);
  fs.writeFileSync(path.join(appDir, "apple-icon.png"), appleTouchBuffer);
  console.log("✅ Wrote apple-touch-icon.png, app/apple-icon.png");

  // 3. Icons: 192x192, 512x512, 32x32 favicon
  const icon192 = await sharp(iconPath)
    .resize(192, 192, { fit: "cover" })
    .png({ quality: 95 })
    .toBuffer();

  const icon512 = await sharp(iconPath)
    .resize(512, 512, { fit: "cover" })
    .png({ quality: 95 })
    .toBuffer();

  const favicon32 = await sharp(iconPath)
    .resize(32, 32, { fit: "cover" })
    .png({ quality: 95 })
    .toBuffer();

  fs.writeFileSync(path.join(publicDir, "icon-192.png"), icon192);
  fs.writeFileSync(path.join(publicDir, "icon-512.png"), icon512);
  fs.writeFileSync(path.join(appDir, "icon.png"), icon512);

  // Favicon
  fs.writeFileSync(path.join(publicDir, "favicon.ico"), favicon32);
  fs.writeFileSync(path.join(appDir, "favicon.ico"), favicon32);
  fs.writeFileSync(path.join(publicDir, "favicon-32x32.png"), favicon32);
  console.log("✅ Wrote icon-192.png, icon-512.png, favicon.ico, app/icon.png");

  // 4. Web Manifest
  const manifest = {
    name: "sendmynotes - Real Handwritten Cards, Mailed for You",
    short_name: "sendmynotes",
    description: "Custom 5x7 folded greeting cards written with real pen and ink. Mailed via USPS First Class.",
    start_url: "/",
    display: "standalone",
    background_color: "#FAF8F5",
    theme_color: "#FAF8F5",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };

  fs.writeFileSync(path.join(publicDir, "site.webmanifest"), JSON.stringify(manifest, null, 2));
  console.log("✅ Wrote site.webmanifest");
}

generateAllPreviewsAndIcons().catch((err) => {
  console.error("Error generating previews:", err);
  process.exit(1);
});
