# Sprint 0033 promotion contracts

The two authenticated admin endpoints `/api/admin/promotions` and `/api/admin/discounts` accept the same campaign actions. Every request may pass `environment` to assert the configured environment. GET `/api/admin/promotions?view=campaigns` lists `{success,campaigns,weddingCheckoutAvailable,environment}`; GET `view=campaign&campaignId=...` returns a single `campaign` item. GET `view=history&campaignId=...` returns `{success,history}`. Campaign list/detail items contain `{campaign,draft,policy,balance,codes}`.

All new POST actions use a flat JSON envelope and respond with `{success:true,...}`. Errors return `{success:false,error}`.

- `draft-save`: `{campaignId?,revision?,name,distribution:"public"|"private",code?,policy,maxUses?,budgetCents?}`. Omit campaignId/revision for new drafts. Returns `{campaign,draft}`; reload to edit the current revision. Omit code to auto-generate it at publication. Private codes are returned only in the publication or issuance response.
- `draft-preview`: `{campaignId,revision,scenario?}`. Scenario, if provided, is `{countryCode?:string|null,count?:number,previouslyPurchased?:number,previouslyUsedUnits?:number,previouslyUsedCents?:number,countryCodes?:Array<string|null>,verified?:boolean,wrongProject?:boolean}`. Returns `{previewToken,revision,previews:{qualifying,nearMiss,largest,custom?},maximumOrderSubsidyCents,maximumCampaignSubsidyCents,weddingCheckoutAvailable}`. Each preview is the evaluator result described below, with optional domestic single economics.
- `draft-publish`: `{campaignId,revision,previewToken,reason}`. Returns `{campaign,policy,issued:{id,code,url},weddingCheckoutAvailable}`. Wedding publication requires the held staging wedding checkout and active promotion migration.
- `campaign-pause`: `{campaignId,revision,reason}`. Returns `{campaign}`.
- `campaign-issue`: `{campaignId,requestId,count?,reason,restrictions?:{countryCodes?,ownerUid?,projectId?,maxUses?,budgetCents?,endsAt?}}`. Returns `{issued:[{id,code,url}]}`. The request ID is stable across retries and count is bounded to 20.
- `campaign-clone`: `{campaignId,name,reason}`. Returns `{campaign,draft}` with a fresh unspent draft.
- `campaign-inspect`: `{orderId}` or `{campaignId,revision,scenario}`. Returns `{decision}` containing a sanitized frozen decision or synthetic evaluation.

The editor passes this policy (omit optional values when blank), without identifiers and selection strategy:

```ts
{
  workflow: "single" | "multisend" | "wedding";
  scheduleVersion: string; // base900-international500-v1, multi-send-900-v1, or wedding-graduated-pilot-v1
  countryCodes: string[];  // canonical ISO-2 country codes
  match: "all" | "matching";
  minimumQuantity?: number;
  minimumSpendCents?: number;
  audience: "any" | "verified" | "project";
  projectId?: string;
  startsAt?: number;       // epoch ms
  endsAt?: number;         // epoch ms
  chargeTypes: Array<"card_base" | "destination_surcharge">;
  benefit: {type: "fixed_order" | "fixed_unit"; amountCents: number}
         | {type: "percentage"; basisPoints: number};
  maxUnitsPerOrder?: number;
  maxDiscountCentsPerOrder?: number;
  maxUnitsPerProject?: number;
  maxDiscountCentsPerProject?: number;
  perSenderLimit?: number;
  allowFreeDomesticSingle?: boolean;
  payableFloor: "reject" | "cap";
}
```

`evaluatePromotion(policy,basket,now,usage?)` from `lib/promotions-v2.ts` is synchronous. Basket has `{workflow,scheduleVersion,currency:"USD",revision,ownerUid?,projectId?,canPayProject?,lines}`. Each line has `{id,productType:"card",countryCode:string|null,projectOrdinal?,components}`; each component has `{id,chargeType,grossCents,taxPolicyVersion}`. Result has `{eligible,reason,grossCents,discountCents,netCents,eligibleUnits,selectedUnits,lines,appliedPromotions}`; result lines and components include gross/discount/net cents. Component types are open-ended for server adapters, while publication accepts only supported charge types.

`lib/promotions-v2-store.ts` exports `readPromotionForCode(code,reader?)`, returning `{campaign,code,policy}` or null, and `readPromotionUsage(resolved,basket,reader?)`, returning `{usage,balances}`. Balance dimensions are campaign, code, sender and project with `{kind,ref,data,maxUses?,maxCents?,maxUnits?}`. The key in `offer_usage` is SHA-256 of `kind + NUL + entity + NUL + scope`.

New V2 reservations can be paused with `PROMOTION_V2_RESERVATIONS_DISABLED`, `PROMOTION_MULTISEND_RESERVATIONS_DISABLED`, `PROMOTION_SINGLE_RESERVATIONS_DISABLED`, `PROMOTION_INTERNATIONAL_RESERVATIONS_DISABLED`, or `PROMOTION_WEDDING_RESERVATIONS_DISABLED`. Publishing and issuing respect the same switches; existing reservations continue through settlement. `PROMOTION_V2_PUBLICATION_DISABLED` disables only publishing/issuing.
