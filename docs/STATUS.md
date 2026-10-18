# Status, verification and roadmap

## Verified (all run locally, results below)

| Check | Result |
|---|---|
| `npm run typecheck` | passes |
| `npm run lint` | passes |
| `npm test` | 47 tests in 9 files pass |
| `npm run build` | passes |
| `npm run smoke` (real Chromium, stand-in Supabase) | 16 of 16 pass: login redirect, wrong-password message, Manager and Admin flows, role-gated Settings (link hidden and URL blocked), products list, session restore on reload, sign-out, no horizontal scroll at phone width, no uncaught browser errors |

The browser test found two bugs that unit tests had missed (login error mapping used the wrong field name; an account with no staff profile
stayed on the login page with no explanation); both are fixed and covered by tests.

## NOT verified

- **Nothing has run against the real Supabase project yet.** The stand-in server imitates Auth and REST only to exercise the UI. The first real login
  may reveal differences (response shapes, embedded-resource syntax such as `brand:brands(name)`, error payloads).
- **Hand-written types** in `src/lib/types.ts` mirror the backend schema; regenerate with `supabase gen types typescript` once linked.
- No end-to-end run of mutating actions (create product, publish, save policy) against a database.
- CI for this repository has not run (nothing pushed from the build environment).
- Accessibility was designed in (labels, roles, keyboard-closable dialogs) but not audited with a screen reader.

## Known limitations

- Staff accounts: an Admin must first create the login in Supabase Auth, then add the profile here (the browser cannot create Auth users without the
  secret key). A server-side invite function would remove that step.
- Product specifications and images are not editable yet (the website will need them).
- Variant "website price" approval is recorded by the database; its approver and time are not displayed yet.

## Roadmap (suggested order)

1. Purchasing: draft purchase, lines, **receive with IMEI/serial entry** (`receive_purchase`), accessory quantity receipts.
2. Inventory: devices and accessory stock, adjustments (`adjust_stock`, `adjust_quantity_stock`), IMEI correction (`correct_item_identifiers`).
3. POS: cart (phones by IMEI, accessories by quantity), discounts with reason and Admin approval, single payment, `finalize_sale`, invoice view/print.
4. Customers, expenses, simple reports.
5. Product specifications and images; website price approval history.
