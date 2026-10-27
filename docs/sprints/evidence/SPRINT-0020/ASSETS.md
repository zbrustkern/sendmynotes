# SPRINT-0020 asset provenance

Generated with the built-in `image_gen` tool (default generation mode), then resized and encoded with the repository's installed `sharp` package. The sanitized visual reference was `/Users/zeke/code/sendmynotes/docs/sprints/assets/SPRINT-0019/envelope-preview-concept.png` (1024 × 1536). No private original photo was accessed or copied. Prompts below are the final prompts used for the selected outputs.

## `public/images/envelope-preview/envelope-paper.webp`

- Generator output: `exec-e22054dc-642c-4582-b88a-2f46172c9ed2.png` from the current Codex generated-images store.
- Export: 1200 × 720 px, WebP, 16,884 bytes; opaque, 5:3 aspect ratio.
- Transformation: resize to 1200 × 720 and WebP encode at quality 82, effort 6. No compositing or visual drawing. The surface is flat and uninterrupted; it has no baked-in shadow, envelope edge, flap, or text.
- Full-resolution visual review: passed. Blank white paper with subtle restrained grain; no writing, personal data, marks, or surrounding scene.
- Final prompt:

> Use case: product-mockup
> Asset type: reusable blank envelope paper texture plate for a responsive address preview
> Primary request: photographic close, straight-on view of an uninterrupted blank white envelope front.
> Input images: Image 1: sanitized approved concept; match its restrained white paper grain and tone, ignore all writing and postage.
> Scene/backdrop: no scene or background; image itself is the flat paper surface.
> Subject: one clean white envelope front, no folds or flap, blank throughout.
> Style/medium: understated realistic product photography, natural but neutral.
> Composition/framing: exact 5:3 landscape rectangle, orthographic straight-on; front face reaches all four frame edges, crisp straight boundary.
> Lighting/mood: very soft diffuse daylight, neutral, no directional cast shadow.
> Color palette: white with delicate neutral variation.
> Materials/textures: barely visible fine paper tooth, smooth at ordinary viewing size; grain must be much subtler than visible woven fibers.
> Text (verbatim): none.
> Constraints: uniform uninterrupted front suitable for text overlay; omit shadow, shape, and backdrop since CSS supplies them.
> Avoid: envelope flap or seam, conspicuous fibers, woven/canvas texture, strong gradients, text, postage, logos, marks, perspective, embossing, watermark.

## `public/images/envelope-preview/postage-domestic.webp`

- Generator output: `exec-9e15d819-04f8-459a-813a-a9a2cdc3c5e7.png` from the current Codex generated-images store.
- Export: 300 × 375 px, WebP, 31,190 bytes; alpha preserved, portrait 4:5 ratio.
- Transformation: trim transparent margins, contain in a 300 × 375 transparent canvas, WebP encode at quality 84 / alpha quality 90, effort 6. No compositing or visual drawing.
- Full-resolution visual review: passed. Full postage illustration visible with transparent surroundings; no denomination, year, cancellation, barcode, wording, or personal details.
- Final prompt:

> Use case: product-mockup
> Asset type: separate illustrative postage image for a responsive envelope address preview
> Primary request: a small realistic unused US flag postage stamp, viewed straight-on.
> Scene/backdrop: isolated cutout on a genuinely transparent background.
> Subject: one small rectangular postage stamp with perforated paper edge and a tasteful American flag design.
> Style/medium: restrained realistic product photography matching a clean white envelope.
> Composition/framing: portrait stamp with slight natural paper thickness, front-facing, centered, full stamp visible, generous transparent padding, roughly 4:5 aspect ratio.
> Lighting/mood: soft neutral studio light, subtle edge detail.
> Color palette: muted red, white, and navy flag with warm off-white stamp border.
> Materials/textures: fine printed paper texture and perforated edges.
> Text (verbatim): none.
> Constraints: decorative illustrative asset only, transparent background, no denomination.
> Avoid: year, numbers, words, USPS, FOREVER, cancellation, postmark, barcode, watermark, shadow extending far beyond stamp, other objects.

Combined exported size: 48,074 bytes (below the 150 KB target). These are illustrative UI assets and do not establish supplier stock, exact envelope geometry, or a guaranteed postage design.
