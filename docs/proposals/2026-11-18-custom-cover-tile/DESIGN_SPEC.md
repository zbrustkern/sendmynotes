# A custom cover in the card picker

**Design proposal · November 18, 2026**

Give someone who is still browsing a second way to make a cover about the person receiving it. Show a finished watercolor of a sleeping orange cat. A small sparkle and the letters **AI** sit on the sage mat around the sample. The invitation reads **“Make a cover just for them.”** A sender can understand the offer even if the sparkle means nothing to them.

[Open the interactive mockup](mockup.html) · [Mobile grid](mobile-grid.png) · [Desktop grid](desktop-grid.png) · [Artwork drawer](mobile-drawer.png)

## Where it appears

Keep the “Create custom artwork” shortcut above the grid. Insert one invitation after the first five ready-made designs in the **filtered** list. The default grid opens with two holiday designs and three everyday covers before the invitation. At two columns, the invitation occupies the right side of row three. At four columns, it occupies the second spot in row two. Someone who knows exactly which ready-made card they want can still pick from a full first row on a normal-length list.

With one to five results, append the invitation after the final design. With zero, retain the existing empty-state recovery and use the top creation shortcut. When the picker is already showing the sender’s custom cover, including a restorable cover, use that existing tile. Also suppress the invitation while an uploaded or account-library cover is active. Showing a generic example next to someone’s own artwork would invite them to repeat a decision they have already made.

## What the sender sees

| Element | Treatment |
| --- | --- |
| Sample | One small, slightly tilted portrait print against a pale sage mat. The orange tabby and kitchen window are specific enough to suggest a real person’s idea. Use the same image throughout the example. |
| AI cue | Reuse the picker’s Lucide **Sparkles** glyph at 14 px with a 1.6 px stroke, followed by **AI** at 11 px. Deep sage ink on an opaque light mat keeps the small mark readable. Anchor it about 8 px from the top and right, with clear space between the mark and the tilted print at every width. |
| Headline | **Make a cover just for them** |
| Supporting line | **Start with a pet, place, or memory.** |
| Action | **Create my cover →** in the existing deep green. The whole tile is one button. |
| Drawer introduction | **Describe something they love. AI will turn your idea into cover art you can preview.** |
| Example idea | *“Her orange cat, asleep in the kitchen window.”* Keep it separate from the sender’s editable field so they can start with their own idea. |

Use the neighboring cards’ 17∶22 front frame and aligned caption area. The example, headline, and supporting line share that frame. The action sits in the caption area where a ready-made card has its title. Reserve the usual selected border and checkmark for a cover the sender actually accepts.

The AI cue belongs to the picker interface. Render it as a sibling of the sample image and use the clean image for artwork previews. This keeps printed art, saved images, and the inside note free of interface marks. Give the button an accessible name such as “Create my cover. Describe a pet, place, or memory to make artwork with AI.” Hide the decorative glyph from assistive technology.

## Tap, explore, return

1. Tapping the tile or the existing shortcut opens the same artwork drawer. On a fresh idea, initialize its occasion from the active filter. For **All**, use the builder’s usual occasion. Preserve the sender’s in-progress idea and their manually chosen occasion on reopen.
2. Leave the current card selection in place. Creating artwork requires a nonblank idea and an explicit press of **Create artwork**. Opening the drawer is reversible and makes zero generation requests.
3. Closing the drawer, including with Escape, restores focus to the originating control at the same scroll position and with the same filter. The sender can continue looking at the adjoining ready-made cards.
4. Show the generated art using the existing preview. **Use this cover and write my note** accepts it and advances directly to the note. On returning to covers, the sender sees their design in the existing custom-cover tile.
5. Retain the drawer’s existing error, retry, optional save, and ready-made fallback paths. Keep the typed idea available on a retry. A service error or a drawer dismissal must leave the sender able to choose a ready-made cover.

## Implementation handoff

- Render the invitation alongside the filtered presets in [EntryCardStep](../../../components/flow/EntryCardStep.tsx). Keep it separate from the preset data model so it cannot become a selected design, a preview of a purchasable cat card, or a checkout item.
- Pass the entry source (`top_shortcut` or `grid_tile`) and the active occasion through the shared open callback in the [builder](../../../app/preview/entry/client.tsx). Today the drawer gets the current card’s occasion, which can differ from the chip someone is browsing. Initialize the [artwork drawer](../../../components/v3/CustomAiCommissionDrawer.tsx) on a fresh open, with precedence for an in-progress draft.
- Keep the sample artwork local, reserve its dimensions, and lazy-load it below the first row. Attach the badge only to the invitation component. The [clean sample asset](cat-at-the-window.webp) is original concept art made for this proposal. The prototype uses this prepared result to demonstrate the interaction.
- Ship behind a picker-level experiment assignment. Keep the same drawer copy and behavior in both arms so the experiment isolates the addition of the tile.

## How to judge it

The hypothesis is that the second invitation helps some undecided browsers find a cover they want to send. It could also draw people away from ready-made designs they would have purchased. Count paid outcomes across **both** paths.

**Primary measure:** the share of eligible, uniquely assigned picker sessions that produce an independent paid order, compared with the current grid. Assign before scrolling and include eligible sessions that never reach slot six. Exclude founder/test traffic and free orders, deduplicate paid orders, and report refunds separately. The canonical October baseline recorded zero independent customer conversions. A lift estimate requires new evidence.

**Diagnostic measures:** record one tile impression per eligible session when at least half the tile is visible for one second. Record drawer opens by entry source, generation outcomes, deliberate cover selection, and note confirmation. Reuse the existing `cover_selected` source classification for custom, restored, or fallback art. Add a separate entry-source field where needed. Use allowlisted event fields and omit ideas, image URLs, and note text.

**Decision:** use drawer opens to check discoverability and accepted covers to check whether the result was worth using. Review ready-made note confirmations and paid orders alongside custom ones. If the tile attracts taps but fewer senders finish, revise the invitation. If paid volume is too low to distinguish the variants, report the result as inconclusive. In a mobile usability session, ask what tapping the tile will do and whether the sparkle will appear on the mailed card.

## Review checks

The local prototype was exercised at 320, 390, 768, and 1200 px. Checks covered slot six, appending after a short filtered list, the badge clearing the sample artwork, keyboard opening and dismissal, return focus and scroll, occasion carry-through, explicit creation and acceptance, and replacement with the sender’s custom cover. The mobile and desktop grid images show a scrolled viewport. The drawer uses a prepared illustration for any idea entered.

For implementation review, also verify restored drafts, active private artwork, an unavailable generation service, placement-source attribution, and the clean artwork reference passed to the next step. These are release checks for the eventual feature.

Product decisions and claims follow the [canonical project brief](../../CANONICAL_PROJECT_BRIEF.md) and [product specifications](../../CANONICAL_PRODUCT_SPECS.md).
