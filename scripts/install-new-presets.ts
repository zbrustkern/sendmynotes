import fs from "fs";
import path from "path";
import sharp from "sharp";

const TARGET_WIDTH = 1250;
const TARGET_HEIGHT = 1750;

const NEW_PRESETS = [
  {
    src: "/Users/zeke/.gemini/antigravity/brain/3a0170ac-9538-470f-92d4-9b8121eafb4a/preset_sympathy_olive_1791039181882.jpg",
    dest: "sympathy-olive.jpg",
    label: "Sympathy & Support: Serene Olive Branch",
  },
  {
    src: "/Users/zeke/.gemini/antigravity/brain/3a0170ac-9538-470f-92d4-9b8121eafb4a/preset_justbecause_teacup_1791039194785.jpg",
    dest: "just-because-teacup.jpg",
    label: "Just Because: Cozy Chamomile Teacup",
  },
  {
    src: "/Users/zeke/.gemini/antigravity/brain/3a0170ac-9538-470f-92d4-9b8121eafb4a/preset_holiday_evergreen_1791039209480.jpg",
    dest: "holiday-evergreen.jpg",
    label: "Christmas & Holidays: Vintage Botanical Evergreen",
  },
  {
    src: "/Users/zeke/.gemini/antigravity/brain/3a0170ac-9538-470f-92d4-9b8121eafb4a/preset_easter_blossom_1791039225353.jpg",
    dest: "easter-blossom.jpg",
    label: "Easter & Spring: Delicate Spring Blossom Bough",
  },
  {
    src: "/Users/zeke/.gemini/antigravity/brain/3a0170ac-9538-470f-92d4-9b8121eafb4a/preset_halloween_harvest_1791039245656.jpg",
    dest: "halloween-harvest.jpg",
    label: "Halloween: Autumn Harvest & Lantern Glow",
  },
];

async function installNewPresets() {
  const destDir = path.join(process.cwd(), "public", "presets");
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  for (const preset of NEW_PRESETS) {
    if (!fs.existsSync(preset.src)) {
      throw new Error(`Source image not found: ${preset.src}`);
    }

    const outPath = path.join(destDir, preset.dest);
    console.log(`Processing ${preset.label} -> ${preset.dest}...`);

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

  console.log(`\n🎉 Successfully installed all ${NEW_PRESETS.length} new card presets into public/presets/!`);
}

installNewPresets().catch((err) => {
  console.error("Error installing new presets:", err);
  process.exit(1);
});
