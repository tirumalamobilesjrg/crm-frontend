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
Done (branch `feature/shop-profile-settings`): Admin Settings "Shop details" tab (name, phone, WhatsApp, email, address, opening hours, map link, about) writing `shop_settings`; the public website reads it via `public_shop_profile`. Needs backend migration 0022 (branch `feature/shop-profile` in crm-backend) applied first; not yet run against a real Supabase stack.
CRM now uses the Tirumala Mobiles logo palette (deep navy + gold #d5a755; gold fills carry navy text, links use --link). Logo files in `public/logo-*.png`. Next: finish the public website (separate repo `public-website`). Earlier plan was: POS billing
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
- The CRM must never be indexed: `index.html` robots meta, `public/_headers` (`X-Robots-Tag: noindex...` on every response, Cloudflare Pages), `public/robots.txt` (crawling allowed so crawlers can see the noindex). Guarded by `src/lib/noindex.test.ts`. Only the public website is indexed.

## Review fixes (branch fix/review-and-pos-search)
POS: type-to-find box (`FindItemBox`, `findItems.ts`: words ANDed over brand/model/colour/storage/SKU/IMEI digits; Enter adds the first match) next to the scanner box; a typed price below the selling price is refused client-side ("use the Discount box"; the database also treats it as a discount, migration 0023); "Amount received" follows the total again when the cart changes.
Prices (MRP, selling, website) are Admin-only (migration 0024): Managers get no Add/Edit variant buttons. Reports/dashboard use Indian time (IST) for days, presets, the financial year and the CSV date (`shopDate`, `addDays`). Photos up to 15 MB are shrunk in the browser to about 1600 px WebP before upload (`resize.ts`). Unfinished IMEI boxes survive a reload (`useStoredValues`, sessionStorage). Query cache is cleared on sign-out. Accessibility: skip link, per-page title and focus, two-layer focus ring, closed phone drawer hidden from keyboard, status text colours >= 4.5:1, field borders >= 3:1.
Done (branch fix/review-a11y-confirm-cards): `Tabs` (WAI-ARIA tabs: roving tabindex, arrow/Home/End, labelled tabpanel); `useConfirm()` in-app confirmation dialog replacing every `window.confirm` (tests use `autoConfirm()`/`declineNextConfirm()`/`confirmLog` from `src/test/utils.tsx`, the browser smoke uses `e2e/confirm-handler.mjs`); tables with a header row become one card per row at <=700px (`components/tableCards.ts`, class `row-cards`; do not name it `cards`, that is the dashboard grid); POS accessory select now needs the "Add accessory" button.
Done (branch fix/csp-and-sale-guard): strict Content-Security-Policy in `public/_headers` (`default-src 'self'`; images/connections only to self and `https://*.supabase.co`; no inline scripts or styles, so the theme bootstrap lives in `public/theme-init.js`). The browser smoke serves the build with that same policy (`e2e/vite.preview.config.mjs`), so a blocked resource fails it. If the Supabase project ever moves off `*.supabase.co` (custom domain), update `img-src` and `connect-src`. POS: after a sale attempt ends without a definite answer (no connection / unexpected error), changing the cart and selling again asks "Check Sales first" because the changed sale gets a new idempotency key.
Still open from the review: an axe/Lighthouse run and a real-phone check.

## Brand logos (branch feature/brand-logos; needs backend migration 0026, branch feature/brand-logos in crm-backend)
Brands & categories: each brand shows a logo tile (or its first letter), the Products list shows it beside the brand, and staff pick one from a curated gallery of 42 brands (`src/assets/brand-logos/*.svg`, sources and licences in `SOURCES.md`; 32 from Simple Icons CC0, 10 public-domain files from Wikimedia Commons, all sanitised: no scripts, styles, links, filters or clipping) or upload their own PNG/WebP (256 KB). The chosen file is copied into the public `brand-logos` bucket (`api/brandLogos.ts`, `brands.logo_path`); the website never loads logos and shows brand names only. Typing a brand name that is exactly a gallery brand preselects its logo. Gallery logic is in `features/catalogue/logoGallery.ts` (a test checks every bundled SVG is safe), UI in `BrandLogos.tsx`. Do not add third-party logo hotlinks (Brandfetch forbids caching/re-hosting). Adding a gallery logo: put a sanitised `<slug>.svg` in the folder, add `{slug,name}` to `brands.json` and a row to `SOURCES.md`.

## Add stock from the product page (branch fix/add-stock-from-product)
Each active variant on the product page has an "Add stock" button (Admin and Manager). It opens `AddStockDialog` (supplier, supplier invoice number and date, quantity, cost per unit), creates a draft purchase with that variant as its first line and opens it; phones then get one IMEI box each and "Receive stock" there is what adds them. Stock still only enters through `receive_purchase`, so the ledger and cost rules are unchanged. If the line cannot be added the draft is still opened with an explanation.

## Category pictures (branch feature/category-images; needs backend migration 0027)
Brands & categories: each category has a thumbnail and a "Picture" button (JPEG/PNG/WebP, up to 15 MB picked; shrunk in the browser to about 900 px, at most 1 MiB stored) writing the public `category-images` bucket and `categories.image_path` (`api/categoryImages.ts`, rules in `features/catalogue/categoryImage.ts`, UI in `CategoryPicture.tsx`). The website shows the picture on its category tile. `prepareForUpload(file, maxSide, keepIfSmallerThan)` now takes optional limits. The smoke stand-in (`e2e/mock-brands.mjs`) serves brands, categories and both buckets.

## Item-bound approvals (branch feature/item-bound-approvals-ui; needs backend migration 0025)
The Admin picks the phone or accessory (type-to-find) when granting; an approval covers the discount on THAT item only (`approvalAuthority`, `isApprovalItem` in `pos/logic.ts` mirror finalize_sale). The POS lists only approvals whose item is in the cart and shows what each is for (`approvalItemLabel`). Do not release this branch to production before migration 0025 is applied to the hosted database (the new grant_discount_approval arguments do not exist there until then).

## Accessibility audit
`npm run a11y` (e2e/a11y.mjs, axe-core 4.10.3) visits every screen as manager and admin at 375 and 1280 px, light and dark, plus the phone drawer and Settings tabs, against the stand-in server; exits 1 on serious/critical violations. Last run: 0 violations. Automated checks are not a screen-reader or real-phone pass. Icon-only table columns use `<th><span className="sr-only">Actions</span></th>`; invoice lines sit in a focusable `.table-scroll` region.
