# POS: backend contract used by the CRM

Source of truth: `crm-backend` migrations 0001-0020 (sales and invoices 0006, no GST 0011, quantity lines 0012, single payment 0013, discounts 0014,
`finalize_sale` as left by 0019 plus the MRP ceiling of 0020). All calls live in `src/api/sales.ts`. Admin and Manager can both sell; the
discount rules below differ by role. Checked against a **local** Supabase stack (see "Verified").

## Rules the database enforces (the UI mirrors them for feedback; the server decides)

- **No GST anywhere.** `total = sum(unit_price x quantity) - discounts`. The invoice is an internal sale receipt with no tax breakdown.
- **One manually recorded payment per sale, equal to the total.** Methods: cash, upi, card, bank_transfer, cheque. Optional free-text reference.
  Nothing is "verified"; there is no gateway or online checkout.
- **Price ceiling:** each `unit_price` must be > 0, at most 2 decimals and **<= the variant's MRP** (`TM003`, message names the SKU).
- **Phones** are sold one physical device per line (`inventory_item_id`, quantity 1); the device must be `in_stock`. **Accessories** are sold by
  `variant_id` + `quantity` (1-1000) and cannot go below zero stock (`TM004`).
- **Discount** is per line (`discount_amount` for the whole line, <= line amount). Any discount needs `p_discount_reason` (>= 3 chars) and one of:
  - the seller's own policy (`discount_policies`, Admin-configured): `can_discount`, per-line `max_percent` (limit = round(gross x percent / 100, 2)) and an optional
    per-sale `max_amount`. A new Manager has **no allowance** until an Admin sets one; the Admin policy defaults to 100% and can approve; or
  - a **single-use approval** (`p_discount_approval_id`): granted to this user, unused, unexpired, total discount <= its `max_amount`, and within the approver's own limits
    (`TM005` otherwise, with a specific message: already used / expired / above the approved amount / not granted to you).
- Everything is one transaction: sale, lines, invoice (with shop/customer snapshots), payment, stock movements, audit row. Invoice numbers are gapless
  `PFX/YY-YY/NNNNNN` (e.g. `TM/26-27/000001`). Sales, invoices, payments and approvals cannot be written or changed from the browser.

## Reads (PostgREST, RLS: any active staff member; Admin sees all approvals, a Manager only those granted to or by them)

| Need | Request |
|---|---|
| Scan a phone | `inventory_items?select=id,variant_id,imei1,imei2,serial_number,status,variant:product_variants(id,sku,color,ram_gb,storage_gb,mrp,selling_price,is_active,product:products(name,brand:brands(name)))&or=(imei1.eq.T,imei2.eq.T,serial_number.eq.T)&limit=2` (any status, so the screen can explain why it cannot be sold) |
| Accessories to sell | `product_variants?select=id,sku,color,mrp,selling_price,is_active,product:products(...),stock:stock_levels(on_hand)&tracking_mode=eq.quantity&is_active=eq.true` (SKUs without stock are filtered out) |
| Customers | `customers?select=id,name,phone,email,address,notes&or=(name.ilike.*t*,phone.ilike.*t*)&limit=8`; create with `insert ... select().single()` (phone `^\+?[0-9]{7,15}$`, unique: `23505 customers_phone_key`) |
| Discount policy | `discount_policies` (both roles read it; only Admin writes) |
| My usable approvals | `discount_approvals?requested_for=eq.<me>&used_at=is.null&expires_at=gt.<now>` |
| Sales list | `invoices?select=id,sale_id,invoice_number,issued_at,customer_name,subtotal,discount_total,grand_total,payments(method),sale:sales(sold_by)` + `count=exact`, newest first, `or=(invoice_number.ilike.*t*,customer_name.ilike.*t*)` |
| One invoice | `invoices?select=...,items:invoice_items(...),payments(...),sale:sales(sold_by,sold_at,discount_reason,discount_basis,discount_authorized_by,notes)&sale_id=eq.<id>` (single) |

Search text is reduced to a safe character set before it is placed in a filter string.

## Writes

| RPC | Arguments | Returns |
|---|---|---|
| `finalize_sale` | `p_idempotency_key`, `p_customer_id` (null = walk-in), `p_items` (1-50 lines: `{inventory_item_id, unit_price, discount_amount}` or `{variant_id, quantity, unit_price, discount_amount}`), `p_payment` (`{method, amount, reference?}`, exactly this shape), `p_notes`, `p_discount_reason`, `p_discount_approval_id` | `{sale_id, invoice_id, invoice_number, total, discount_total, replayed}` |
| `grant_discount_approval` (Admin only) | `p_idempotency_key`, `p_requested_for`, `p_max_amount`, `p_reason`, `p_valid_minutes` (1-120) | `{approval_id, expires_at, replayed}` |

One idempotency key per attempt (`useAttemptKey`): the identical sale retried after a network failure reuses the key, so the server replays the same sale
(`replayed: true`) instead of selling twice; changing anything creates a new key. A failed attempt stores nothing. On success the screen navigates to the invoice
the server issued; it never shows a made-up number.

## UI behaviour

- `/pos` (both roles): scan IMEI/serial (Enter adds, error keeps the text), accessory picker, editable price/quantity/discount per line with live MRP, stock and policy
  feedback, optional customer (search or quick-add), discount reason and approval selection, payment method/amount (defaults to the total) and reference, confirmation, no double submit.
- `/sales`, `/sales/:saleId` (both roles): list with search/pagination; invoice view laid out for A4. **Print (A4)** uses the browser print dialog; print CSS hides the sidebar, header and buttons.
- `/approvals` (Admin only): grant a single-use approval; list of recent approvals with Active / Used / Expired.

## Not supported by the backend or not built (nothing invented)

- No returns, voids or refunds; an issued invoice cannot be edited or cancelled (immutable by design).
- No split payments, credit/EMI, online payments or payment verification (decided out of scope).
- No customer list/edit screen yet (only search and quick-add inside the POS); no customer purchase history.
- The invoice does not show the shop phone: the backend snapshots only name and address on the invoice.
- No barcode/camera scanning; a USB/Bluetooth scanner that types the code and presses Enter works.
- Reports and expenses are not built.

## Verified

Against a **local Supabase stack** (migrations 0001-0020, disposable users, nothing hosted), with the real `src/api/sales.ts` and the real POS validation logic:
device lookup, sellable accessories, customer create/search/duplicate phone, a mixed-cart sale with invoice `TM/26-27/000001` (items with IMEI snapshot, single payment, totals),
idempotent replay (one sale row), stock and device status after the sale, sales list and search, server rejections (device already sold, price above MRP, accessory over stock, wrong payment,
discount without allowance, discount without reason), the Admin approval flow (grant, single use, reuse refused with a specific message), the 5% policy boundary
(950.00 allowed, 950.01 refused by both the client and the server), direct writes to sales tables refused (`42501`), gapless numbering and audit rows.
The browser screens (cart, discount UI, invoice, print layout) were driven only against the **stand-in** server in `npm run smoke`.
