# Back office: customers, expenses, reports, audit log

Backend contract (crm-backend migrations 0001-0020) and what is built in the CRM. All Supabase calls live in `src/api/{customers,expenses,reports,audit}.ts`.

## Access (enforced by the database; the UI only mirrors it)

| Resource | Read | Create / edit | Delete |
|---|---|---|---|
| customers | Admin, Manager | Admin, Manager | **Admin only**, and refused (`23503`) if the customer has invoices |
| expenses | Admin, Manager | Admin, Manager | **Admin only** |
| invoices, sales, sale_items, payments, inventory costs, stock | Admin, Manager | never directly | never |
| audit_logs | **Admin only** (a Manager gets no rows, not an error) | never | never (append-only, even for the owner) |

A Manager's DELETE on customers or expenses matches **zero rows without an error**; every update and delete goes through `runChange`, so the screen reports "That change was not applied" instead of success.

## Screens

- `/customers`: search (name, phone, email), 25 per page, New customer. `/customers/:id`: details, edit, purchase history (invoices with links) and lifetime total, Admin-only delete (confirmation; the in-use refusal is explained).
  Phone is optional, 7-15 digits with optional `+`, unique (`23505 customers_phone_key` becomes "A customer with this phone number already exists").
- `/expenses`: date range (defaults to this month), category filter, total and per-category breakdown over the whole range (all pages), add / edit, Admin-only delete.
  Amount > 0 with 2 decimals, category 1-80 characters (suggestions plus your own), paid via cash / UPI / card / bank transfer / cheque, no future dates. **No receipt attachments**: the backend defines no Storage policies yet.
- `/reports` (both roles): Today, Last 7 days, This month, Last month, This financial year (April-March) or a custom range.
  - Sales: count, net, discounts, average, bar chart per day (per month beyond 62 days) with the numbers behind it, by payment method, CSV of every invoice.
  - Products sold: units and revenue per SKU, CSV.
  - Profit estimate: **phones only**, because acquisition cost is recorded per device (`inventory_item_costs`); accessories have no per-unit cost and are listed separately. Estimated profit also subtracts the expenses recorded in the range. It is labelled an estimate.
  - Stock value (now): phones at cost and at selling price, accessories at selling price only.
- `/audit` (Admin only): newest first, filter by action and table, who did it, expandable details.

All totals are computed in integer paise in the browser from rows both roles may read (there is no server-side aggregation). `fetchAll` reads 1000 rows per request and refuses past 20,000 rows ("choose a shorter date range") instead of truncating a total.
CSV cells that start with `=`, `+`, `-` or `@` are prefixed with an apostrophe so a spreadsheet cannot run them as formulas.

## Verified

Against a **local Supabase stack** (migrations 0001-0020, disposable users, nothing hosted), with the real api modules: 30 customers paged and searched, edit, duplicate phone refused on edit, invoice history, a Manager's customer delete returning zero rows, an Admin's delete refused for a customer with sales and allowed for one without;
expenses created / filtered / totalled / edited, constraint errors translated, Manager delete returning zero rows, Admin delete working; the report queries (invoices in a date range, sold lines with the embedded sale date and device cost, in-stock devices, accessory stock) with exact figures (net 38,800, profit 8,000 on costed phones, stock value);
the audit log readable by the Admin, empty for a Manager, and UPDATE / DELETE on it refused (`42501`).
The browser screens ran only against the **stand-in** server (`npm run smoke`).

## Not built / known gaps

- No expense receipts, no recurring expenses, no budgets. No customer merge or import.
- No returns, voids or refunds (no backend support), so reports cannot show them.
- Accessory profit is not reported (no per-unit cost). The estimate is therefore conservative for shops that sell many accessories.
- Reports are computed in the browser: fine for a single shop, but a very long range with more than 20,000 rows must be split.
- The audit log shows what the backend records; it has no export.
