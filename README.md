# Tirumala Mobiles — CRM (frontend)

Internal React + Vite + TypeScript app for the shop's staff (Admin and Manager). It talks **directly to Supabase**
(Auth + the REST API generated from the database in the `crm-backend` repository). There is no custom API server:
every rule that matters (roles, discount limits, stock, payments) is enforced by the database. This app is the
user interface; hiding a button here is only convenience, never the security boundary.

> Backend repository: `tirumalamobilesjrg/crm-backend` (schema, row-level security, the transactional functions).
> API reference: its `docs/API_CONTRACTS.md`.

## What exists now (milestones 1 and 2)

| Area | Admin | Manager |
|---|---|---|
| Sign in / sign out, session restore, "no access" screen | yes | yes |
| Dashboard (product, published, phones-in-stock, accessory-SKU counts) | yes | yes |
| Brands and categories (add, hide/show) | yes | yes |
| Products: list, search, create, publish / unpublish (with confirmation) | yes | yes |
| Variants: add, edit prices, website price, active flag, stock type (phone by IMEI / accessory by quantity) | yes | yes |
| Suppliers: list, add, deactivate | yes | yes |
| Purchases: draft with lines (variant, quantity, unit cost, supplier invoice no.), cancel draft | yes | yes |
| Receive stock: one scanner-friendly IMEI/serial box per phone (Enter = next box, bad/duplicate flagged), accessories by quantity | yes | yes |
| Inventory: summary, device list with IMEI/serial/product search, accessory stock, device and accessory detail with stock history | yes | yes |
| Stock adjustments (device status, accessory quantity) and audited IMEI/serial correction, through the backend RPCs only | yes | yes |
| POS: scan phones by IMEI, accessories by quantity, discounts (policy limits or Admin approval, with reason), one manual payment, invoice with A4 print | yes | yes |
| Sales list and invoice view | yes | yes |
| Discount approvals (grant a single-use approval) | **yes** | no access |
| Customers (search, edit, purchase history; delete is Admin only) | yes | yes |
| Expenses (record, edit; delete is Admin only) | yes | yes |
| Reports: sales, products, profit estimate, stock value, CSV downloads | yes | yes |
| Audit log | **yes** | no access |
| Product specifications and photos (upload, main photo, order, delete) | yes | yes |
| Settings → Discount policy (Admin and Manager limits; "never reviewed" flag) | **edit** | no access |
| Settings → Staff (list, add profile, change role, deactivate) | **yes** | no access |

Not built yet: returns. See `docs/STATUS.md`.

## Run it

```powershell
npm ci
copy .env.example .env      # then fill in the two values (see below)
npm run dev                 # http://localhost:5173
```
`.env` needs only **public** values:
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```
**Never** put the Supabase *secret* / `service_role` key here. Anything prefixed `VITE_` is shipped to every browser. The app refuses
to start if it detects a secret key (`src/lib/env.ts`).

Sign in with the Admin account created in Supabase (Authentication → Users) that has a row in `staff_profiles`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | development server |
| `npm run build` | typecheck + production build into `dist/` |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | unit and component tests (Vitest + Testing Library) |
| `npm run smoke` | (136 checks) builds against a **stand-in** Supabase (`e2e/mock-supabase.mjs`) and drives the app in a real browser (needs `npx playwright-core install chromium` once, or `CHROME_PATH`) |

## How it is organised

```
src/
  lib/        env check, Supabase client, error messages, money and slug helpers, idempotency key
  api/        every Supabase call, one file per area (components never call Supabase directly)
  auth/       AuthProvider (role read from staff_profiles), route guards
  components/ layout and small UI pieces
  features/   login, dashboard, catalogue, settings (pages + pure validation modules with tests)
e2e/          stand-in Supabase + browser smoke test
```

Conventions that matter:
- **Money** is typed in rupees, validated to at most 2 decimals, and compared in integer paise (`src/lib/money.ts`).
- **Errors** from the database are translated to plain language in one place (`src/lib/errors.ts`), including the backend's `TMxxx` codes.
- **Idempotency**: write operations that must not double-submit (sales, receipts, adjustments — upcoming) take one key per user action from
  `newIdempotencyKey()` and reuse it on retry. The server replays instead of duplicating.
- **Roles** are only ever read from `staff_profiles` (not from the token). UI gating mirrors the database policy and is repeated by it.

## Deploy (free tier)

Any static host works: `npm run build`, publish `dist/`. `public/_redirects` provides the single-page-app fallback for Netlify and
Cloudflare Pages. Set the two `VITE_` variables in the host's settings. Not deployed yet.
