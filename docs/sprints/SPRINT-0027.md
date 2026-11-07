# SPRINT-0027 — Holiday catalog expansion and Halloween seasonal retirement

Status: active · November 6, 2026 · Local Implementation & Automated Verification Complete  
Governing Documents: [Canonical Project Brief](../CANONICAL_PROJECT_BRIEF.md) · [Canonical Product Specifications](../CANONICAL_PRODUCT_SPECS.md) · [Holiday Proposal](../proposals/2026-11-06-holiday-cards/DESIGN_SPEC.md)

---

## Pyramid Index

- **L0:** Gracefully retire off-season Halloween merchandising and expand the active Christmas & Holidays catalog from 1 to 7 curated cards across staging and production without breaking historical drafts or orders.
- **L1:** Adopt Approach A (graceful seasonal gating); lead with "Christmas & Holidays" in storefront occasion filters; add 6 high-res A2 portrait assets (including 2 explicitly Christmas designs); maintain Handwrytten dimension-4 parity and zero-conversion baseline integrity.
- **L2:** Repository baseline; Detailed catalog & UI modifications; Stage-by-stage implementation plan; Testing & verification gates; Staging deployment & smoke tests; Production release & rollback runbook; Definition of Done.

---

## 1. Context and Strategic Objective

With Halloween concluded on October 31, 2026, the retail and personal sending season for winter holidays has officially commenced. Personal senders sending thoughtful gestures to family and friends require timely, beautiful stationery options without the friction of custom AI image generation.

### Commercial Baseline & Truth in Measurement
The founder's observation that pre-designed cards represent a major share of customer momentum reflects a strong product hypothesis: personal senders value speed, aesthetic certainty, and curated warmth over prompt engineering. Canonically, verified independent customer conversions remain at **zero** (the single recorded paid order on October 11, 2026 was the founder's test). This sprint expands pre-designed merchandising to maximize holiday conversion potential while maintaining strict measurement discipline.

---

## 2. Invariants and Boundaries

1. **Approach A (Graceful Seasonal Gating):**
   - Retain `"Halloween"` in `OCCASIONS` and `preset-halloween-harvest` in `CARD_PRESETS` (`lib/card-presets.ts`) so existing order records, drafts, and historical queries do not deserialize with missing schema values.
   - Remove `"Halloween"` from `PERSONAL_OCCASIONS` in `components/flow/EntryCardStep.tsx`.
   - Filter `preset-halloween-harvest` out of the active customer view (`seasonalActive = CARD_PRESETS.filter(p => p.occasion !== "Easter & Spring" && p.occasion !== "Halloween")`).
2. **Promote Christmas & Holidays:**
   - Reorder `PERSONAL_OCCASIONS` so `"Christmas & Holidays"` appears directly after `"All"`.
   - When `"All"` is selected, timely holiday cards appear at the top of the card picker grid.
3. **The 7-Card Holiday Roster:**
   - 2 Explicitly Christmas cards: **The Heirloom Tree** (`preset-holiday-tree`) and **The Holiday Nutcracker** (`preset-holiday-nutcracker`).
   - 4 Seasonal Winter/Holiday cards: **Warm Hearth & Cedar** (`preset-holiday-hearth`), **Winter Cardinals** (`preset-holiday-cardinals`), **Gilded Juniper Wreath** (`preset-holiday-wreath`), and **Snowy Cottage at Twilight** (`preset-holiday-cottage`).
   - 1 Existing Baseline: **Vintage Evergreen** (`preset-holiday-evergreen`).
4. **Physical & Fulfillment Parity:**
   - Maintain Handwrytten A2 Folded Portrait format (`dimension_id: 4`, 4.25 × 5.5 in, front ratio **17:22**, 1275 × 1650 px at 300 DPI).
   - Maintain customer flat rate: **$9.00 USD** (`CARD_FLAT_RATE_CENTS = 900`), First-Class mailing included.
   - Note limit boundaries: 420-character warning boundary, 450-character hard limit.
   - **Safety Boundary:** Never run live fulfillment scripts during testing or deployment audits; do not generate billable orders or physical mail.

---

## 3. Detailed Work Breakdown

### Step 1: Asset Placement & Optimization
- High-resolution assets formatted with MozJPEG at 300 DPI (1275 × 1650 px) are distributed to `public/presets/`:
  - `public/presets/holiday-tree.jpg` (~467 KB)
  - `public/presets/holiday-nutcracker.jpg` (~464 KB)
  - `public/presets/holiday-hearth.jpg` (~475 KB)
  - `public/presets/holiday-cardinals.jpg` (~421 KB)
  - `public/presets/holiday-wreath.jpg` (~284 KB)
  - `public/presets/holiday-cottage.jpg` (~549 KB)
  - `public/presets/holiday-evergreen.jpg` (existing baseline preserved)
  - `public/presets/halloween-harvest.jpg` (existing asset preserved for backward compatibility)

### Step 2: Catalog & Message Bank Updates (`lib/card-presets.ts`)
- Add the 6 new `CardPreset` definitions to `CARD_PRESETS`.
- Expand `OCCASION_MESSAGE_BANK["Christmas & Holidays"]` with tailored tone inspirations (Warm/Heartfelt, Togetherness, Playful/Humorous, Literary/Poetic, Brief).

### Step 3: Storefront Entry Flow Updates (`components/flow/EntryCardStep.tsx`)
- Update `PERSONAL_OCCASIONS` array:
  ```typescript
  export const PERSONAL_OCCASIONS = [
    "All",
    "Christmas & Holidays",
    "Birthday",
    "Thank You",
    "Thinking of You",
    "Congratulations",
    "Anniversary",
    "Just Because",
    "Sympathy & Support",
    "Love & Romance",
  ] as const;
  ```
- Update `filteredPresets` filter logic (Balanced Merchandising):
  ```typescript
  const filteredPresets = useMemo(() => {
    const seasonalActive = CARD_PRESETS.filter(
      (p) => p.occasion !== "Easter & Spring" && p.occasion !== "Halloween"
    );
    if (activeOccasion === "All") {
      // Feature two timely holiday cards up top to signal the season without drowning out core everyday occasions
      const holidayCards = seasonalActive.filter(
        (p) => p.occasion === "Christmas & Holidays"
      );
      const coreOccasions = seasonalActive.filter(
        (p) => p.occasion !== "Christmas & Holidays"
      );

      const featuredHoliday = holidayCards.slice(0, 2);
      const remainingHoliday = holidayCards.slice(2);

      // 2 holiday cards up top -> core everyday occasions -> remaining holiday cards
      return [...featuredHoliday, ...coreOccasions, ...remainingHoliday];
    }
    return seasonalActive.filter((p) => p.occasion === activeOccasion);
  }, [activeOccasion]);
  ```
      const timely = seasonalActive.filter(
        (p) => p.occasion === "Christmas & Holidays"
      );
      const evergreen = seasonalActive.filter(
        (p) => p.occasion !== "Christmas & Holidays"
      );
      return [...timely, ...evergreen];
    }
    return seasonalActive.filter((p) => p.occasion === activeOccasion);
  }, [activeOccasion]);
  ```

### Step 4: Automated Verification & Test Suite Execution
- Run `npm run test:target` to verify all 11 occasions in `OCCASIONS` find a preset, all images exist on disk, handwriting styles match, character limits hold, and intent detection functions.
- Run `npm run test:intent` to verify holiday post-purchase recommendations continue to suggest early holiday reminders.
- Run `npm run build` (`next build`) to ensure type safety, zero compile errors, and optimal static asset packaging.

---

## 4. Staging Deployment Plan

1. **Branch & Staging Commit:**
   - Commit changes to branch `sprint-0027-holiday-catalog` or directly on `staging`.
   - Commit message: `feat(catalog): expand holiday collection to 7 cards and retire halloween merchandising (SPRINT-0027)`.
2. **Deploy to Staging Environment:**
   - Trigger build/deploy on staging URL.
3. **Staging Smoke Checklist:**
   - [ ] Storefront Occasion Bar: Verify "Christmas & Holidays" is the first category pill after "All". Verify "Halloween" is absent.
   - [ ] Default Catalog View ("All"): Verify the top row showcases the holiday cards, starting with The Heirloom Tree and The Holiday Nutcracker.
   - [ ] Category View ("Christmas & Holidays"): Verify exactly 7 cards appear in the grid.
   - [ ] Image Loading: Verify all 7 card covers render crisply without letterboxing or visual distortion.
   - [ ] Card Selection & Draft State: Click "The Heirloom Tree"; verify preview updates, default note populates correctly, and advancing to the Note step preserves the card front.
   - [ ] Mobile Viewport (390px): Verify horizontal pill scrolling and responsive card grid.
   - [ ] Backward Compatibility: Verify navigating to a draft URL previously referencing `preset-halloween-harvest` does not crash or throw unhandled exceptions.

---

## 5. Production Rollout Plan

1. **Pre-Rollout Gate:**
   - Founder review of Staging smoke checklist and visual sign-off.
2. **Merge & Production Deployment:**
   - Fast-forward or merge `staging` to `main`.
   - Trigger production deployment.
3. **Production Verification (Read-Only Smoke Test):**
   - Verify `https://sendmynotes.com` loads the refreshed occasion pills.
   - Verify all 7 holiday preset image URLs return HTTP 200 with appropriate Cache-Control headers.
   - Verify no console errors on entry flow.
   - **Strict Guardrail:** Do not submit test orders on production Handwrytten fulfillment.
4. **Rollback Strategy:**
   - If unexpected UI anomalies or image delivery issues occur, execute `git revert HEAD` and redeploy. Because Approach A preserves the database schema and legacy asset files, rolling back the UI code involves zero data migration risk.

---

## 6. Definition of Done

- [ ] All 6 new holiday card front images reside in `public/presets/` with verified 1275 × 1650 px dimensions at 300 DPI.
- [ ] `lib/card-presets.ts` contains the 7 holiday presets and expanded message inspirations.
- [ ] `components/flow/EntryCardStep.tsx` reflects the updated occasion sequence and filters out Halloween.
- [ ] `npm run test:target` passes with 0 failures.
- [ ] Production build (`npm run build`) completes with zero errors.
- [ ] Staging deployment succeeds and passes smoke checklist.
- [ ] Founder approves production release.
- [ ] Production deployment verified live.
