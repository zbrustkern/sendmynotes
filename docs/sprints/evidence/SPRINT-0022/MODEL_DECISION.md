# Image model selection — October 30, 2026

The founder asked us to check current model updates before deploying. We inspected the staging API model catalog and Google's current [image model guide](https://ai.google.dev/gemini-api/docs/image-generation). Stable `gemini-nano-banana-2.1` is the recommended new-project workhorse; stable `gemini-3-pro-image` is the premium precision/complex-task option. Both are available to the staging key.

We ran exactly one reference-image request per model with the same entirely synthetic cottage image and illustration brief. Both returned a 1792×2400 image in about 20 seconds. Both preserved the cottage, roof, two windows and garden, left quiet upper space, and added no visible stray lettering or mockup. Request/output metadata and images are in `checks/model-comparison/`.

**Staging default: `gemini-nano-banana-2.1`, at 2K.** In this sample, its softer gouache and richer garden details better fit the approved warm personal-card direction. Pro followed the source geometry more literally and produced a heavier paint texture. This is a qualitative choice from one paired fixture, not a benchmark or proof that one model is universally best. Keep `UPLOAD_IMAGE_MODEL` configurable so we can evaluate more personal-card fixtures and switch deliberately. No automatic downgrade/fallback on failures.

Exact cover words remain deterministic vector glyphs flattened into the accepted master, regardless of image model. Model-generated text is not relied on for spelling. These provider requests used synthetic imagery only. Private to an account means access-controlled in SendMyNotes; processing still sends the reference to the image provider. No unsupported provider retention/training guarantee is made.
