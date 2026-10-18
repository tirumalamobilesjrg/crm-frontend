# Inventory: backend contract used by the CRM

Source of truth: `crm-backend` migrations 0001-0020 (inventory tables 0005, quantity stock 0012, identifier history 0015,
RPCs and RLS as redefined in 0019). Everything below was checked against a **local** Supabase stack (see "Verified" at the end).
All Supabase calls live in `src/api/inventory.ts`. Admin and Manager have the same inventory access.

## Reads (PostgREST, RLS: any active staff member)

| Need | Request | Notes |
|---|---|---|
| Device list | `inventory_items?select=id,variant_id,imei1,imei2,serial_number,status,condition,shelf_location,received_at,updated_at,variant:product_variants(sku,color,ram_gb,storage_gb,product:products(name,brand:brands(name)))` + `count=exact`, `order=received_at.desc,id`, `offset/limit` (25 per page) | optional `status=eq.<status>`; search is `or=(imei1.ilike.*t*,imei2.ilike.*t*,serial_number.ilike.*t*,variant_id.in.(ids))` |
| One device | same select with `id=eq.<id>` (single) | |
| Cost | `inventory_item_costs?select=cost_price&inventory_item_id=eq.<id>` (maybeSingle) | separate table; readable by both roles today. If RLS ever hides it the row is absent and the UI says "Not available to you". |
| Device ledger | `stock_movements?select=id,movement_type,from_status,to_status,quantity_delta,balance_after,created_by,created_at,adjustment:stock_adjustments(reason,notes)&inventory_item_id=eq.<id>&order=id.desc` | append-only |
| Identifier history | `inventory_identifier_corrections?select=old_*,new_*,reason,corrected_by,created_at&inventory_item_id=eq.<id>` | the raw `inventory_identifiers` table is **not** readable from the browser; corrections hold old and new values |
| Status counts | `inventory_items?select=id&status=eq.<s>` with `head` + `count=exact` (5 statuses) | |
| Accessories | `product_variants?select=id,sku,color,is_active,product:products(name,brand:brands(name)),stock:stock_levels(on_hand)&tracking_mode=eq.quantity` | no `stock_levels` row = 0 on hand; the embed may arrive as an object or an array (both handled) |
| Accessory ledger | `stock_movements?...&variant_id=eq.<id>&inventory_item_id=is.null&order=id.desc&limit=200` | has `quantity_delta` and `balance_after` |
| Accessory totals | `stock_levels?select=on_hand&on_hand=gt.0` (+ a head count) | the Data API caps rows at 1000; beyond that the unit total is shown as "N+" |
| Variant search index | `product_variants?select=...&tracking_mode=eq.serialized&limit=1000` | product / brand / SKU search is matched client-side to variant ids, then sent as `variant_id.in.(...)` |

Search text is reduced to `[A-Za-z0-9 .-]` before it is placed in a filter string, so commas, parentheses, quotes, `%` and `*` cannot change a filter.

## Writes: three RPCs only (no INSERT/UPDATE/DELETE privilege exists on any inventory table)

Every call takes `p_idempotency_key` (8-128 chars). The UI generates one per attempt (`src/lib/useAttemptKey.ts`), reuses it when the
**same** request is retried, and creates a new one when anything changed. Success is shown from the server's response, never assumed.

| RPC | Arguments | Returns | Rules enforced by the database |
|---|---|---|---|
| `adjust_stock` | `p_inventory_item_id`, `p_reason` (`damaged`, `lost`, `returned_to_supplier`, `found`, `repaired`), `p_notes` (>= 3 chars) | `{adjustment_id, from_status, to_status, replayed}` | in_stock -> damaged / lost / returned_to_supplier; damaged -> in_stock (`repaired`) / returned_to_supplier; lost -> in_stock (`found`). Sold and returned-to-supplier are final. `correction` is refused. Writes an adjustment row, a ledger movement and an audit entry. |
| `adjust_quantity_stock` | `p_variant_id`, `p_quantity_delta` (non-zero integer, |n| <= 100000), `p_reason`, `p_notes` (>= 3) | `{adjustment_id, balance_after, replayed}` | quantity SKUs only (`TM013` otherwise). `damaged`/`lost`/`returned_to_supplier` must be negative, `found` positive, `correction` either, `repaired` not allowed. Never below zero (`TM004`). |
| `correct_item_identifiers` | `p_inventory_item_id`, `p_changes` (any of `imei1`, `imei2`, `serial_number`; `null` clears), `p_reason` (>= 10 chars) | `{correction_id, inventory_item_id, replayed}` | 15-digit Luhn IMEI, serial `[A-Z0-9][A-Z0-9-]{3,39}`, must keep IMEI 1 or serial, IMEI 2 needs IMEI 1 and differs, new values unique across all devices (`23505`), identical values refused (`TM003`). Old values are retired (kept), a correction row and an audit entry are written. Allowed in any status. |

The UI mirrors these rules for fast feedback (`src/features/inventory/logic.ts`) but the database is the authority.

## Error handling

Errors pass through `src/lib/errors.ts`: duplicates (`23505`) and identifier check constraints (`23514`) have field-specific messages,
`TM004` / `TM013` / `TM002` have fixed messages, unknown errors are generic. After a failed adjustment the device or balance is re-read,
because it may have changed under the user (a sale, another adjustment).

## Not supported by the backend (so not built; nothing invented)

- **Shelf location and condition are not editable.** `inventory_items` UPDATE is not granted and there is no RPC. They are displayed only.
- **No low-stock threshold or reorder level exists**, so accessory status is only In stock / Out of stock.
- **No IMEI 2 capture in purchasing yet** (frontend gap, the RPC supports it).
- **No server-side text search across product names** for devices; handled client-side through the variant index (fine for a shop catalogue).
- **Accessory list is not server-paginated**: all quantity SKUs are fetched (<= 1000) and filtered/paged in the browser, because "out of stock" includes SKUs with no `stock_levels` row.
- **No stock movement list across all stock** (only per device / per accessory).
- Sales (`sold`) arrive through `finalize_sale` (POS, not built here).

## Verified against a local Supabase stack (not mocked)

Real `src/api/inventory.ts` and the real RPCs, local Docker stack with migrations 0001-0020 and disposable users:
summary counts, both lists with pagination across 36 devices, status filter, IMEI / serial search, product-name search via the variant index,
filter-injection input neutralised, device detail with cost, ledger, accessory balance and ledger, `adjust_stock` (confirmed result, replay, invalid
transitions, ledger rows), `adjust_quantity_stock` (balance, replay, over-removal, wrong sign, zero, wrong SKU type), `correct_item_identifiers` (history,
duplicate, identical, bad checksum, short reason, clearing the only identifier), direct table writes refused (`42501`), Admin parity and the audit entries.
The browser screens themselves were exercised only against the **stand-in** server (`npm run smoke`).
