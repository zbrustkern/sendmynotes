from __future__ import annotations

import argparse
from pathlib import Path

ROOT = Path("/Users/zeke/.codex/worktrees/first-sale-cleanup/sendmynotes")
CHANGES: dict[str, list[tuple[str, str, int]]] = {
    "components/CheckoutStep.tsx": [
        ("Zero accounts or passwords required. We only send your receipt and USPS tracking updates.",
         "Zero accounts or passwords required. We send your receipt and any available mailing updates.", 1),
    ],
    "components/v3/Step4ReviewAndPayment.tsx": [
        ("Please enter a valid email for your order receipt and USPS tracking.",
         "Please enter a valid email for your order receipt and any available mailing updates.", 1),
        ("Folded Letterpress Card • Real Ballpoint Inking • USPS 1st Class Stamp",
         "Folded Cardstock Card • Real Pen Ink • USPS 1st Class Stamp", 1),
    ],
    "components/v3/Step5Confirmation.tsx": [
        ("Enclosed in a matching envelope with an authentic USPS stamp.",
         "Enclosed in an envelope with an authentic USPS stamp.", 1),
    ],
    "components/VendingMachineBuilder.tsx": [
        ("Real Pen &amp; Ink on Heavy Cardstock", "Real Pen &amp; Ink on Cardstock", 1),
    ],
    "components/AddressStep.tsx": [
        ("affixed to genuine heavy cardstock envelope.", "affixed to the envelope.", 1),
    ],
    "app/send/page.tsx": [
        ("heavy cardstock", "cardstock", 3),
    ],
    "app/admin/page.tsx": [
        ("custom cardstock, envelope inking, and USPS First Class postage.",
         "custom cardstock, envelope addressing, and USPS First Class postage.", 1),
    ],
}

parser = argparse.ArgumentParser(description="Prepare the scoped SPRINT-0012 residual-copy repair.")
parser.add_argument("--check", action="store_true", help="Preflight all exact matches without writing files.")
args = parser.parse_args()

# Read and validate every requested replacement before any file is changed.
updated: dict[Path, str] = {}
for relative_path, replacements in CHANGES.items():
    path = ROOT / relative_path
    content = path.read_text()
    for old, new, expected_count in replacements:
        count = content.count(old)
        if count != expected_count:
            raise SystemExit(
                f"Expected {expected_count} match(es) in {relative_path}; found {count}: {old!r}"
            )
        content = content.replace(old, new, expected_count)
    updated[path] = content

if args.check:
    print(f"Preflight passed for {len(updated)} files; no files written.")
else:
    for path, content in updated.items():
        path.write_text(content)
    print(f"Updated {len(updated)} files after complete preflight.")
