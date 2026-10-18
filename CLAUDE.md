# CLAUDE.md — crm-frontend

Internal CRM for Tirumala Mobiles (a physical mobile-phone shop). React 19 + Vite + TypeScript, talking **directly to Supabase**
(Auth + the REST API generated from the database owned by the `crm-backend` repo). There is **no custom API server**.
Sibling repos: `crm-backend` (schema, RLS, transactional functions — the source of truth), `public-website` (Next.js, not started).

## Business rules already decided (do not re-litigate; change only if the owner says so)
- Exactly **two staff roles: Admin and Manager.** Admin: staff/roles, shop settings, discount policy, approving discounts, audit log.
  Manager: products (incl. publishing), purchases/receiving, inventory, IMEI corrections, POS, customers, expenses. Managers cannot approve discounts.
- Phones are **serialized** (unique IMEI/serial per device). Accessories are **quantity** SKUs. Both create auditable stock movements.
- **No GST/tax** anywhere. Prices are plain selling prices; totals = sum(price x qty) - discounts.
- **Physical shop only**: exactly **one manually recorded payment per sale**, equal to the total. No split, credit/EMI, online payments or gateway. Never imply a payment was verified.
- Discounts are required. Limits are Admin-managed data (`discount_policies`); a Manager has no allowance until an Admin sets one; anything above needs a single-use Admin approval. Enforced by the database, never only here.
- Public website shows only published products, derived in/out-of-stock, and the explicit `public_price`. No offers/discount banners.
- MRP = printed maximum retail price (legal ceiling), NOT the purchase cost. Purchase cost is entered per purchase line. Selling price <= MRP.

## Architecture rules
- All Supabase calls live in `src/api/*`; components never call Supabase directly. Pure validation lives in `features/*/validation.ts` (unit-tested).
- Roles come from the `staff_profiles` table (see `src/auth/AuthProvider.tsx`), never from the JWT. UI gating is convenience; the database is the security boundary.
- Money: typed in rupees, max 2 decimals, compare in integer paise (`src/lib/money.ts`).
- Database errors are translated in `src/lib/errors.ts` (backend `TMxxx` codes; supabase-js auth errors use `error.code`).
- Operations that must not double-submit (finalize_sale, receive_purchase, adjust_*, grant_discount_approval, correct_item_identifiers) take an idempotency key:
  generate ONE per user action with `newIdempotencyKey()` and REUSE it on retry. Argument shapes: backend `docs/API_CONTRACTS.md`.
- Only public values in `.env`: `VITE_SUPABASE_URL` (bare `https://<ref>.supabase.co`) and `VITE_SUPABASE_PUBLISHABLE_KEY`. **Never** the secret/service_role key; `src/lib/env.ts` refuses it.

## Commands (run all before committing)
`npm ci` · `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` · `npm run smoke` (real Chromium vs a stand-in Supabase; once: `npx playwright-core install chromium`)

## State
Done (milestone 1): login/roles shell, dashboard counts, brands/categories, products + variants + publishing, Admin settings (discount policy, staff).
Done (milestone 2, branch `feature/purchasing`): suppliers, draft purchases + lines, receiving via `receive_purchase` (one IMEI/serial box per phone, Enter = next, bad/duplicate flagged; accessories by quantity), "Add variant" opens after creating a product. Only IMEI 1 or serial is captured (no IMEI 2/condition/shelf yet).
Verified: unit/component tests, browser smoke vs a stand-in server (136 checks, incl. purchasing, inventory, POS, back office and product media), purchasing, inventory and POS data layer + RPCs against a LOCAL Supabase stack, and a manual login + catalogue pass against the real project.
Not verified: the purchasing screens in a real browser against real Supabase (API and RPC behaviour was verified against a local stack; the browser smoke uses the stand-in), anything on the hosted project. `src/lib/types.ts` is hand-written (replace with `supabase gen types`).
Done (milestone 3, branch `feature/inventory`): Inventory overview/search, device and accessory detail, stock adjustments (`adjust_stock`, `adjust_quantity_stock`), IMEI correction. Contract: `docs/INVENTORY_API.md`.
Done (milestone 4, branch `feature/pos`): POS (scan/cart/discount/approval/single payment via `finalize_sale`), sales list, invoice with A4 print, Admin discount approvals. Contract: `docs/POS_API.md`.
Done (milestone 5, branch `feature/back-office`): customers (list, detail, edit, history, Admin delete), expenses, reports with CSV, Admin audit log. Contract: `docs/BACKOFFICE.md`.
Done (milestone 6, branch `feature/product-media`): product specifications and photos editor (needs backend migration 0021). Contract: `docs/PRODUCT_MEDIA.md`.
Done (milestone 7, branch `feature/ui-redesign`): CRM UI/UX overhaul (design tokens, light/dark theme, grouped nav + phone drawer, dashboard, focus-trapped dialogs). See `docs/UI_DESIGN.md`.
Next: the public website. Earlier plan was: POS billing
(cart, discounts with reason/approval, single payment, invoice view, A4 print), then customers/expenses/reports.

## Gotchas
- A global `legacy-peer-deps=true` in `~/.npmrc` skips the `@testing-library/dom` peer and makes every test fail. Install with `npm ci --legacy-peer-deps=false`, and don't commit a `package-lock.json` regenerated that way.
- A running `npm run dev` locks `node_modules` native files (rolldown) on Windows; stop it before `npm ci`.
- The backend now rejects a sale unit price above the variant's MRP (`TM003`, migration 0020). The POS must validate against MRP too.
- Updates/deletes must end in `.select(<key>)` and use `runChange` (`src/api/db.ts`): PostgREST reports zero rows changed as success.
- Never show raw database text; add new constraint names to `src/lib/errors.ts` with a test.
- Docker Desktop reserves ports 54323-54422 on Windows; if the smoke stand-in cannot bind 54399 set `SMOKE_MOCK_PORT` to a free port.
- On Windows run `npm run smoke` with `CHROME_PATH` set to an installed Chrome if Playwright's Chromium is not installed.

## Working agreements
- Never commit secrets or `.env`. Never paste keys into chat or files. If a key was exposed, tell the owner to rotate it.
- Prefer small, tested changes; add tests with each feature; keep the smoke test passing.
- Do not deploy or touch the hosted database from here; schema changes belong in `crm-backend` as new forward migrations.
