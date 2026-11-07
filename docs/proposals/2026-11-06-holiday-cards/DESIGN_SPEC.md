# Seasonal Catalog Transition: Holiday Presets & Halloween Retirement

**Date:** November 6, 2026  
**Status:** Design Proposal & Asset Review  
**Governing Documents:** [Canonical Project Brief](../../CANONICAL_PROJECT_BRIEF.md) · [Canonical Product Specifications](../../CANONICAL_PRODUCT_SPECS.md)

---

## 1. Executive Summary & Recommendation

With Halloween 2026 concluded and the holiday mailing season underway, SendMyNotes should retire off-season autumn harvest merchandising and expand its pre-designed holiday card offerings.

### Commercial Baseline Note
The founder's observation that pre-designed cards represent the majority of user momentum aligns with the core product mission: personal senders want a thoughtful gesture made seamless without the friction of prompt engineering or custom AI art generation. Canonically, verified independent customer conversions remain at **zero** (the sole recorded paid order on October 11, 2026 was the founder's test). Pre-designed card popularity is an intuitive product hypothesis and strategic priority, not an audited conversion metric.

### Proposed Changes
1. **Retire Halloween Merchandising:** Remove `Autumn Harvest Glow` (`preset-halloween-harvest`) from the active storefront occasion filter and customer card picker.
2. **Elevate Holiday Placement:** Place **Christmas & Holidays** immediately after "All" in the occasion filter bar (`EntryCardStep.tsx`) to meet November personal holiday senders directly.
3. **Expand from 1 to 7 Holiday Cards:** Expand beyond the single baseline (`Vintage Evergreen`) by adding 6 high-quality curated options representing diverse personal gifting tastes:
   - **The Heirloom Tree** *(Explicitly Christmas)*: Nostalgic decorated balsam fir with glowing amber lights, vintage glass ornaments, red bows, and wrapped gifts.
   - **The Holiday Nutcracker** *(Explicitly Christmas)*: Traditional wooden nutcracker soldier in scarlet and gold uniform framed by evergreen pine, holly leaves, red berries, and pinecones.
   - **Warm Hearth & Cedar:** Fireside nostalgia, family warmth, glowing candles, cedar garland.
   - **Winter Cardinals:** Beloved wildlife motif, male/female cardinals in snow-dusted pine with holly berries.
   - **Gilded Juniper Wreath:** Elegant, non-denominational botanical wreath with velvet bow (Christmas, Solstice, New Year).
   - **Snowy Cottage at Twilight:** Storybook winter dusk watercolor with glowing amber windows and chimney smoke.

**Review Artifacts:**
- **Interactive Mockup:** [`assets/holiday-cards-preview.html`](assets/holiday-cards-preview.html)
- **High-Resolution Artwork Assets:**
  - `assets/holiday-tree.jpg` (The Heirloom Tree · Explicitly Christmas)
  - `assets/holiday-nutcracker.jpg` (The Holiday Nutcracker · Explicitly Christmas)
  - `assets/holiday-hearth.jpg` (Warm Hearth & Cedar)
  - `assets/holiday-cardinals.jpg` (Winter Cardinals)
  - `assets/holiday-wreath.jpg` (Gilded Juniper Wreath)
  - `assets/holiday-cottage.jpg` (Snowy Cottage at Twilight)
  - `assets/holiday-evergreen.jpg` (Vintage Evergreen Baseline)
  - `assets/halloween-harvest.jpg` (Autumn Harvest Glow to Retire)

---

## 2. The 2026 Holiday Collection

All assets have been generated, curated, and formatted to the canonical Handwrytten A2 Folded Portrait specification (`dimension_id: 4`, 4.25 × 5.5 inches, front aspect ratio **17:22**, 1275 × 1650 px at 300 DPI).

| Preset ID | Title | Style & Motif | Target Sentiment | Default Handwritten Note (Casual David) |
| :--- | :--- | :--- | :--- | :--- |
| `preset-holiday-tree` *(New · Explicitly Christmas)* | **The Heirloom Tree** | Nostalgic watercolor; trimmed balsam fir, glowing fairy lights, vintage ornaments, wrapped gifts | Family holiday tradition, Christmas magic | *"Merry Christmas! Wishing you and your loved ones a season filled with warmth, wonder, and beautiful memories gathered around the tree. Warmest love from our home to yours!"* |
| `preset-holiday-nutcracker` *(New · Explicitly Christmas)* | **The Holiday Nutcracker** | Storybook gouache; wooden nutcracker in scarlet and gold, evergreen wreath, holly berries | Classic festive tradition, storytelling, joyful cheer | *"Wishing you a classic, magical Christmas filled with beloved traditions, cozy evenings, and lots of joy! Thinking of you with warmth this holiday season."* |
| `preset-holiday-evergreen` *(Baseline)* | **Vintage Evergreen** | Botanical gouache; pine bough, pinecones, red berries | Timeless, traditional botanical | *"Warmest holiday wishes! May your home be blessed with peace, laughter, and cozy moments this season. Here is to a healthy, joyous new year ahead!"* |
| `preset-holiday-hearth` *(New)* | **Warm Hearth & Cedar** | Warm fireside watercolor; stone mantel, orange slices, candles | Family warmth, gratitude, togetherness | *"Merry Christmas! May your home be blessed with the warm glow of good company, sweet memories, and peaceful moments this holiday season. Warmest wishes to you and yours!"* |
| `preset-holiday-cardinals` *(New)* | **Winter Cardinals** | Botanical watercolor; cardinal pair on snow-dusted pine | Loving connection, natural beauty, comfort | *"Sending you loving holiday wishes across the miles! So thankful for your friendship and thinking of you with fond memories as we welcome the season."* |
| `preset-holiday-wreath` *(New)* | **Gilded Juniper Wreath** | Refined circular wreath; spruce, juniper, gold bay laurel, velvet bow | Elegant, versatile (Christmas, Solstice, New Year) | *"Warmest holiday wishes and blessings for a joyful, healthy, and prosperous New Year! Thinking of you with gratitude and affection."* |
| `preset-holiday-cottage` *(New)* | **Snowy Cottage at Twilight** | Storybook winter landscape; snowdrifts, amber window glow, starlight | Peaceful quiet, comfort, nostalgic wonder | *"Wishing you peaceful, cozy winter nights wrapped up in warmth and surrounded by the people you love most. Have a wonderful Christmas!"* |

---

## 3. Halloween Retirement Strategy

### Current Halloween Touchpoints
In the current repository:
1. `lib/card-presets.ts`:
   - `OCCASIONS` array includes `"Halloween"`.
   - `OCCASION_MESSAGE_BANK` contains 2 Halloween messages.
   - `CARD_PRESETS` contains `preset-halloween-harvest`.
2. `components/flow/EntryCardStep.tsx`:
   - `PERSONAL_OCCASIONS` includes `"Halloween"`.
   - `filteredPresets` prioritizes Halloween along with Christmas.
3. `components/CoverStep.tsx` & `components/v3/CustomAiCommissionDrawer.tsx`:
   - Contain sample prompts for Halloween.
4. `tests/target-experience.test.ts`:
   - Asserts `OCCASIONS.length === 11` and expects `Halloween` in `CARD_PRESETS`.

### Migration Options

#### Approach A: Graceful Seasonal Gating (Recommended)
Follow the established pattern already used for `Easter & Spring`:
- Keep `Halloween` and `preset-halloween-harvest` in `lib/card-presets.ts` so historical order records, saved drafts, and tests remain 100% valid.
- Remove `"Halloween"` from `PERSONAL_OCCASIONS` in `components/flow/EntryCardStep.tsx`.
- In `filteredPresets`, gate off `preset-halloween-harvest` alongside `Easter & Spring` (`p.occasion !== "Halloween" && p.occasion !== "Easter & Spring"`).
- **Pros:** Zero risk of schema or draft deserialization crashes; existing tests pass without modification; storefront is immediately refreshed.

#### Approach B: Full Schema Deprecation
- Remove `"Halloween"` from `OCCASIONS` in `lib/card-presets.ts`, delete `preset-halloween-harvest`, and update `tests/target-experience.test.ts` to expect 10 occasions (or replace with New Year).
- **Pros:** Completely cleans legacy code.
- **Cons:** Any in-flight draft referencing `preset-halloween-harvest` or `Halloween` could fail validation.

**Recommendation:** Proceed with **Approach A** for immediate storefront deployment, with Approach B reserved for a major schema cleanup sprint.

---

## 4. UI/UX Placement & Occasion Sorting

In `components/flow/EntryCardStep.tsx`:

### Current Order:
`["All", "Halloween", "Christmas & Holidays", "Birthday", "Thank You", "Thinking of You", ...]`

### Proposed Order:
`["All", "Christmas & Holidays", "Birthday", "Thank You", "Thinking of You", "Congratulations", "Anniversary", "Just Because", "Sympathy & Support", "Love & Romance"]`

### Grid Display Behavior (Balanced Merchandising):
- **When "All" is active:** Rather than dumping all 7 holiday cards at once and drowning out core sending occasions, exactly **2 featured holiday heroes** appear up top (**The Heirloom Tree** and **The Holiday Nutcracker**), followed immediately by core everyday categories (**Thinking of You**, **Thank You**, **Birthday**, **Congratulations**, **Sympathy**, etc.), with the remaining holiday designs completing the catalog. Personal senders immediately see that holiday cards are available without losing visibility into everyday gestures.
- **When "Christmas & Holidays" is selected:** All 7 holiday cards are presented in a dedicated, comprehensive collection.

---

## 5. Message Bank & Tone Options

To support the expanded card set, the holiday message bank in `lib/card-presets.ts` is expanded to include specific inspirations for each mood:

```typescript
"Christmas & Holidays": [
  {
    tone: "warm",
    tag: "Heartfelt",
    handwritten: "Warmest holiday wishes! May your home be blessed with peace, laughter, and cozy moments this season. Here is to a healthy, joyous new year ahead!",
  },
  {
    tone: "warm",
    tag: "Togetherness",
    handwritten: "Merry Christmas! May your home be blessed with the warm glow of good company, sweet memories, and peaceful moments this holiday season. Warmest wishes to you and yours!",
  },
  {
    tone: "funny",
    tag: "Playful",
    handwritten: "Merry Christmas! May your cookies be sweet, your eggnog be strong, and your holiday shopping be entirely finished. Warmest festive wishes!",
  },
  {
    tone: "poetic",
    tag: "Literary",
    handwritten: "In the quiet chill of winter, may your hearth be warm and your heart full of contentment. Wishing you the sacred blessings and wonder of the season.",
  },
  {
    tone: "short",
    tag: "Brief",
    handwritten: "Wishing you a bright and joyful holiday season and a wonderful New Year! Sending big hugs across the miles.",
  },
]
```

---

## 6. Manufacturing & Supplier Parity Checklist

| Verification Item | Specification | Status |
| :--- | :--- | :--- |
| **Card Format** | A2 Folded Portrait (`dimension_id: 4`) | Verified (`GET /v2/design/dimensions`) |
| **Dimensions** | 4.25 × 5.5 inches folded (8.5 × 5.5 inches open) | Verified |
| **Front Aspect Ratio** | 17:22 (approx. 0.7727) | Verified; assets generated at 1275 × 1650 px |
| **Interior Writing** | Real pen and ink (Casual David, Executive Adam, Charming Chase, Carefree Kate) | Verified mapped fonts |
| **Character Limits** | 420 chars (warning boundary), 450 chars (hard limit) | Verified; sample notes are 110–180 chars |
| **Postage & Mailing** | USPS First-Class postage included; Phoenix, AZ postmark | Verified supplier setup |
| **Customer Price** | $9.00 USD flat (including tax and First-Class mailing) | Configured `CARD_FLAT_RATE_CENTS = 900` |
| **Fulfillment Timing** | 1–2 business days prep + 2–7 business days transit | Estimated domestic window |

---

## 7. Implementation Plan

Upon founder approval:
1. **Asset Deployment:** Copy `holiday-hearth.jpg`, `holiday-cardinals.jpg`, `holiday-wreath.jpg`, and `holiday-cottage.jpg` into `public/presets/`.
2. **Code Update (`lib/card-presets.ts`):** Insert the 4 new `CardPreset` objects and expanded holiday message bank.
3. **UI Update (`components/flow/EntryCardStep.tsx`):**
   - Update `PERSONAL_OCCASIONS` to remove `Halloween` and lead with `Christmas & Holidays`.
   - Update `filteredPresets` to gate off Halloween.
4. **Verification & Testing:**
   - Run `npm run test:target` to verify 100% test pass rate.
   - Run `npm test` across the test suite.
   - Verify visually on desktop and mobile viewports.
