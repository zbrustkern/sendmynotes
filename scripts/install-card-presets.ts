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
];

async function installPresets() {
  const destDir = path.join(process.cwd(), "public", "presets");
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  for (const preset of PRESETS) {
    if (!fs.existsSync(preset.src)) {
      throw new Error(`Source image not found: ${preset.src}`);
    }

    const outPath = path.join(destDir, preset.dest);
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
  }

  console.log("All 6 card presets successfully installed!");
}

installPresets().catch((err) => {
  console.error("Error installing presets:", err);
  process.exit(1);
});
