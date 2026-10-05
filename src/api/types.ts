/** Shared enums and DTO-shaped types the admin app reads from the backend.
 * Enums mirror the backend Prisma enums; new members must be added here too. */

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Response from /auth/me — used to decide what the admin app renders. */
export interface CurrentActor {
  kind: 'STAFF' | 'CUSTOMER';
  id: string;
  email?: string;
  fullName?: string;
  roles: string[];
  permissions: string[];
  branchScope: { kind: 'ALL_BRANCHES' | 'ASSIGNED' | 'NONE'; branchIds?: string[] };
}

/**
 * Mirrors the backend's BranchStatus enum exactly. The closed state is
 * TEMPORARILY_CLOSED, not CLOSED: the shorter name was rejected on save, and a
 * branch the backend had already put in that state rendered with a blank status
 * and no way to archive it, because every branch of the UI was keyed on a value
 * the server never sends.
 */
export type BranchStatus = 'ACTIVE' | 'TEMPORARILY_CLOSED' | 'SUSPENDED' | 'ARCHIVED';

export interface Branch {
  id: string;
  code: string;
  name: string;
  nameAr?: string | null;
  phone?: string | null;
  addressLine: string;
  district?: string | null;
  city: string;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  status: BranchStatus;
  acceptsDelivery: boolean;
  acceptsPickup: boolean;
  isAcceptingOrders: boolean;
  acceptsCashOnDelivery: boolean;
  deliveryFeeMinor: number;
  minOrderMinor: number;
  createdAt: string;
}

export interface CreateBranchInput {
  code: string;
  name: string;
  nameAr?: string;
  phone?: string;
  addressLine: string;
  district?: string;
  city: string;
  latitude?: number;
  longitude?: number;
}

export interface OpeningHoursEntry {
  dayOfWeek: number;
  openMinute: number;
  closeMinute: number;
  isClosed?: boolean;
}

/**
 * Whether a branch is open right now.
 *
 * `configured: false` means **nobody has set a schedule**, which the backend
 * treats as unrestricted rather than closed — every branch predates the editor,
 * so the other reading would have refused every order. The panel says so
 * explicitly rather than showing a green "Open" that means "no rule".
 */
export interface BranchOpenState {
  configured: boolean;
  isOpen: boolean;
  closedReason: 'outside_hours' | 'day_closed' | 'override_closed' | null;
  note: string | null;
  opensAtMinute: number | null;
  closesAtMinute: number | null;
}

export interface HoursOverride {
  id: string;
  branchId: string;
  date: string;
  openMinute: number | null;
  closeMinute: number | null;
  isClosed: boolean;
  note: string | null;
}

export interface ChargesReport {
  period: { from: string; to: string };
  currency: string;
  charges: {
    chargeId: string | null;
    name: string;
    count: number;
    grossMinor: number;
    vatMinor: number;
    totalMinor: number;
    taxable: boolean;
  }[];
  totals: { count: number; grossMinor: number; vatMinor: number; totalMinor: number };
}

// --- Charges ----------------------------------------------------------------

export type ChargeType = 'FIXED' | 'PERCENTAGE' | 'PER_ITEM';
/**
 * Mirrors the backend's ChargeAppliesTo enum exactly. There is deliberately no
 * "ALL": the backend has no such value, so offering it produced a charge form
 * that returned 400 the moment someone picked it.
 */
export type ChargeAppliesTo = 'SUBTOTAL' | 'DELIVERY';

export interface ChargeConditions {
  orderTypes?: string[];
  minSubtotalMinor?: number;
  maxSubtotalMinor?: number;
  paymentMethods?: string[];
}

export interface Charge {
  id: string;
  name: string;
  nameAr?: string | null;
  type: ChargeType;
  appliesTo: ChargeAppliesTo;
  amountMinor: number | null;
  percentBps: number | null;
  taxable: boolean;
  taxClass: TaxClass;
  branchIds: string[] | null;
  conditions: ChargeConditions | null;
  priority: number;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChargeInput {
  name: string;
  nameAr?: string;
  type: ChargeType;
  appliesTo?: ChargeAppliesTo;
  amountMinor?: number;
  percentBps?: number;
  taxable?: boolean;
  taxClass?: TaxClass;
  branchIds?: string[];
  conditions?: ChargeConditions;
  priority?: number;
  startsAt?: string;
  endsAt?: string;
  isActive?: boolean;
}

export type UpdateChargeInput = Partial<CreateChargeInput>;

/** One line of an order's itemised total, as the backend built it. */
export interface BreakdownRow {
  kind: 'ITEMS' | 'DELIVERY_BASE' | 'DELIVERY_DISTANCE' | 'CHARGE' | 'VAT' | 'TOTAL';
  label: string;
  detail: string | null;
  amountMinor: number;
  /**
   * What this row would have cost without a discount, rendered struck through
   * beside the amount. Absent when nothing was discounted.
   */
  strikethroughMinor?: number;
  /**
   * True when this row is **already inside** the total and must not be added
   * to it — the VAT line, because prices are VAT-inclusive. A view that summed
   * every row would overstate every order by 15%.
   */
  included: boolean;
  /** True when the row reduces the total, so it renders with a minus sign. */
  negative: boolean;
}

export interface OrderPriceBreakdown {
  breakdown?: BreakdownRow[];
  delivery?: {
    distanceKm: number | null;
    baseFeeMinor: number;
    baseFeeCoversKm: number;
    chargeableKm: number;
    perKmFeeMinor: number;
    distanceFeeMinor: number;
    deliveryFeeMinor: number;
  } | null;
}

export interface BranchSettings {
  acceptsDelivery: boolean;
  acceptsPickup: boolean;
  isAcceptingOrders: boolean;
  acceptsCashOnDelivery: boolean;
  autoAcceptOrders: boolean;
  /** Base delivery fee, charged on every delivery order. */
  deliveryFeeMinor: number;
  /** How far the base fee reaches before the per-km fee starts. */
  deliveryBaseFeeCoversKm: number;
  /** Charged per started km beyond `deliveryBaseFeeCoversKm`. */
  deliveryPerKmFeeMinor: number;
  /** Straight-line distance is multiplied by this to approximate road distance. */
  deliveryRoadFactor: number;
  /**
   * Percentage added to item prices on delivery orders. Folded into the price
   * the customer sees, not shown as a separate line. A product may override it.
   */
  deliveryUpliftPercent: number;
  /** Minimum item subtotal for a delivery order. Does not apply to pickup. */
  minOrderMinor: number;
  /** Furthest this branch delivers. **Null means no limit** — not "unset". */
  deliveryRadiusKm: number | null;
  prepTimeMinutes: number;
}

export interface Driver {
  id: string;
  userId: string;
  branchId?: string | null;
  licenseNumber?: string | null;
  vehicleType: VehicleType;
  vehiclePlate?: string | null;
  isOnline: boolean;
  isAvailable: boolean;
  /**
   * `string` is not a mistake in this type.
   *
   * These are `Decimal` columns and `Prisma.Decimal` serialises to a JSON
   * string, so a backend older than the fix ships `"24.72"` here. The backend
   * converts now, but a browser open on a counter is running whatever bundle it
   * loaded — so the type admits both and every read goes through
   * `coordinate()` in `util/fleetMap.ts`. Typing it `number` is what let a
   * string reach Google Maps, where it is not a `LatLng`: the pin never landed
   * and the map sat on its fallback centre.
   */
  currentLatitude: number | string | null;
  currentLongitude: number | string | null;
  lastLocationAt?: string | null;
  /**
   * How many deliveries this driver is carrying. Absent on an older backend,
   * where `isAvailable` is all there is.
   */
  activeDeliveryCount?: number;
  user: { fullName: string; email?: string | null; phone?: string | null };
}

export interface Delivery {
  id: string;
  orderId: string;
  branchId: string;
  driverId: string | null;
  status: string;
  addressSnapshot: {
    line1?: string;
    city?: string;
    latitude?: number | string | null;
    longitude?: number | string | null;
  } | null;
  order: { orderNumber: string; referenceId?: string; status: string };
  driver: {
    id: string;
    vehicleType: string;
    /** See the note on `Driver.currentLatitude` — read through `coordinate()`. */
    currentLatitude: number | string | null;
    currentLongitude: number | string | null;
    lastLocationAt?: string | null;
    user: { fullName: string };
  } | null;
}

export interface Order {
  id: string;
  /**
   * The branch's own running number, counting from 1000000. Unique only
   * within its branch — two branches both have a "1000000" — so never use it
   * to identify an order across the platform; use `referenceId`.
   */
  orderNumber: string;
  /** Globally unique 12-digit public reference for this exact order. */
  referenceId?: string;
  status: string;
  type: string;
  totalMinor: number;
  branchId?: string;
}

/** Fully-included order shape returned by GET /orders/:id and /orders (staff). */
export interface OrderDetail {
  id: string;
  /** Per-branch running number, counting from 1000000. See `Order`. */
  orderNumber: string;
  /** Globally unique 12-digit public reference for this exact order. */
  referenceId?: string;
  status: string;
  paymentStatus: string;
  type: 'DELIVERY' | 'PICKUP';
  branchId: string;
  customerId: string;
  placedAt: string;
  customerNotes?: string | null;
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  chargesMinor: number;
  taxableBaseMinor: number;
  vatMinor: number;
  /**
   * The snapshot the backend wrote at placement — the priced quote, the
   * delivery calculation and the itemised breakdown. Optional because orders
   * placed before the breakdown existed do not carry one.
   */
  priceBreakdown?: OrderPriceBreakdown | null;
  vatRate: string;
  totalMinor: number;
  branch?: { id: string; code: string; name: string; nameAr?: string | null };
  customer?: { id: string; phone: string; fullName: string | null };
  items: OrderItem[];
  orderCharges?: { id: string; name: string; nameAr?: string | null; grossMinor: number; vatMinor: number; totalMinor: number; taxable: boolean }[];
  statusHistory: OrderStatusEvent[];
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPriceMinor: number;
  totalMinor: number;
  notes?: string | null;
  modifiers: {
    id: string;
    addonId: string;
    addonName: string;
    priceDeltaMinor: number;
  }[];
}

export interface OrderStatusEvent {
  id: string;
  status: string;
  createdAt: string;
  changedByUserId: string | null;
  reason: string | null;
}

/** Legacy shape used by kitchen/deliveries lists. */
export interface Paginated<T> {
  data: T[];
}

/** New shape with pagination metadata (payments, refunds, coupons, drivers, settlements). */
export interface PaginatedMeta<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
  };
}

// --- Menu ------------------------------------------------------------------

export type TaxClass = 'STANDARD' | 'ZERO_RATED' | 'EXEMPT';

export interface Category {
  id: string;
  name: string;
  nameAr?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
}

/** A product variant — an absolute price that replaces the product's base price. */
export interface Variant {
  id: string;
  productId: string;
  name: string;
  nameAr?: string | null;
  sku?: string | null;
  priceMinor: number;
  isDefault: boolean;
  sortOrder: number;
  isActive: boolean;
}

/** An add-on choice within a modifier group. */
export interface Addon {
  id: string;
  modifierGroupId: string;
  name: string;
  nameAr?: string | null;
  priceMinor: number;
  taxClass: TaxClass;
  sortOrder: number;
  isActive?: boolean;
}

/** A reusable set of choices, shared across products. */
export interface ModifierGroup {
  id: string;
  name: string;
  nameAr?: string | null;
  minSelections: number;
  maxSelections: number;
  isRequired: boolean;
  isActive: boolean;
  addons: Addon[];
}

/** The join between a product and a modifier group (as returned on product detail). */
export interface ProductModifierGroupLink {
  productId: string;
  modifierGroupId: string;
  sortOrder: number;
  modifierGroup: ModifierGroup;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  nameAr?: string | null;
  description?: string | null;
  sku?: string | null;
  imageUrl?: string | null;
  basePriceMinor: number;
  /**
   * Overrides the branch delivery uplift for this product. **Null uses the
   * branch default; 0 means "never uplift this item"** — they are different.
   */
  deliveryUpliftPercent?: number | null;
  taxClass: TaxClass;
  sortOrder: number;
  isActive: boolean;
  variants?: Variant[];
}

/** A product with its variants + modifier groups, from GET /menu/products/:id. */
export interface MenuProductDetail extends Product {
  variants: Variant[];
  modifierGroups: ProductModifierGroupLink[];
}

export interface Availability {
  id: string;
  branchId: string;
  productId: string;
  isAvailable: boolean;
  priceOverrideMinor: number | null;
  unavailableUntil: string | null;
  product: {
    id: string;
    name: string;
    sku: string | null;
    basePriceMinor: number;
    isActive: boolean;
  };
}

// --- Payments / Refunds ----------------------------------------------------

export type PaymentStatus =
  | 'PENDING'
  | 'AUTHORIZED'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUND_PENDING'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED';

export type PaymentMethod =
  | 'CARD'
  | 'MADA'
  | 'APPLE_PAY'
  | 'GOOGLE_PAY'
  | 'CASH_ON_DELIVERY'
  /**
   * Cash taken at the counter on a Branch POS walk-in order
   * (`gatewayName: "counter-cash"`). Distinct from CASH_ON_DELIVERY, which a
   * driver collects at the door — the two reconcile differently and a report
   * that conflates them is wrong about where the money is.
   */
  | 'CASH';

export interface Payment {
  id: string;
  orderId: string;
  status: PaymentStatus;
  method: PaymentMethod | null;
  currency: string;
  amountMinor: number;
  capturedAmountMinor: number;
  refundedAmountMinor: number;
  gatewayName: string;
  gatewayReference?: string | null;
  gatewayPaymentId?: string | null;
  createdAt: string;
  updatedAt: string;
  order?: { orderNumber: string; referenceId?: string; branchId: string };
}

export type RefundStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface Refund {
  id: string;
  paymentId: string;
  orderId: string;
  currency: string;
  amountMinor: number;
  status: RefundStatus;
  reason: string;
  requestedByUserId: string | null;
  gatewayRefundId: string | null;
  requestedAt: string;
  completedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  /** True when a person issued this in the gateway dashboard and recorded it. */
  issuedManually?: boolean;
  gatewayReference?: string | null;
  /** Present on the list/detail reads, which join the owning order. */
  order?: { orderNumber: string; referenceId: string; branchId: string } | null;
}

// --- Refund and cancellation requests ---------------------------------------

/**
 * What the customer asked for. Derived server-side from the order's status —
 * an order still on its way is a CANCELLATION, one already delivered is a
 * REFUND — so this app displays it and never decides it.
 */
export type RefundRequestType = 'CANCELLATION' | 'REFUND';
export type RefundRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';

/**
 * What approving a request actually did. Returned by `POST /:id/approve`.
 *
 * `AWAITING_PAYOUT` is the normal card case and the one to be careful about:
 * approving **promises** money, it does not send any. The owner issues the
 * refund in the Tap dashboard and records it here afterwards.
 */
export type RefundApprovalOutcome =
  | 'AWAITING_PAYOUT'
  | 'MANUAL_SETTLEMENT'
  | 'CANCELLED_NO_REFUND';

export interface RefundRequest {
  id: string;
  orderId: string;
  customerId: string;
  branchId: string;
  type: RefundRequestType;
  status: RefundRequestStatus;
  reason: string;
  resolutionNote: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  refundId: string | null;
  orderCancelled: boolean;
  /** What the branch agreed to give back. Null when nothing was owed. */
  approvedAmountMinor: number | null;
  /**
   * When the owner recorded that the money actually went back. **Null on an
   * APPROVED request means money is still owed** — that is the difference
   * between a decision and a payout, and no screen may conflate them.
   */
  refundIssuedAt: string | null;
  createdAt: string;
  updatedAt: string;
  order?: {
    orderNumber: string;
    referenceId: string;
    // `string`, like every other order status in this client — the union lives
    // on the backend and this app only displays it.
    status: string;
    paymentStatus: PaymentStatus;
    totalMinor: number;
    currency: string;
    placedAt: string;
    deliveredAt: string | null;
  } | null;
  customer?: { id: string; fullName: string | null; phone: string } | null;
  reviewedByUser?: { id: string; fullName: string; email: string } | null;
  refund?: {
    id: string;
    amountMinor: number;
    status: RefundStatus;
    currency: string;
    gatewayReference?: string | null;
    issuedManually?: boolean;
  } | null;
}

// --- Coupons ---------------------------------------------------------------

export type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_DELIVERY';
export type CouponRuleType =
  | 'FIRST_ORDER'
  | 'MIN_SPEND'
  | 'PRODUCT'
  | 'CATEGORY'
  | 'BRANCH'
  | 'TIME_WINDOW'
  | 'CUSTOMER_ELIGIBILITY';

export interface Coupon {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  discountType: DiscountType;
  discountValue: string;
  maxDiscountMinor?: number | null;
  validFrom: string;
  validUntil: string;
  totalUsageLimit?: number | null;
  perCustomerLimit?: number | null;
  usageCount: number;
  isActive?: boolean;
  /** Listed on the customer app's Offers page, code and artwork included. */
  isPublic?: boolean;
  imageUrl?: string | null;
  rules?: { ruleType: CouponRuleType; config: Record<string, unknown> }[];
}

export interface CreateCouponInput {
  code: string;
  name: string;
  description?: string;
  discountType: DiscountType;
  discountValue: string;
  maxDiscountMinor?: number;
  validFrom: string;
  validUntil: string;
  totalUsageLimit?: number;
  perCustomerLimit?: number;
  rules?: { ruleType: CouponRuleType; config: Record<string, unknown> }[];
  /** Publish it as an offer in the customer app. */
  isPublic?: boolean;
  /** Artwork for the offer card. A URL — there is no file upload yet. */
  imageUrl?: string;
}

/**
 * What may be changed on a coupon that already exists.
 *
 * Presentation and availability only, matching the backend: the code, the
 * discount, the dates and the limits are the terms customers were given and
 * that past redemptions were made under. A different offer is a different
 * coupon.
 */
export interface UpdateCouponInput {
  name?: string;
  description?: string;
  isPublic?: boolean;
  isActive?: boolean;
  imageUrl?: string | null;
}

// --- Promotions -------------------------------------------------------------

/**
 * An automatic discount. The customer types nothing — a qualifying cart gets it
 * at checkout, and the backend picks the single best one.
 *
 * The difference from a coupon is the whole reason both exist: a coupon is a
 * code one customer claims, a promotion is a standing price the branch offers
 * everybody. They stack with a coupon (owner decision, 2026-09-10): a customer
 * who qualifies for both gets both, off the same undiscounted price. Two
 * promotions still do not stack with each other — the larger one applies.
 */
export interface Promotion {
  id: string;
  name: string;
  nameAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  imageUrl?: string | null;
  discountType: DiscountType;
  discountValue: string;
  maxDiscountMinor?: number | null;
  /** Branches it runs at. **Empty means every branch**, not none. */
  branchIds: string[];
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  priority: number;
  /** Products it applies to. **Empty means the whole basket**, not none. */
  items?: { productId: string; product?: { id: string; name: string } }[];
}

export interface CreatePromotionInput {
  name: string;
  nameAr?: string;
  description?: string;
  imageUrl?: string;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountMinor?: number;
  branchIds?: string[];
  startsAt: string;
  endsAt: string;
  priority?: number;
  productIds?: string[];
}

/**
 * Everything on a promotion is editable, unlike a coupon.
 *
 * A coupon's terms are frozen because customers were handed a code under them
 * and past redemptions were made against them. A promotion has no code and no
 * redemption record: nobody was given anything to hold, so changing it changes
 * only what future carts get.
 */
export type UpdatePromotionInput = Partial<CreatePromotionInput> & { isActive?: boolean };

// --- Loyalty ---------------------------------------------------------------

export type LoyaltyTxType = 'EARN' | 'REDEEM' | 'REVERSE' | 'EXPIRE' | 'ADJUST';

export interface LoyaltyEntry {
  id: string;
  customerId: string;
  type: LoyaltyTxType;
  points: number;
  reason: string | null;
  orderId: string | null;
  createdAt: string;
}

export interface LoyaltyLedger {
  balance: number;
  data: LoyaltyEntry[];
  meta: PaginatedMeta<LoyaltyEntry>['meta'];
}

// --- Reports ---------------------------------------------------------------

export interface SalesReport {
  period: { from: string; to: string };
  currency: string;
  statusBreakdown: { status: string; orders: number; totalMinor: number }[];
  realised: {
    orders: number;
    subtotalMinor: number;
    discountMinor: number;
    deliveryFeeMinor: number;
    chargesMinor: number;
    taxableBaseMinor: number;
    vatMinor: number;
    totalMinor: number;
  };
  charges: {
    name: string;
    count: number;
    grossMinor: number;
    vatMinor: number;
    totalMinor: number;
  }[];
}

export interface VatReport {
  period: { from: string; to: string };
  currency: string;
  basis: 'gross';
  note: string;
  byRate: { vatRate: string; orders: number; taxableBaseMinor: number; vatMinor: number; totalMinor: number }[];
}

export interface PaymentsReport {
  period: { from: string; to: string };
  currency: string;
  byStatus: { status: string; payments: number; capturedMinor: number; refundedMinor: number }[];
  byMethod: { method: string | null; payments: number; capturedMinor: number; refundedMinor: number }[];
  totals: {
    payments: number;
    capturedMinor: number;
    refundedMinor: number;
    gatewayFeesMinor: number;
    netCapturedMinor: number;
  };
}

// --- Settlements -----------------------------------------------------------

export type SettlementStatus = 'EXPECTED' | 'RECEIVED' | 'MATCHED' | 'DISCREPANCY';
export type SettlementMatchStatus =
  | 'MATCHED'
  | 'UNMATCHED'
  | 'DUPLICATE'
  | 'MISSING'
  | 'UNEXPECTED';

export interface Settlement {
  id: string;
  gatewayName: string;
  settlementReference: string;
  branchId: string | null;
  periodStart: string;
  periodEnd: string;
  payoutDate: string | null;
  status: SettlementStatus;
  expectedNetMinor: string;
  actualNetMinor: string;
  varianceMinor: string;
  notes: string | null;
  createdAt: string;
  transactions?: SettlementTransaction[];
}

export interface SettlementTransaction {
  id: string;
  gatewayReference: string;
  type: 'PAYMENT' | 'REFUND';
  matchStatus: SettlementMatchStatus;
  amountMinor: string;
  feeMinor: string;
  paymentId: string | null;
  refundId: string | null;
  note: string | null;
}

// --- Drivers ---------------------------------------------------------------

export type VehicleType = 'MOTORCYCLE' | 'CAR' | 'BICYCLE' | 'ON_FOOT';

// --- Staff users (Lane 2: /users) ------------------------------------------

/** One role grant on a staff user — flattened by the backend `userView`. */
export interface UserRoleGrant {
  id: string;
  branchId: string | null;
  role: { id: string; name: string; description: string | null };
  branch: { id: string; code: string; name: string } | null;
}

/** A staff user as returned by /users (never includes the password hash). */
export interface StaffUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  roles: UserRoleGrant[];
}

/** Seeded system roles the admin UI offers when granting a role. */
export type SystemRole = 'OWNER' | 'BRANCH_ADMIN' | 'KITCHEN' | 'DRIVER';

// --- Customer directory (Lane 2: /customers) -------------------------------

export interface CustomerAddress {
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  district: string | null;
  city: string;
  postalCode: string | null;
  isDefault: boolean;
}

/** Row shape from GET /customers (list). */
export interface CustomerListItem {
  id: string;
  phone: string;
  email: string | null;
  fullName: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  phoneVerifiedAt: string | null;
  _count: { orders: number; addresses: number };
}

/** Detail shape from GET /customers/:id (with saved addresses). */
export interface CustomerDetail {
  id: string;
  phone: string;
  email: string | null;
  fullName: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  phoneVerifiedAt: string | null;
  addresses: CustomerAddress[];
  _count: { orders: number };
}

// --- Audit log (Lane 2: /audit) --------------------------------------------

export type AuditOutcome = 'SUCCESS' | 'FAILURE' | 'DENIED';

export interface AuditLogEntry {
  id: string;
  actorType: string;
  actorUserId: string | null;
  actorCustomerId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  branchId: string | null;
  before: unknown;
  after: unknown;
  outcome: AuditOutcome;
  reason: string | null;
  correlationId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  actorUser: { id: string; email: string; fullName: string } | null;
  actorCustomer: { id: string; phone: string; fullName: string | null } | null;
  branch: { id: string; code: string; name: string } | null;
}

// --- Cash-on-delivery reconciliation (Lane 2: /deliveries/cash-collections) -

export interface CashCollection {
  id: string;
  deliveryId: string;
  driverId: string;
  branchId: string;
  expectedMinor: number;
  collectedMinor: number;
  varianceMinor: number;
  note: string | null;
  collectedByUserId: string | null;
  createdAt: string;
  driver: { id: string; user: { fullName: string; email: string } } | null;
  branch: { id: string; code: string; name: string } | null;
  delivery: { id: string; order: { id: string; orderNumber: string; referenceId?: string } } | null;
}

/** GET /deliveries/cash-collections — paginated rows plus window totals. */
export interface CashCollectionsResponse {
  data: CashCollection[];
  meta: PaginatedMeta<CashCollection>['meta'];
  totals: { expectedMinor: number; collectedMinor: number; varianceMinor: number };
}

// --- Order edit history (Lane 2: /orders/:id/edits) ------------------------

export type OrderEditAction =
  | 'UPDATE_ITEM_QUANTITY'
  | 'UPDATE_ITEM_NOTES'
  | 'ADD_ITEM'
  | 'REMOVE_ITEM';

export interface OrderEdit {
  id: string;
  action: OrderEditAction;
  reason: string;
  snapshotBefore: unknown;
  snapshotAfter: unknown;
  createdAt: string;
  orderItemId: string | null;
  editedByUser: { id: string; email: string; fullName: string } | null;
}

// --- Driver performance + dashboard KPIs (Lane 2: /reports/*) --------------

export interface DriverPerformanceRow {
  driverId: string;
  driverName: string | null;
  driverEmail: string;
  branch: { id: string; code: string; name: string } | null;
  deliveries: number;
  avgTimeToPickupSeconds: number;
  avgDeliveryTimeSeconds: number;
  activeDays: number;
  deliveriesPerActiveDay: number;
}

export interface DriverPerformanceReport {
  period: { from: string; to: string };
  drivers: DriverPerformanceRow[];
  totals: {
    deliveries: number;
    avgTimeToPickupSeconds: number;
    avgDeliveryTimeSeconds: number;
  };
}

export interface DashboardKpis {
  period: { from: string; to: string };
  avgPrepTimeSeconds: number | null;
  prepTimeSamples: number;
  avgDeliveryTimeSeconds: number | null;
  deliveryTimeSamples: number;
}

// --- Feature Flags ----------------------------------------------------------

export interface FeatureFlag {
  id: string;
  key: string;
  enabled: boolean;
  description?: string | null;
  updatedAt: string;
}

// --- Banners ----------------------------------------------------------------

export type BannerAction = 'NONE' | 'PRODUCT' | 'CATEGORY' | 'BRANCH' | 'EXTERNAL_URL' | 'OFFERS';

export interface Banner {
  id: string;
  name: string;
  imageUrl: string;
  imageUrlAr?: string | null;
  title: string;
  titleAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  buttonText?: string | null;
  buttonTextAr?: string | null;
  action: BannerAction;
  targetId?: string | null;
  targetUrl?: string | null;
  branchIds?: string[] | null;
  priority: number;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive: boolean;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBannerInput {
  name: string;
  imageUrl: string;
  imageUrlAr?: string;
  title: string;
  titleAr?: string;
  description?: string;
  descriptionAr?: string;
  buttonText?: string;
  buttonTextAr?: string;
  action?: BannerAction;
  targetId?: string;
  targetUrl?: string;
  branchIds?: string[];
  priority?: number;
  startsAt?: string;
  endsAt?: string;
}

export type UpdateBannerInput = Partial<CreateBannerInput> & { isActive?: boolean };

// --- Homepage Sections ------------------------------------------------------

export type HomepageSectionKind =
  | 'BANNERS' | 'CATEGORIES' | 'FEATURED' | 'BESTSELLERS'
  | 'POPULAR' | 'OFFERS' | 'COUPONS' | 'LOYALTY'
  | 'RECOMMENDED' | 'CUSTOM';

export interface HomepageSection {
  id: string;
  kind: HomepageSectionKind;
  title?: string | null;
  titleAr?: string | null;
  position: number;
  enabled: boolean;
  config: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}
