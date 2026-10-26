# Admin comp sprint synthesis

## Enabled lanes and authority
Inherited coordinator plus native GPT-6 Luna backend, UI and independent audit lanes, per explicit founder request. Skill resolver defaults were inspected; Luna overrides default Claude/Astra execution lanes. Luna CLI preflight returned OK. Approved interactive design and direct execution request provide the scope decisions; no duplicate permission/interview gate was imposed.

## Drafts and peer critique
Backend and UI independently wrote ADMIN-COMP-BACKEND-DRAFT.md and ADMIN-COMP-UI-DRAFT.md. Backend identified that the first UI draft incorrectly assumed cloning an existing order: current modal creates a new card. Accepted and corrected. UI reviewed backend contract and requested trusted app-owned cover IDs to avoid arbitrary provider fetch input. Accepted. Both agreed on separate immutable admin quote, fixed-balance capability and staging hold response.

Independent audit (ADMIN-COMP-AUDIT.md) identified browser/server Meta Purchase leakage for admin comps, missing reason/actor audit and missing old-route idempotency. All are required acceptance fixes. Authentication must precede data access; authenticated actor is server-derived. Staging test_mode alone is not sufficient because supplier test orders can still call provider APIs; explicit early review-only hold is required.

## Final architecture decisions
- SPRINT-0017 foundation, SPRINT-0018 UI/integration/staging. Reporting chat reserves0016 and confirmed no current deployment; discount/artwork0014 stays separate.
- New admin card composer; preset/app-owned cover content; personal US sender entered/confirmed, not hardcoded studio identity.
- Current configured base and international line prices; admin full comp covers all eligible current lines; no fake add-on. Pure injected future catalog test proves extension.
- Public discount business rules and public quote contract unchanged. Separate admin snapshot and origin for both zero/positive balances, with durable private actor/reason/time audit.
- Positive balance uses opaque app capability with one fixed server amount and idempotent provider intent. Staging creates held preview without payment capability/provider effects. Normal domestic fullcomp dispatch implementation remains available outside review-only; international activation gates remain unchanged.
- Accepted order prices survive future catalog changes; unaccepted stale quotes require new review. Exact admin payment metadata required, including missing-field rejection.
- Public order projections omit private admin audit; browser/server conversion reporting exclude full and partial admin-origin orders.
- Coordinator stages only after independent review and isolated regression/security/build checks; record exact serving source/traffic and unchanged production/config. No real charges, email or physical mail in this run.
