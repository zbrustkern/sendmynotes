import fs from "fs";
import path from "path";
import sharp from "sharp";

async function generateBackplate() {
  const inputSvgPath = path.join(process.cwd(), "assets", "card-back.svg");
  const outputPngPath = path.join(process.cwd(), "public", "aster-blanche-backplate.png");

  if (!fs.existsSync(inputSvgPath)) {
    throw new Error(`SVG asset not found at ${inputSvgPath}`);
  }

  const svgBuffer = fs.readFileSync(inputSvgPath);

  // Exact Handwrytten A2 folded specifications (4.25" x 5.5" at 300 DPI = 1275 x 1650 px)
  const targetWidth = 1275;
  const targetHeight = 1650;

  console.log(`[Backplate] Rendering ${inputSvgPath} to ${targetWidth}x${targetHeight} PNG (300 DPI)...`);

  await sharp(svgBuffer, { density: 300 })
    .resize(targetWidth, targetHeight, {
      fit: "contain",
      background: "#FCFAF7",
    })
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(outputPngPath);

  console.log(`[Backplate] Generated high-res backplate: ${outputPngPath}`);
}

generateBackplate().catch((err) => {
  console.error("[Backplate] Error generating backplate:", err);
  process.exit(1);
});
