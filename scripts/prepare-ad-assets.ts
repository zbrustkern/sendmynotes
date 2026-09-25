import fs from "fs";
import path from "path";
import sharp from "sharp";

const OUTPUT_DIR = path.join(process.cwd(), "public", "ad-assets");

async function prepareAdAssets() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const robotArmSrc = "/Users/zeke/.gemini/antigravity/brain/c971d6c1-20fe-41d5-a8e5-601d322e6515/ad_craftsmanship_pen_action_1790367778506.jpg";
  const deliveryFlatlaySrc = "/Users/zeke/.gemini/antigravity/brain/c971d6c1-20fe-41d5-a8e5-601d322e6515/ad_delivery_flatlay_landscape_1790367808108.jpg";
  const executiveSrc = "/Users/zeke/.gemini/antigravity/brain/c971d6c1-20fe-41d5-a8e5-601d322e6515/ad_executive_thankyou_square_1790367840697.jpg";

  // 1. Google Landscape (1.91:1 = 1200 x 628)
  await sharp(deliveryFlatlaySrc)
    .resize(1200, 628, { fit: "cover", position: "center" })
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(path.join(OUTPUT_DIR, "google-ads-landscape-delivery-1200x628.jpg"));
  console.log("✓ Generated google-ads-landscape-delivery-1200x628.jpg");

  // 2. Google Square (1:1 = 1200 x 1200) - Robotic Pen
  await sharp(robotArmSrc)
    .resize(1200, 1200, { fit: "cover", position: "center" })
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(path.join(OUTPUT_DIR, "google-ads-square-robotic-craft-1200x1200.jpg"));
  console.log("✓ Generated google-ads-square-robotic-craft-1200x1200.jpg");

  // 3. Google Square (1:1 = 1200 x 1200) - Executive Thank-You
  await sharp(executiveSrc)
    .resize(1200, 1200, { fit: "cover", position: "center" })
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(path.join(OUTPUT_DIR, "google-ads-square-executive-1200x1200.jpg"));
  console.log("✓ Generated google-ads-square-executive-1200x1200.jpg");

  // 4. Google Portrait (4:5 = 960 x 1200) - Robotic Pen Close-up
  await sharp(robotArmSrc)
    .resize(960, 1200, { fit: "cover", position: "center" })
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(path.join(OUTPUT_DIR, "google-ads-portrait-robotic-craft-960x1200.jpg"));
  console.log("✓ Generated google-ads-portrait-robotic-craft-960x1200.jpg");

  console.log("All Google Ads creative assets generated successfully!");
}

prepareAdAssets().catch((err) => {
  console.error("Error preparing ad assets:", err);
  process.exit(1);
});
