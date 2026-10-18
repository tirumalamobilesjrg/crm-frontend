# CRM UI design (branch `feature/ui-redesign`)

Frontend only. No backend, API or data-flow changes (one read-only count, `countDraftPurchases`, for the dashboard).

## Look
- Shop-blue primary (`--primary`), marigold accent for "today", Figtree (text) and Bricolage Grotesque (headings), self-hosted via `@fontsource-variable` (no external font requests).
- All colours are CSS variables in `src/styles.css`. Light, dark and "match this device" themes; the choice is stored in `localStorage` key `crm-theme` (guarded; works with storage blocked) and applied before first paint by an inline script in `index.html`.
- Inline SVG icons: `src/components/icons.tsx`.

## Shell
- Sidebar grouped by task: Sell, Stock, Catalogue, Money, Admin (Admin only). Managers never see Admin links (the database remains the security boundary).
- Below 900px the sidebar is a drawer opened from the top bar: focus moves in, Tab is trapped, Escape/backdrop/choosing a page closes it, focus returns to the menu button.
- Dialogs use the same focus trap (`useFocusTrap`), are named by their title and lock page scroll.
- Toasts: max 4, dismissible; failures use `role="alert"` and stay longer.

## Dashboard
Today's takings with a 7-day strip, quick actions (New sale, Receive stock, Add expense), recent sales, "Needs attention" (out-of-stock accessories, damaged/lost phones, draft purchases), then snapshot counts. Each section loads and fails independently.

## Checking
- `npm run screenshots` writes desktop/dark/phone screenshots to `e2e/out/ui-*.png` for visual review (not a test).
- Tests: `src/components/Shell.test.tsx`, `src/features/dashboard/DashboardPage.test.tsx`; the browser smoke checks no horizontal scroll at phone width.
