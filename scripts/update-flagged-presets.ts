import fs from "fs";
import path from "path";
import sharp from "sharp";

const TARGET_WIDTH = 1250;
const TARGET_HEIGHT = 1750;

const REPLACEMENTS = [
  {
    name: "Birthday - Celebration Garland",
    src: "/Users/zeke/.gemini/antigravity/brain/26a83f2d-e5c6-4276-ad0d-6080d08bf227/preset_bday_garland_1791067993649.jpg",
    dest: "birthday-balloons.jpg",
  },
  {
    name: "Congratulations - Golden Cheers Coupes",
    src: "/Users/zeke/.gemini/antigravity/brain/26a83f2d-e5c6-4276-ad0d-6080d08bf227/preset_congrats_coupe_1791068023177.jpg",
    dest: "congrats-champagne.jpg",
  },
  {
    name: "Thinking of You - Quiet Morning Still Life",
    src: "/Users/zeke/.gemini/antigravity/brain/26a83f2d-e5c6-4276-ad0d-6080d08bf227/preset_thinking_morning_1791068038449.jpg",
    dest: "thinking-of-you-coffee.jpg",
  },
  {
    name: "Anniversary - Intertwined Botanical Wreath",
    src: "/Users/zeke/.gemini/antigravity/brain/26a83f2d-e5c6-4276-ad0d-6080d08bf227/preset_anniv_botanical_1791068051955.jpg",
    dest: "anniversary-monstera.jpg",
  },
];

async function main() {
  const destDir = path.join(process.cwd(), "public", "presets");
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  for (const item of REPLACEMENTS) {
    const outPath = path.join(destDir, item.dest);
    console.log(`Processing ${item.name} -> ${item.dest}...`);

    await sharp(item.src)
      .resize(TARGET_WIDTH, TARGET_HEIGHT, {
        fit: "cover",
        position: "center",
      })
      .jpeg({ quality: 90, mozjpeg: true })
      .toFile(outPath);

    const stats = fs.statSync(outPath);
    console.log(`✓ Saved ${item.dest} (${Math.round(stats.size / 1024)} KB, ${TARGET_WIDTH}x${TARGET_HEIGHT})`);
  }

  console.log("All flagged presets successfully replaced!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
