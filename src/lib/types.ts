// Hand-written subset of the backend schema (crm-backend, migrations 0001-0019). Replace with
// `supabase gen types typescript` output once the project is linked.

export type StaffRole = 'admin' | 'manager'
export type TrackingMode = 'serialized' | 'quantity'

export interface StaffProfile {
  user_id: string
  full_name: string
  role: StaffRole
  phone: string | null
  is_active: boolean
  created_at: string
}

export interface Brand {
  id: string
  name: string
  slug: string
  is_active: boolean
  /** Object name in the public `brand-logos` bucket, or null when the brand has no logo. */
  logo_path: string | null
}

export interface Category {
  id: string
  name: string
  slug: string
  is_active: boolean
}

export interface Product {
  id: string
  brand_id: string
  category_id: string
  name: string
  slug: string
  description: string | null
  is_published: boolean
  published_at: string | null
  updated_at: string
}

export interface ProductRow extends Product {
  brand: { name: string; logo_path?: string | null } | null
  category: { name: string } | null
}

export interface Variant {
  id: string
  product_id: string
  sku: string
  color: string | null
  ram_gb: number | null
  storage_gb: number | null
  mrp: number
  selling_price: number
  public_price: number | null
  public_price_approved_at: string | null
  is_active: boolean
  tracking_mode: TrackingMode
}

/** The public contact details in shop_settings (shown on the website through public_shop_profile). */
export interface ShopProfile {
  shop_name: string
  address: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  opening_hours: string | null
  map_url: string | null
  about: string | null
}

export interface DiscountPolicy {
  role: StaffRole
  can_discount: boolean
  max_percent: number
  max_amount: number | null
  can_approve: boolean
  configured_at: string | null
}

export type PurchaseStatus = 'draft' | 'received' | 'cancelled'

export interface Supplier {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  is_active: boolean
}

export interface Purchase {
  id: string
  supplier_id: string
  supplier_invoice_no: string
  invoice_date: string
  status: PurchaseStatus
  total: number
  notes: string | null
  received_at: string | null
  created_at: string
}

export interface PurchaseRow extends Purchase {
  supplier: { name: string } | null
}

export interface PurchaseLine {
  id: string
  purchase_id: string
  variant_id: string
  quantity: number
  unit_cost: number
  line_total: number
  variant: {
    sku: string
    color: string | null
    ram_gb: number | null
    storage_gb: number | null
    tracking_mode: TrackingMode
    product: { name: string } | null
  } | null
}

export interface VariantOption {
  id: string
  sku: string
  color: string | null
  ram_gb: number | null
  storage_gb: number | null
  tracking_mode: TrackingMode
  is_active: boolean
  product: { name: string } | null
}

export interface ReceiveUnit {
  purchase_item_id: string
  imei1?: string
  serial_number?: string
}

export interface ReceiveResult {
  purchase_id: string
  units_received: number
  quantity_lines_received: number
  quantity_units_received: number
  replayed: boolean
}

export type InventoryStatus = 'in_stock' | 'sold' | 'damaged' | 'lost' | 'returned_to_supplier'
export type ItemCondition = 'new' | 'refurbished' | 'used'
export type AdjustmentReason = 'damaged' | 'lost' | 'found' | 'repaired' | 'returned_to_supplier' | 'correction'

/** What the screens need to name a variant. */
export interface VariantLabelInfo {
  id: string
  sku: string
  color: string | null
  ram_gb: number | null
  storage_gb: number | null
  product: { name: string; brand: { name: string } | null } | null
}

export interface InventoryItem {
  id: string
  variant_id: string
  imei1: string | null
  imei2: string | null
  serial_number: string | null
  status: InventoryStatus
  condition: ItemCondition
  shelf_location: string | null
  received_at: string
  updated_at: string
  variant: Omit<VariantLabelInfo, 'id'> | null
}

export interface StockMovement {
  id: number
  movement_type: 'purchase_receipt' | 'sale' | 'adjustment'
  from_status: InventoryStatus | null
  to_status: InventoryStatus | null
  quantity_delta: number | null
  balance_after: number | null
  created_by: string | null
  created_at: string
  adjustment: { reason: AdjustmentReason; notes: string } | null
}

export interface IdentifierCorrection {
  id: string
  old_imei1: string | null
  old_imei2: string | null
  old_serial_number: string | null
  new_imei1: string | null
  new_imei2: string | null
  new_serial_number: string | null
  reason: string
  corrected_by: string
  created_at: string
}

export interface AccessoryRow {
  id: string
  sku: string
  color: string | null
  is_active: boolean
  product: { name: string; brand: { name: string } | null } | null
  on_hand: number
}

export interface InventorySummary {
  inStock: number
  damaged: number
  lost: number
  returnedToSupplier: number
  sold: number
  accessorySkusInStock: number
  accessoryUnits: number
  accessoryUnitsTruncated: boolean
}

export interface AdjustStatusResult {
  adjustment_id: string
  from_status: InventoryStatus
  to_status: InventoryStatus
  replayed: boolean
}

export interface AdjustQuantityResult {
  adjustment_id: string
  balance_after: number
  replayed: boolean
}

export interface CorrectionResult {
  correction_id: string
  inventory_item_id: string
  replayed: boolean
}

export type PaymentMethod = 'cash' | 'upi' | 'card' | 'bank_transfer' | 'cheque'

export interface Customer {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
}

/** A variant as the POS needs it: names plus the two prices the shop controls. */
export interface SellableVariant {
  id: string
  sku: string
  color: string | null
  ram_gb: number | null
  storage_gb: number | null
  mrp: number
  selling_price: number
  is_active: boolean
  product: { name: string; brand: { name: string } | null } | null
}

export interface SellableDevice {
  id: string
  variant_id: string
  imei1: string | null
  imei2: string | null
  serial_number: string | null
  status: InventoryStatus
  variant: SellableVariant | null
}

export interface SellableAccessory extends Omit<SellableVariant, 'ram_gb' | 'storage_gb'> {
  on_hand: number
}

export interface DiscountApproval {
  id: string
  requested_for: string
  approved_by: string
  max_amount: number
  reason: string
  expires_at: string
  used_at: string | null
  used_in_sale_id: string | null
  created_at: string
  /** The one phone or accessory product this approval is for (migration 0025). Exactly one of the two is set. */
  inventory_item_id: string | null
  variant_id: string | null
  /** Display only (embedded by the API): what the approval is for. */
  item?: { imei1: string | null; serial_number: string | null; variant: SellableVariant | null } | null
  variant?: SellableVariant | null
}

export interface FinalizeSaleResult {
  sale_id: string
  invoice_id: string
  invoice_number: string
  total: number
  discount_total: number
  replayed: boolean
}

export interface InvoiceItem {
  id: string
  line_no: number
  description: string
  sku: string | null
  imei1: string | null
  imei2: string | null
  serial_number: string | null
  quantity: number
  unit_price: number
  discount_amount: number
  line_total: number
}

export interface Invoice {
  id: string
  sale_id: string
  invoice_number: string
  issued_at: string
  shop_name: string
  shop_address: string | null
  customer_name: string
  customer_phone: string | null
  customer_address: string | null
  subtotal: number
  discount_total: number
  grand_total: number
  items: InvoiceItem[]
  payments: Array<{ method: PaymentMethod; amount: number; reference: string | null; received_at: string }>
  sale: { sold_by: string; sold_at: string; discount_reason: string | null; discount_basis: string; discount_authorized_by: string | null; notes: string | null } | null
}

export interface SaleListRow {
  id: string
  sale_id: string
  invoice_number: string
  issued_at: string
  customer_name: string
  subtotal: number
  discount_total: number
  grand_total: number
  payments: Array<{ method: PaymentMethod }>
  sale: { sold_by: string } | null
}

export interface CustomerRecord extends Customer {
  created_at: string
}

export interface CustomerInvoiceRow {
  id: string
  sale_id: string
  invoice_number: string
  issued_at: string
  subtotal: number
  discount_total: number
  grand_total: number
}

export interface Expense {
  id: string
  expense_date: string
  category: string
  description: string | null
  amount: number
  paid_via: PaymentMethod
  created_at: string
}

export interface AuditEntry {
  id: number
  occurred_at: string
  actor_id: string | null
  actor_role: string | null
  action: string
  table_name: string | null
  record_id: string | null
  detail: Record<string, unknown> | null
}

export interface ProductSpec {
  id: string
  product_id: string
  group_name: string
  spec_key: string
  spec_value: string
  sort_order: number
}

export interface ProductImage {
  id: string
  product_id: string
  storage_path: string
  alt_text: string
  sort_order: number
  is_primary: boolean
  created_at: string
}
