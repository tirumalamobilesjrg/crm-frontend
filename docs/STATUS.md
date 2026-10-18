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

1. ~~Purchasing and receiving~~ (built).
2. ~~Inventory: devices and accessory stock, adjustments, IMEI correction~~ (built; see "Inventory milestone").
3. ~~POS: cart, discounts with reason and Admin approval, single payment, `finalize_sale`, invoice view/print~~ (built; see "POS milestone").
4. ~~Customers, expenses, simple reports~~ (built; see "Back-office milestone").
5. Product specifications and images; website price approval history.

## Purchasing milestone (branch `feature/purchasing`)

Built: suppliers, draft purchases and lines, receiving through `rpc/receive_purchase` (one idempotency key per attempt, reused if the same
units are retried), "Add variant" opens automatically after creating a product. Checks run locally: lint, typecheck, unit/component tests and build pass.

Not verified / known gaps:
- Nothing ran against the real Supabase project (same caveat as above); the embedded selects on `purchases`/`purchase_items` are untested there.
- The browser smoke test (`npm run smoke`) was not extended or re-run for these screens.
- Only IMEI 1 or serial is captured per phone (no IMEI 2, condition or shelf location yet; the RPC accepts them).
- Duplicates are detected within the delivery on screen; a clash with stock already in the database is reported by the server on receive.
- Lines cannot be edited, only removed and re-added; purchases cannot be deleted, only cancelled.
- Developer note: a global `legacy-peer-deps=true` npm setting skips `@testing-library/dom`; install with `npm ci --legacy-peer-deps=false`.

## Purchasing reliability fixes (branch `fix/purchasing-reliability`)

Found while running the purchasing flow against a local Supabase stack (migrations 0001-0020, disposable users, nothing hosted):
- **Zero-row writes.** PostgREST reports an UPDATE/DELETE that row-level security filtered out (or that hit a finalised purchase) as success.
  Every update/delete in `src/api/` now ends in `.select(<key>)` and goes through `runChange` (`src/api/db.ts`), which turns "0 rows changed"
  into an explicit `no_rows` error with a message that does not claim a specific cause. Covers cancel purchase, remove line, supplier / brand / category /
  product / variant changes, discount policy and staff updates.
- **Error translation (`src/lib/errors.ts`).** Known constraints are mapped by constraint name (supplier name, supplier invoice number - including the
  `lower(...)` index keys -, IMEI 1/2, serial, cross-column identifier, IMEI/serial check constraints). Purchase-state and unit-count errors have actionable
  wording. Raw SQL, constraint text, row dumps and internal ids are never shown; unknown errors become a generic message and are logged with
  `console.warn` in development builds only.
- **Browser smoke test** now has 40 checks (17 original + 23 purchasing): suppliers (validation, duplicate), purchases (loading and empty states, validation,
  lines and totals), receiving (empty boxes blocked, bad and duplicate IMEI flagged, Enter moves on, confirmation dialog, duplicate-in-stock error, same
  idempotency key on retry, new key when units change, success), stale-page behaviour (removing a line of / cancelling a purchase finalised elsewhere),
  and phone-width overflow on a purchase.

Smoke-test accounts: the stand-in server (`e2e/mock-supabase.mjs`) has two fictional accounts that exist only inside that process. They are not
credentials for anything. To exercise the **real** backend from a browser, use a **local** Supabase stack (`supabase start` in crm-backend), create
disposable users with the local admin API and give them `staff_profiles` rows, keep their passwords out of the repo (generate at run time, never
commit), and run `supabase db reset --local` afterwards. Never use hosted accounts or production data for tests.
The smoke job in CI stays non-blocking (`continue-on-error`) until it has passed there reliably.

## Inventory milestone (branch `feature/inventory`)

Routes: `/inventory` (summary, Phones and Accessories tabs, search, filters, pagination), `/inventory/devices/:id` (identifiers, cost, stock ledger,
identifier history, Adjust status, Correct IMEI / serial), `/inventory/accessories/:id` (balance, ledger, Adjust stock). Both roles. Contract and gaps:
`docs/INVENTORY_API.md`.

Checks: lint, typecheck, 185 unit/component/API tests, build, audit, and a 64-check browser smoke (stand-in server). The data layer and all three RPCs were
also run for real against a local Supabase stack (details in `docs/INVENTORY_API.md`). The browser screens have NOT been run against real Supabase.

Known gaps: shelf location / condition not editable (no backend write path); no low-stock threshold; accessory list filtered in the browser; no purchasing
capture of IMEI 2; the screens have only been driven in a browser against the stand-in.

## POS milestone (branch `feature/pos`)

Routes: `/pos` (new sale), `/sales` (list), `/sales/:saleId` (invoice, A4 print), `/approvals` (Admin: grant discount approvals). Contract, rules and gaps: `docs/POS_API.md`.

Checks: lint, typecheck, unit/component/API tests, build, audit, and a 91-check browser smoke against the stand-in server (sale flow, discount approval, failed-then-retried
completion with the same idempotency key, invoice, print layout, sales list, effect on inventory, Admin approvals). The real `finalize_sale`, invoices, approvals and the
policy boundary were also run for real against a local Supabase stack (details in `docs/POS_API.md`). The browser screens have NOT been run against real Supabase.

Known gaps: no returns/voids/refunds; no customer list or edit screen (search and quick-add only); invoice has no shop phone (not snapshotted by the backend); no camera scanning;
reports and expenses not built; the Manager discount allowance must be configured by an Admin in Settings before Managers can discount without an approval.
Windows note: Docker Desktop reserves ports 54323-54422, which includes the smoke stand-in's default 54399; run `SMOKE_MOCK_PORT=58421 npm run smoke` (any free port) in that case.

## Back-office milestone (branch `feature/back-office`)

Routes: `/customers`, `/customers/:id`, `/expenses`, `/reports` (both roles), `/audit` (Admin). Contract, rules and gaps: `docs/BACKOFFICE.md`.

Checks: lint, typecheck, unit/component/API tests, build, audit, and a 119-check browser smoke against the stand-in server. The data layer was also run for real against a local Supabase stack
(customers, expenses, the report queries with exact figures, audit access). The browser screens have NOT been run against real Supabase.

Also fixed: stale caches between modules (a completed sale now refreshes the customer's history and reports; received stock, inventory adjustments and a new POS customer refresh
Inventory, the POS, reports and the customer list).

Known gaps: no receipts (no Storage policies), no returns/refunds, accessory profit not reported, reports computed in the browser (20,000-row guard).

## Product media milestone (branch `feature/product-media`)

Specifications and photos editor on the product page (Admin and Manager): grouped specifications with add/edit/delete, photo upload (JPEG/PNG/WebP, 2 MB) with main photo, order, descriptions and delete.
Needs backend migration 0021 (public `product-images` bucket, staff-only writes). Details, rules and gaps: `docs/PRODUCT_MEDIA.md`.

Checks: lint, typecheck, unit/component/API tests, build, audit, and a 136-check browser smoke against the stand-in server. The media api was also run for real against a local Supabase stack with the Storage service
(uploads, public URL, primary/order, rollback, delete, specifications). The browser screens have NOT been run against real Supabase.
Hosted project: migrations 0020 and 0021 are NOT applied there yet; until 0021 is applied, uploads fail with "Photo storage is not set up on this project yet".
