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
Verified: unit/component tests, browser smoke vs a stand-in server, and a manual login + catalogue pass against the real project.
Not verified: mutations beyond that manual pass (purchasing screens never ran against the real project; `npm run smoke` was not extended for them), CI on GitHub. `src/lib/types.ts` is hand-written (replace with `supabase gen types`).
Next: inventory + adjustments + IMEI correction, then POS billing
(cart, discounts with reason/approval, single payment, invoice view, A4 print), then customers/expenses/reports.

## Gotchas
- A global `legacy-peer-deps=true` in `~/.npmrc` skips the `@testing-library/dom` peer and makes every test fail. Install with `npm ci --legacy-peer-deps=false`, and don't commit a `package-lock.json` regenerated that way.
- A running `npm run dev` locks `node_modules` native files (rolldown) on Windows; stop it before `npm ci`.
- The backend now rejects a sale unit price above the variant's MRP (`TM003`, migration 0020). The POS must validate against MRP too.

## Working agreements
- Never commit secrets or `.env`. Never paste keys into chat or files. If a key was exposed, tell the owner to rotate it.
- Prefer small, tested changes; add tests with each feature; keep the smoke test passing.
- Do not deploy or touch the hosted database from here; schema changes belong in `crm-backend` as new forward migrations.
