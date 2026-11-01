# Optional account menu in the card builder

Design spec · October 31, 2026 · Small addition to the approved Upload studio design

## Decision and scope

Expose optional sign-in and sign-out in the existing top-right card-builder menu. Keep the main path focused on sending a thoughtful card: a personal sender can choose a front, write a note, enter addresses, review the total, and pay as a guest. Do not insert a login step, account prompt, or upload promotion into the ordinary funnel. The menu is a quiet utility, useful for returning senders and for people who were individually granted Upload studio access.

This spec follows the [canonical project brief](../../CANONICAL_PROJECT_BRIEF.md) and [product specifications](../../CANONICAL_PRODUCT_SPECS.md). It extends the [approved Upload studio design](../2026-10-30-upload-card-front/DESIGN_SPEC.md) without changing its mockups or public-gallery boundary. `Upload administration` is the owner control surface at `/admin/uploads`; `Upload studio` is the sender workspace at `/create/upload`. They have separate authority. `zbrustkern@gmail.com` and `sentral@gmail.com` can both be authorized administrators, while a Studio grant belongs to one verified Firebase UID. Email forwarding between addresses does not combine those identities or their grants.

## Existing surface and recommended arrangement

The mounted `FlowHeader` already has an 44 px top-right options trigger, a menu, an `AuthModal`, the active email, and an optional separate `Start a new card` action. It currently checks `/api/upload/access` on user change and window focus; the account page also checks access. `AuthContext` exposes `user`, `loading`, and `signOut`. The admin upload page has its own administrator session and account-switch control. These are current code observations, not proof of hosted behavior. The recommendations below tighten state handling and labeling; no new primary navigation or public upload tile is proposed.

Keep the trigger in the same top-right position on desktop and mobile, with an accessible name such as **Account and card options**. Keep price, if shown, as a separate total indicator. Within the menu, account items come first; the destructive card reset remains separated by a rule and retains its own confirmation. Suggested exact order:

| State | Menu content, top to bottom | Notes |
| --- | --- | --- |
| Auth resolving | `Checking account…` (status, not an action); `Start a new card` if available | Avoid a brief signed-out or granted flash while Firebase restores a session. The send flow itself remains usable. |
| Signed out | `Sign in`; separator; `Start a new card` if available | Opening sign-in does not navigate away or clear the current card. No Upload studio item. |
| Signed in, grant checking | Active email (noninteractive); `My account`; `Checking studio access…` (status); `Sign out`; separator; `Start a new card` if available | Do not treat an in-flight entitlement check as denial. |
| Signed in, verified UID with active grant | Active email; `My account`; `Upload studio`; `Sign out`; separator; `Start a new card` if available | Studio link is quiet, inside the menu. It is also available on the entitled account page. No Upload administration link in this sender menu. |
| Signed in, no active grant, expired/revoked grant, or unverified email | Active email; `My account`; `Sign out`; separator; `Start a new card` if available | Hide the Studio link. A direct visit to `/create/upload` explains the actual state; the menu does not advertise or enumerate grants. |
| Entitlement service error | Active email; `My account`; `Studio access unavailable` (status with a small `Retry` action if practical); `Sign out` | Do not imply no grant; server routes still enforce access. Keep ordinary card sending available. |

Use sentence case labels. Show the full active email in the expanded menu, truncated visually with a way to inspect it, so two similar accounts can be distinguished. Do not present a forwarded email as a separate signed-in identity. Keep `Sign out` below destinations and style it as a utility action rather than the primary button. `Start a new card` remains about discarding the draft, not signing out.

## Interaction details

- **Optional sign-in:** Selecting `Sign in` opens the existing authentication modal in context. The sender can close it and keep editing. If explanatory copy is needed, one short line in that modal can say, “You can send a card without an account.” Do not repeat that line throughout checkout. On successful sign-in, retain the current guest card and show the current verified account; do not substitute another account's saved artwork or addresses without an explicit choice.
- **Sign-out and switch:** The menu action signs out of the regular Firebase account. Because an administrator session uses a separate cookie, if the current browser also holds one, explicitly end or invalidate it before presenting the browser as fully signed out or allowing an account switch. If ending that session fails, show a clear retry state; do not leave a hidden prior administrator identity active beside a new sender identity. The admin page's existing `Switch account` remains the place for deliberate administrator switching.
- **Draft and privacy boundary:** A normal guest or catalog card can stay in the browser as an unfinished card after sign-out; never silently discard the sender's words or address. An upload-derived selection, source preview, object URL, pending upload, private design ID, or owner-bound return path must be removed from visible state when UID changes or the user signs out. A private draft may remain server-side under its original UID and can be restored only after that same account reauthenticates and passes fresh ownership/grant checks. If the browser has other draft fields, offer a clear choice to continue them with a catalog front or start a separate card; never attach an account A private front to account B's checkout. Clearing private state is distinct from deleting the original owner's stored work.
- **Grant refresh:** Clear prior UID's cached allowance immediately on auth change, then fetch `/api/upload/access` for the new verified UID. Recheck when the menu opens, when the tab regains focus, and after returning from admin grant/revoke; an interval may supplement these events. Loading, active, inactive, and error are separate states. Hide the link immediately on revoke/expiry once learned. A stale menu link cannot authorize a route: upload, acceptance, private preview, and checkout APIs remain server checked.
- **Mobile and keyboard:** The trigger stays reachable at 320 CSS pixels and remains at least about 44 px. The menu fits inside the viewport, does not cover the primary payment action while closed, and keeps readable email text. Enter/Space opens; Arrow keys move through actions; Escape closes and returns focus to trigger; Tab moves naturally out; outside click closes. Status lines are skipped by roving menu focus. The modal receives focus on open and returns it to the trigger on close. Announce sign-out or access-check failure without dumping technical errors.

## Acceptance criteria

1. A signed-out sender can complete the ordinary `/new` card flow as a guest. Opening and closing sign-in leaves the selected front, note, addresses, and quoted total intact; no login requirement or public Upload studio promotion appears.
2. The menu has the specified labels/order across auth loading, signed out, signed in with grant checking, active grant, inactive/unverified grant, and access error. The active email identifies the actual Firebase account. A Studio grant from one UID never appears for another, even if email forwards to the same inbox.
3. An entitled, verified sender can reach `/create/upload` from the menu and account page; a direct link still enforces its own entitlement. Non-entitled accounts see no Studio menu item. The admin workspace is labeled `Upload administration` and is not confused with the sender workspace.
4. Signing out or switching accounts revokes visible private previews and prevents a previous UID's upload design from appearing or reaching checkout. A guest/catalog draft remains recoverable. An active administrator cookie is cleared or explicitly reported as still active; the interface never claims a complete switch when it failed.
5. At 320, 390, 768, and 1024 px, trigger/menu/modal are usable with touch, keyboard, screen reader names, focus return, and no horizontal overflow. `Start a new card` keeps its separate discard confirmation.

## Do now and defer

Do now: keep the existing menu location and guest flow; make authentication and entitlement states explicit; show the active account email; add the account-bound privacy transition and admin-session sign-out behavior; verify the state matrix in a mounted browser. Update small bits of modal copy only where they clarify optional sign-in.

Defer: a global account navigation redesign, account creation campaigns, a public upload entry, cross-account draft transfer, automatic grants to admin emails, an invitation system, and a new help center. If brief help is useful, place it on the direct Studio access-denied page or within `My account`, where the user is already seeking account information. Do not add a help item to the small sending menu without evidence of a recurring problem.
