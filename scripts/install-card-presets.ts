import fs from "fs";
import path from "path";
import sharp from "sharp";

const TARGET_WIDTH = 1250;
const TARGET_HEIGHT = 1750;

const PRESETS = [
  {
    src: "/Users/zeke/.gemini/antigravity/brain/c971d6c1-20fe-41d5-a8e5-601d322e6515/preset_bday_balloons_1790367385648.jpg",
    dest: "birthday-balloons.jpg",
  },
  {
    src: "/Users/zeke/.gemini/antigravity/brain/c971d6c1-20fe-41d5-a8e5-601d322e6515/preset_thankyou_wildflowers_1790367398358.jpg",
    dest: "thank-you-botanical.jpg",
  },
  {
    src: "/Users/zeke/.gemini/antigravity/brain/c971d6c1-20fe-41d5-a8e5-601d322e6515/preset_thinking_coffee_1790367410615.jpg",
    dest: "thinking-of-you-coffee.jpg",
  },
  {
    src: "/Users/zeke/.gemini/antigravity/brain/c971d6c1-20fe-41d5-a8e5-601d322e6515/preset_congrats_champagne_1790367424366.jpg",
    dest: "congrats-champagne.jpg",
  },
  {
    src: "/Users/zeke/.gemini/antigravity/brain/c971d6c1-20fe-41d5-a8e5-601d322e6515/preset_anniv_botanicals_1790367443469.jpg",
    dest: "anniversary-monstera.jpg",
  },
  {
    src: "/Users/zeke/.gemini/antigravity/brain/c971d6c1-20fe-41d5-a8e5-601d322e6515/preset_love_roses_1790367459663.jpg",
    dest: "love-roses.jpg",
  },
  {
    src: "/Users/zeke/.gemini/antigravity/brain/3a0170ac-9538-470f-92d4-9b8121eafb4a/preset_sympathy_olive_1791039181882.jpg",
    dest: "sympathy-olive.jpg",
  },
  {
    src: "/Users/zeke/.gemini/antigravity/brain/3a0170ac-9538-470f-92d4-9b8121eafb4a/preset_justbecause_teacup_1791039194785.jpg",
    dest: "just-because-teacup.jpg",
  },
  {
    src: "/Users/zeke/.gemini/antigravity/brain/3a0170ac-9538-470f-92d4-9b8121eafb4a/preset_holiday_evergreen_1791039209480.jpg",
    dest: "holiday-evergreen.jpg",
  },
  {
    src: "/Users/zeke/.gemini/antigravity/brain/3a0170ac-9538-470f-92d4-9b8121eafb4a/preset_easter_blossom_1791039225353.jpg",
    dest: "easter-blossom.jpg",
  },
  {
    src: "/Users/zeke/.gemini/antigravity/brain/3a0170ac-9538-470f-92d4-9b8121eafb4a/preset_halloween_harvest_1791039245656.jpg",
    dest: "halloween-harvest.jpg",
  },
];

async function installPresets() {
  const destDir = path.join(process.cwd(), "public", "presets");
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const force = process.argv.includes("--force");
  let processedCount = 0;

  for (const preset of PRESETS) {
    const outPath = path.join(destDir, preset.dest);

    if (fs.existsSync(outPath) && !force) {
      console.log(`✓ Preserving installed preset: ${preset.dest}`);
      processedCount++;
      continue;
    }

    if (!fs.existsSync(preset.src)) {
      throw new Error(`Source image not found: ${preset.src}`);
    }

    console.log(`Processing ${preset.dest}...`);

    await sharp(preset.src)
      .resize(TARGET_WIDTH, TARGET_HEIGHT, {
        fit: "cover",
        position: "center",
      })
      .jpeg({ quality: 90, mozjpeg: true })
      .toFile(outPath);

    const stats = fs.statSync(outPath);
    console.log(`✓ Saved ${preset.dest} (${Math.round(stats.size / 1024)} KB, ${TARGET_WIDTH}x${TARGET_HEIGHT})`);
    processedCount++;
  }

  console.log(`All ${processedCount} card presets successfully verified / installed!`);
}

installPresets().catch((err) => {
  console.error("Error installing presets:", err);
  process.exit(1);
});
