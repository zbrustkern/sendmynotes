from pathlib import Path
import sys

ROOT = Path("/Users/zeke/.codex/worktrees/first-sale-cleanup/sendmynotes")

changes = {
    "components/flow/EntryCardStep.tsx": [
        ('<span className="block text-xs font-semibold text-stone-900 truncate">\n                  Make it personal — Create a custom design', '<span className="block text-xs font-semibold leading-snug text-stone-900">\n                  Create custom artwork'),
        ('<span className="block text-[11px] text-stone-500 truncate">\n                  Describe a personal scene or memory for custom artwork', '<span className="block text-[11px] leading-snug text-stone-500">\n                  From a personal scene or memory'),
        ('              Custom Art\n            </span>\n          </button>', '              Create\n            </span>\n          </button>'),
        ('Mailed in a matching envelope with authentic ballpoint pen handwriting inside.', 'Mailed in an envelope with your message written in real pen ink inside.'),
    ],
    "components/v3/Step2NoteComposition.tsx": [
        ("Includes heavy 120lb cotton card, real pen handwriting &amp; First-Class USPS stamp. Don&apos;t know their address yet? You can add it after checkout.", "Includes a folded cardstock card, your message written in real pen ink, and a First-Class USPS stamp. Don&apos;t know their address yet? You can add it after checkout."),
    ],
    "components/v3/Step3EnvelopeAddressing.tsx": [
        ("Mailed in a matching woven envelope directly to your recipient via USPS First-Class.", "Mailed in an envelope directly to your recipient via USPS First-Class."),
    ],
    "components/v3/Step4ReviewAndPayment.tsx": [
        ("Dispatched via First-Class Mail with live USPS tracking", "Sent via First-Class Mail. Tracking details appear when provided by the mail service."),
        ("Receipt &amp; USPS Tracking Notification Email", "Receipt &amp; Mailing Updates Email"),
        ("Zero accounts or passwords required. We only send your receipt and tracking updates.", "Zero accounts or passwords required. We send your receipt and any available mailing updates."),
    ],
    "components/v3/TargetPurchaseExperience.tsx": [
        ("Real Pen-Written Cards In 60 Seconds", "Personal cards, made easy to send"),
        ("Luxury 120 lb Archival Cardstock • Flat $9.00 Rate (Postage Included)", "Cardstock • Flat $9.00 Rate (Postage Included)"),
    ],
    "components/VendingMachineBuilder.tsx": [
        ("The thoughtful gesture you meant to make today—done in 60 seconds.", "The thoughtful gesture you meant to make today, ready to send."),
        ('<span className="block font-bold text-stone-800">5&quot; × 7&quot;</span>', '<span className="block font-bold text-stone-800">4.25&quot; × 5.5&quot;</span>'),
        ("120 lb Cardstock", "Cardstock"),
        ("<span className=\"block font-bold text-indigo-900\">Archival Ink</span>", "<span className=\"block font-bold text-indigo-900\">Real Pen Ink</span>"),
    ],
    "components/admin/HandwryttenStatusWidget.tsx": [
        ('"Orders are physically penned by robotic arms on 100 lb cardstock and dispatched via USPS."', '"Orders are written with real pens on cardstock and dispatched via USPS."'),
    ],
    "app/privacy/page.tsx": [
        ("Printing card artwork on 120 lb archival cardstock, controlling robotic ballpoint plotting machines to write your message in real ink, stuffing envelopes, applying postage stamps, and mailing via USPS First Class.", "Printing card artwork on cardstock, using automated equipment holding real pens to write your message, preparing envelopes, applying postage stamps, and mailing via USPS First Class."),
    ],
    "app/terms/page.tsx": [
        ("Cards are printed on archival cardstock, penned using automated robotic ballpoint plotters, stamped with domestic postage", "Cards are printed on cardstock, written with automated equipment holding real pens, stamped with domestic postage"),
        ("Delivery dates and transit windows (e.g., 3–6 business days) displayed on the Site are estimates provided by postal carrier schedules and are <strong>not guaranteed delivery deadlines</strong>.", "Preparation typically takes 1–2 business days. Domestic USPS transit typically takes 2–7 business days; these times are estimates and are <strong>not guaranteed delivery deadlines</strong>."),
        ("inked directly onto cotton cardstock", "written on cardstock"),
    ],
    "app/return-policy/page.tsx": [
        ("the tactile quality of our cotton cardstock and real-ink handwriting", "our cardstock and real-ink handwriting"),
    ],
    "app/send/page.tsx": [
        ("ready to edit and mail in 60 seconds.", "ready for you to edit and send."),
    ],
    "app/send/[occasion]/page.tsx": [
        ("Everything: premium heavyweight greeting card, custom artwork printing, real pen handwriting inside, custom envelope addressing, real USPS First-Class postage stamp, and delivery. No hidden checkout fees.", "Everything: a folded cardstock greeting card with custom printed artwork, your message written in real pen ink inside, envelope addressing, a USPS First-Class postage stamp, and mailing. No hidden checkout fees."),
    ],
    "app/order/[id]/page.tsx": [
        ('" Estimated delivery: 2-4 business days."', '" Domestic transit typically takes 2–7 business days; delivery timing is estimated."'),
        ('"Dispatched into postal stream. Estimated delivery: 2-4 business days."', '"Domestic transit typically takes 2–7 business days; delivery timing is estimated, not guaranteed."'),
    ],
    "lib/product-facts.ts": [
        ('envelopeDescription: "matching envelope"', 'envelopeDescription: "envelope"'),
        ('envelopeDisplay: "Matching paper envelope"', 'envelopeDisplay: "Paper envelope"'),
    ],
    "app/admin/page.tsx": [
        ("<div className=\"space-y-5 sm:space-y-8\">\n            {/* KPI METRIC CARDS (2x2 on Mobile, 4x1 on Desktop) */", "<div className=\"space-y-5 sm:space-y-8\">\n            <div className=\"rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950\">\n              <strong>Founder report — October 20, 2026:</strong> Purchases reviewed to date were founder tests. This dated report does not reconcile live paid totals or visit ratios; those figures alone do not establish independent customer demand.\n            </div>\n            {/* KPI METRIC CARDS (2x2 on Mobile, 4x1 on Desktop) */"),
        ("Handwrytten robotic pen drawing, custom 120 lb cardstock, envelope inking, and USPS First Class postage.", "Handwrytten robotic pen drawing, custom cardstock, envelope inking, and USPS First Class postage."),
    ],
}

prepared = {}
for relative_path, replacements in changes.items():
    path = ROOT / relative_path
    content = path.read_text()
    for old, new in replacements:
        count = content.count(old)
        if count != 1:
            raise SystemExit(f"Expected exactly one match in {relative_path}; found {count}: {old[:100]!r}")
        content = content.replace(old, new, 1)
    prepared[path] = content

if '--check' not in sys.argv:
    for path, content in prepared.items():
        path.write_text(content)
print(f'{"Validated" if "--check" in sys.argv else "Applied"} {len(prepared)} scoped files')
