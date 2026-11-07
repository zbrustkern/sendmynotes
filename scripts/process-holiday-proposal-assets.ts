import fs from "fs";
import path from "path";
import sharp from "sharp";

const TARGET_WIDTH = 1275;
const TARGET_HEIGHT = 1650; // Exact 17:22 ratio at 300 DPI (4.25 x 5.5 inches)

const ALL_NEW_ASSETS = [
  {
    src: "/Users/zeke/.gemini/antigravity/brain/36d39a68-483d-4ec7-b35f-8fe3766b65df/christmas_tree_card_1794014726538.jpg",
    dest: "holiday-tree.jpg",
    title: "The Heirloom Tree (Full Bleed · Explicitly Christmas)",
  },
  {
    src: "/Users/zeke/.gemini/antigravity/brain/36d39a68-483d-4ec7-b35f-8fe3766b65df/classic_christmas_nutcracker_card_1794013396505.jpg",
    dest: "holiday-nutcracker.jpg",
    title: "The Holiday Nutcracker (Founder Approved · Explicitly Christmas)",
  },
  {
    src: "/Users/zeke/.gemini/antigravity/brain/36d39a68-483d-4ec7-b35f-8fe3766b65df/warm_hearth_cedar_holiday_card_1794014739648.jpg",
    dest: "holiday-hearth.jpg",
    title: "Warm Hearth & Cedar (Full Bleed)",
  },
  {
    src: "/Users/zeke/.gemini/antigravity/brain/36d39a68-483d-4ec7-b35f-8fe3766b65df/winter_cardinals_holiday_card_front_1794014768098.jpg",
    dest: "holiday-cardinals.jpg",
    title: "Winter Cardinals (Full Bleed)",
  },
  {
    src: "/Users/zeke/.gemini/antigravity/brain/36d39a68-483d-4ec7-b35f-8fe3766b65df/sendmynotes_holiday_wreath_card_printready_1794012496947.jpg",
    dest: "holiday-wreath.jpg",
    title: "Gilded Juniper Wreath (Botanical)",
  },
  {
    src: "/Users/zeke/.gemini/antigravity/brain/36d39a68-483d-4ec7-b35f-8fe3766b65df/snowy_cottage_twilight_artwork_1794014795080.jpg",
    dest: "holiday-cottage.jpg",
    title: "Snowy Cottage at Twilight (Full Bleed)",
  },
];

async function main() {
  const proposalDir = path.join(process.cwd(), "docs/proposals/2026-11-06-holiday-cards/assets");
  const publicPresetsDir = path.join(process.cwd(), "public/presets");
  const brainDir = "/Users/zeke/.gemini/antigravity/brain/36d39a68-483d-4ec7-b35f-8fe3766b65df";

  for (const asset of ALL_NEW_ASSETS) {
    if (!fs.existsSync(asset.src)) {
      console.error(`Missing source: ${asset.src}`);
      continue;
    }

    const targets = [
      path.join(proposalDir, asset.dest),
      path.join(publicPresetsDir, asset.dest),
      path.join(brainDir, asset.dest),
    ];

    console.log(`Processing ${asset.title} -> ${asset.dest}...`);

    for (const outPath of targets) {
      await sharp(asset.src)
        .resize(TARGET_WIDTH, TARGET_HEIGHT, {
          fit: "cover",
          position: "center",
        })
        .jpeg({ quality: 90, mozjpeg: true })
        .toFile(outPath);
    }

    console.log(`✓ Processed and distributed ${asset.dest}`);
  }

  console.log("All holiday assets successfully formatted and saved!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
