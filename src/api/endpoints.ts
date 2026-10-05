import { ApiClient } from './http';
import { BranchDocketOverride, DocketTemplate } from '../print/docket/docket';
import {
  Addon,
  AuditLogEntry,
  AuthTokens,
  Availability,
  Branch,
  BranchStatus,
  CashCollectionsResponse,
  Charge,
  ChargesReport,
  CreateBranchInput,
  CreateChargeInput,
  CurrentActor,
  BranchSettings,
  Category,
  Coupon,
  CreateCouponInput,
  CreatePromotionInput,
  Promotion,
  UpdateCouponInput,
  UpdatePromotionInput,
  CustomerDetail,
  CustomerListItem,
  DashboardKpis,
  Delivery,
  Driver,
  DriverPerformanceReport,
  BranchOpenState,
  HoursOverride,
  LoyaltyLedger,
  MenuProductDetail,
  ModifierGroup,
  OpeningHoursEntry,
  Order,
  OrderDetail,
  OrderEdit,
  Paginated,
  PaginatedMeta,
  Payment,
  PaymentsReport,
  Product,
  ProductModifierGroupLink,
  Banner,
  CreateBannerInput,
  FeatureFlag,
  HomepageSection,
  HomepageSectionKind,
  Refund,
  RefundApprovalOutcome,
  RefundRequest,
  RefundRequestStatus,
  RefundRequestType,
  RefundStatus,
  SalesReport,
  Settlement,
  StaffUser,
  UpdateBannerInput,
  UpdateChargeInput,
  Variant,
  VatReport,
  VehicleType,
} from './types';

function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Typed backend endpoints the admin app uses. Staff (owner / branch admin). */
export class Api {

  // --- Uploaded images ------------------------------------------------------

  /**
   * Uploads one image and returns the path to store on a product, coupon or
   * banner.
   *
   * The response carries a **path**, not a hostname, so the stored value works
   * from this app, the customer app and a local build alike — see
   * `util/imageUrl.ts` for the resolving half.
   */
  uploadImage(file: File): Promise<{ id: string; url: string; mimeType: string; byteSize: number }> {
    return this.http.upload('/assets', file);
  }

  constructor(private readonly http: ApiClient) {}

  // --- Auth / branches ----------------------------------------------------

  login(email: string, password: string): Promise<AuthTokens> {
    return this.http.request('/auth/staff/login', {
      method: 'POST',
      body: { email, password },
      public: true,
    });
  }

  /**
   * Ends the session server-side.
   *
   * Clearing the token locally is not signing out: the refresh token stays
   * valid for its full 30 days, so a shared office machine keeps a working
   * session after someone "logs out". This revokes the family. Callers clear
   * local state regardless of the result — signing out must never fail because
   * the network did.
   */
  logout(refreshToken: string): Promise<void> {
    return this.http.request('/auth/logout', {
      method: 'POST',
      body: { refreshToken },
      public: true,
    });
  }

  me(): Promise<CurrentActor> {
    return this.http.request('/auth/me');
  }

  branches(): Promise<Branch[]> {
    return this.http.request('/branches');
  }

  // --- The customer docket's template ---------------------------------------
  // The layout every branch prints its customer receipt from. The owner edits
  // the organisation default here; a branch may override the two fields
  // `BRANCH_OVERRIDABLE_KEYS` names on the backend, and the server resolves
  // the two into what that branch actually prints.

  receiptTemplateDefault(): Promise<{ template: DocketTemplate; updatedAt: string | null }> {
    return this.http.request('/receipt-templates/default');
  }

  /** The built-in template, behind the editor's Reset. */
  receiptTemplateShipped(): Promise<{ template: DocketTemplate }> {
    return this.http.request('/receipt-templates/shipped');
  }

  saveReceiptTemplateDefault(template: DocketTemplate): Promise<DocketTemplate> {
    return this.http.request('/receipt-templates/default', { method: 'PUT', body: template });
  }

  receiptTemplateForBranch(branchId: string): Promise<{
    resolved: DocketTemplate;
    organisationDefault: DocketTemplate;
    override: BranchDocketOverride;
  }> {
    return this.http.request(`/receipt-templates/branches/${branchId}`);
  }

  saveReceiptTemplateForBranch(
    branchId: string,
    override: BranchDocketOverride,
  ): Promise<DocketTemplate> {
    return this.http.request(`/receipt-templates/branches/${branchId}`, {
      method: 'PUT',
      body: override,
    });
  }

  clearReceiptTemplateForBranch(branchId: string): Promise<DocketTemplate> {
    return this.http.request(`/receipt-templates/branches/${branchId}`, { method: 'DELETE' });
  }

  branchSettings(branchId: string): Promise<BranchSettings> {
    return this.http.request(`/branches/${branchId}/settings`);
  }

  updateBranchSettings(branchId: string, patch: Partial<BranchSettings>): Promise<BranchSettings> {
    return this.http.request(`/branches/${branchId}/settings`, { method: 'PATCH', body: patch });
  }

  getBranch(id: string): Promise<Branch> {
    return this.http.request(`/branches/${id}`);
  }

  createBranch(input: CreateBranchInput): Promise<Branch> {
    return this.http.request('/branches', { method: 'POST', body: input });
  }

  updateBranch(id: string, patch: Partial<CreateBranchInput>): Promise<Branch> {
    return this.http.request(`/branches/${id}`, { method: 'PATCH', body: patch });
  }

  changeBranchStatus(id: string, status: BranchStatus, reason?: string): Promise<Branch> {
    return this.http.request(`/branches/${id}/status`, { method: 'POST', body: { status, reason } });
  }

  duplicateBranch(id: string, code: string, name: string, activate?: boolean): Promise<Branch> {
    return this.http.request(`/branches/${id}/duplicate`, { method: 'POST', body: { code, name, activate } });
  }

  /**
   * The branch's schedule and its date overrides.
   *
   * Returns **both** halves, because the editor needs both and fetching them
   * separately is two loading states for one panel. `hours` carries only the
   * days that have rows — a branch with no schedule gets `[]`, which is what
   * `weekFrom` (`util/openingHours.ts`) turns into an editable week.
   */
  getOpeningHours(branchId: string): Promise<{
    hours: OpeningHoursEntry[];
    overrides: HoursOverride[];
  }> {
    return this.http.request(`/branches/${branchId}/hours`);
  }

  /** Whether the branch is open right now, and when it next opens. */
  branchOpenState(branchId: string): Promise<BranchOpenState> {
    return this.http.request(`/branches/${branchId}/hours/open`);
  }

  setOpeningHours(branchId: string, hours: OpeningHoursEntry[]): Promise<OpeningHoursEntry[]> {
    const payload = hours.map(({ dayOfWeek, openMinute, closeMinute, isClosed }) => ({
      dayOfWeek, openMinute, closeMinute, isClosed,
    }));
    return this.http.request<{ hours: OpeningHoursEntry[] }>(`/branches/${branchId}/hours`, { method: 'PUT', body: { hours: payload } }).then((r) => r.hours);
  }

  addHoursOverride(branchId: string, override: { date: string; openMinute?: number; closeMinute?: number; isClosed: boolean; note?: string }): Promise<HoursOverride> {
    return this.http.request(`/branches/${branchId}/hours/overrides`, { method: 'POST', body: override });
  }

  removeHoursOverride(branchId: string, overrideId: string): Promise<void> {
    return this.http.request(`/branches/${branchId}/hours/overrides/${overrideId}`, {
      method: 'DELETE',
    });
  }

  chargesReport(params: { from: string; to: string; branchId?: string }): Promise<ChargesReport> {
    return this.http.request(`/reports/charges${query(params)}`);
  }

  // --- Charges (config) ---------------------------------------------------

  listCharges(): Promise<Charge[]> {
    return this.http.request('/charges');
  }

  getCharge(id: string): Promise<Charge> {
    return this.http.request(`/charges/${id}`);
  }

  createCharge(input: CreateChargeInput): Promise<Charge> {
    return this.http.request('/charges', { method: 'POST', body: input });
  }

  updateCharge(id: string, input: UpdateChargeInput): Promise<Charge> {
    return this.http.request(`/charges/${id}`, { method: 'PATCH', body: input });
  }

  // --- Feature Flags -------------------------------------------------------

  listFeatureFlags(): Promise<FeatureFlag[]> {
    return this.http.request('/feature-flags');
  }

  toggleFeatureFlag(key: string, enabled: boolean): Promise<FeatureFlag> {
    return this.http.request(`/feature-flags/${key}`, { method: 'PATCH', body: { enabled } });
  }

  // --- Banners -------------------------------------------------------------

  listBanners(): Promise<Banner[]> {
    return this.http.request('/banners');
  }

  createBanner(input: CreateBannerInput): Promise<Banner> {
    return this.http.request('/banners', { method: 'POST', body: input });
  }

  updateBanner(id: string, input: UpdateBannerInput): Promise<Banner> {
    return this.http.request(`/banners/${id}`, { method: 'PATCH', body: input });
  }

  publishBanner(id: string): Promise<Banner> {
    return this.http.request(`/banners/${id}/publish`, { method: 'POST' });
  }

  unpublishBanner(id: string): Promise<Banner> {
    return this.http.request(`/banners/${id}/unpublish`, { method: 'POST' });
  }

  deleteBanner(id: string): Promise<void> {
    return this.http.request(`/banners/${id}`, { method: 'DELETE' });
  }

  // --- Homepage Sections ---------------------------------------------------

  listHomepageSections(): Promise<HomepageSection[]> {
    return this.http.request('/homepage/sections');
  }

  upsertHomepageSection(input: { kind: HomepageSectionKind; title?: string; titleAr?: string; position?: number; enabled?: boolean; config?: Record<string, unknown> }): Promise<HomepageSection> {
    return this.http.request('/homepage/sections', { method: 'PUT', body: input });
  }

  reorderHomepageSections(sectionIds: string[]): Promise<void> {
    return this.http.request('/homepage/sections/reorder', { method: 'POST', body: { sectionIds } });
  }

  deleteHomepageSection(id: string): Promise<void> {
    return this.http.request(`/homepage/sections/${id}`, { method: 'DELETE' });
  }

  // --- Deliveries ---------------------------------------------------------

  deliveries(params: { branchId?: string; status?: string; limit?: number } = {}): Promise<Paginated<Delivery>> {
    return this.http.request(`/deliveries${query({ limit: 100, ...params })}`);
  }

  /** All drivers (with an optional shift/availability filter). */
  listAllDrivers(params: { isOnline?: boolean; isAvailable?: boolean; limit?: number } = {}): Promise<PaginatedMeta<Driver>> {
    return this.http.request(`/drivers${query({ limit: 100, ...params })}`);
  }

  assignDriver(deliveryId: string, driverId: string): Promise<Delivery> {
    return this.http.request(`/deliveries/${deliveryId}/assign`, {
      method: 'POST',
      body: { driverId },
    });
  }

  /**
   * Takes a delivery back off its driver and returns it to the pool. Only
   * before pickup — after that the food is in the car and a failed delivery is
   * the honest record.
   */
  unassignDriver(deliveryId: string, reason?: string): Promise<Delivery> {
    return this.http.request(`/deliveries/${deliveryId}/unassign`, {
      method: 'POST',
      body: reason ? { reason } : {},
    });
  }

  /**
   * The drivers a delivery can be handed to — **every driver on shift**, not
   * only the free ones.
   *
   * It used to ask for `isAvailable=true`, which was right while a driver could
   * hold exactly one job. A busy driver can now take another drop, so filtering
   * them out here would hide the person already riding to that street and leave
   * the counter reading "no available drivers" with three drivers out. Who is
   * free and who is loaded is shown on the row instead, and the server is what
   * enforces the ceiling.
   */
  assignableDrivers(): Promise<PaginatedMeta<Driver>> {
    return this.http.request('/drivers?isOnline=true&limit=100');
  }

  // --- Kitchen queue ------------------------------------------------------

  listOrders(params: {
    branchId?: string;
    status?: string;
    customerId?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<PaginatedMeta<OrderDetail>> {
    return this.http.request(`/orders${query({ limit: 25, ...params })}`);
  }

  getOrder(id: string): Promise<OrderDetail> {
    return this.http.request(`/orders/${id}`);
  }

  cancelOrder(id: string, reason: string): Promise<OrderDetail> {
    return this.http.request(`/orders/${id}/cancel`, { method: 'POST', body: { reason } });
  }

  completePickup(id: string): Promise<OrderDetail> {
    return this.http.request(`/orders/${id}/complete-pickup`, { method: 'POST' });
  }

  kitchenQueue(branchId: string): Promise<Order[]> {
    return this.http.request(`/orders/kitchen/queue?branchId=${branchId}`);
  }

  /** Orders waiting for the branch to accept or reject (autoAccept=off). */
  awaitingAcceptanceQueue(branchId: string): Promise<OrderDetail[]> {
    return this.http.request(`/orders/awaiting-acceptance/queue?branchId=${branchId}`);
  }

  acceptOrder(id: string): Promise<OrderDetail> {
    return this.http.request(`/orders/${id}/accept`, { method: 'POST' });
  }

  rejectOrder(id: string, reason: string): Promise<OrderDetail> {
    return this.http.request(`/orders/${id}/reject`, { method: 'POST', body: { reason } });
  }

  markPreparing(orderId: string): Promise<Order> {
    return this.http.request(`/orders/${orderId}/preparing`, { method: 'POST' });
  }

  markReady(orderId: string): Promise<Order> {
    return this.http.request(`/orders/${orderId}/ready`, { method: 'POST' });
  }

  // --- Menu ---------------------------------------------------------------

  listCategories(includeInactive = true): Promise<Category[]> {
    return this.http.request(`/menu/categories${query({ includeInactive })}`);
  }

  createCategory(body: {
    name: string;
    nameAr?: string;
    description?: string;
    sortOrder?: number;
  }): Promise<Category> {
    return this.http.request('/menu/categories', { method: 'POST', body });
  }

  updateCategory(id: string, body: Partial<Category>): Promise<Category> {
    return this.http.request(`/menu/categories/${id}`, { method: 'PATCH', body });
  }

  deleteCategory(id: string): Promise<void> {
    return this.http.request(`/menu/categories/${id}`, { method: 'DELETE' });
  }

  listProducts(params: { categoryId?: string; includeInactive?: boolean } = {}): Promise<Product[]> {
    return this.http.request(`/menu/products${query({ ...params, includeInactive: true })}`);
  }

  createProduct(body: {
    categoryId: string;
    name: string;
    nameAr?: string;
    description?: string;
    sku?: string;
    basePriceMinor: number;
    /** Null (or omitted) uses the branch uplift; 0 means never uplift this item. */
    deliveryUpliftPercent?: number | null;
    taxClass?: string;
    sortOrder?: number;
    isActive?: boolean;
    imageUrl?: string;
  }): Promise<Product> {
    return this.http.request('/menu/products', { method: 'POST', body });
  }

  /** One product with variants + modifier groups (read-only detail). */
  getMenuProduct(id: string): Promise<MenuProductDetail> {
    return this.http.request(`/menu/products/${id}`);
  }

  updateProduct(id: string, body: Partial<Product>): Promise<Product> {
    return this.http.request(`/menu/products/${id}`, { method: 'PATCH', body });
  }

  deleteProduct(id: string): Promise<void> {
    return this.http.request(`/menu/products/${id}`, { method: 'DELETE' });
  }

  listAvailability(branchId: string): Promise<Availability[]> {
    return this.http.request(`/menu/branches/${branchId}/availability`);
  }

  setAvailability(
    branchId: string,
    productId: string,
    body: { isAvailable: boolean; priceOverrideMinor?: number | null; unavailableUntil?: string },
  ): Promise<Availability> {
    return this.http.request(`/menu/branches/${branchId}/products/${productId}/availability`, {
      method: 'PATCH',
      body,
    });
  }

  // --- Variants (menu:write) ----------------------------------------------

  createVariant(
    productId: string,
    body: { name: string; nameAr?: string; sku?: string; priceMinor: number; isDefault?: boolean; sortOrder?: number },
  ): Promise<Variant> {
    return this.http.request(`/menu/products/${productId}/variants`, { method: 'POST', body });
  }

  updateVariant(
    id: string,
    body: Partial<{ name: string; nameAr?: string; sku?: string; priceMinor: number; isDefault: boolean; sortOrder: number; isActive: boolean }>,
  ): Promise<Variant> {
    return this.http.request(`/menu/variants/${id}`, { method: 'PATCH', body });
  }

  deleteVariant(id: string): Promise<void> {
    return this.http.request(`/menu/variants/${id}`, { method: 'DELETE' });
  }

  // --- Modifier groups + add-ons (menu:write) -----------------------------

  listModifierGroups(includeInactive = true): Promise<ModifierGroup[]> {
    return this.http.request(`/menu/modifier-groups${query({ includeInactive })}`);
  }

  createModifierGroup(body: {
    name: string;
    nameAr?: string;
    minSelections?: number;
    maxSelections?: number;
    isRequired?: boolean;
  }): Promise<ModifierGroup> {
    return this.http.request('/menu/modifier-groups', { method: 'POST', body });
  }

  updateModifierGroup(
    id: string,
    body: Partial<{ name: string; nameAr?: string; minSelections: number; maxSelections: number; isRequired: boolean; isActive: boolean }>,
  ): Promise<ModifierGroup> {
    return this.http.request(`/menu/modifier-groups/${id}`, { method: 'PATCH', body });
  }

  deleteModifierGroup(id: string): Promise<void> {
    return this.http.request(`/menu/modifier-groups/${id}`, { method: 'DELETE' });
  }

  createAddon(
    groupId: string,
    body: { name: string; nameAr?: string; priceMinor?: number; taxClass?: string; sortOrder?: number },
  ): Promise<Addon> {
    return this.http.request(`/menu/modifier-groups/${groupId}/addons`, { method: 'POST', body });
  }

  updateAddon(
    id: string,
    body: Partial<{ name: string; nameAr?: string; priceMinor: number; taxClass: string; sortOrder: number; isActive: boolean }>,
  ): Promise<Addon> {
    return this.http.request(`/menu/addons/${id}`, { method: 'PATCH', body });
  }

  deleteAddon(id: string): Promise<void> {
    return this.http.request(`/menu/addons/${id}`, { method: 'DELETE' });
  }

  attachModifierGroup(
    productId: string,
    body: { modifierGroupId: string; sortOrder?: number },
  ): Promise<ProductModifierGroupLink> {
    return this.http.request(`/menu/products/${productId}/modifier-groups`, { method: 'POST', body });
  }

  detachModifierGroup(productId: string, groupId: string): Promise<void> {
    return this.http.request(`/menu/products/${productId}/modifier-groups/${groupId}`, {
      method: 'DELETE',
    });
  }

  // --- Payments / refunds -------------------------------------------------

  listPayments(params: {
    branchId?: string;
    status?: string;
    orderId?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<PaginatedMeta<Payment>> {
    return this.http.request(`/payments${query({ limit: 25, ...params })}`);
  }

  createRefund(body: {
    paymentId: string;
    amountMinor?: number;
    reason: string;
    idempotencyKey?: string;
  }): Promise<Refund> {
    return this.http.request('/refunds', { method: 'POST', body });
  }

  listRefunds(params: {
    branchId?: string;
    status?: RefundStatus;
    orderId?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<PaginatedMeta<Refund>> {
    return this.http.request(`/refunds${query({ limit: 25, ...params })}`);
  }

  // --- Refund and cancellation requests -------------------------------------

  /**
   * The branch's queue of customer requests. `status: 'PENDING'` is the queue
   * itself; the rest is history.
   */
  listRefundRequests(
    params: {
      branchId?: string;
      status?: RefundRequestStatus;
      type?: RefundRequestType;
      orderId?: string;
      /** True = approved and the money not yet sent (the owner's payout queue). */
      awaitingPayout?: boolean;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<PaginatedMeta<RefundRequest>> {
    return this.http.request(`/refund-requests${query({ limit: 25, ...params })}`);
  }

  /**
   * Approve. The server decides what that means for this order — it cancels
   * where cancelling is still legal and refunds what can be refunded — and says
   * which in `outcome`. Deliberately no `idempotencyKey` here: the refund it
   * issues is keyed on the request id server-side, so a double press cannot pay
   * out twice however this client behaves.
   */
  approveRefundRequest(
    id: string,
    body: { amountMinor?: number; note?: string; cancelOrder?: boolean },
  ): Promise<{ request: RefundRequest; outcome: RefundApprovalOutcome }> {
    return this.http.request(`/refund-requests/${id}/approve`, { method: 'POST', body });
  }

  /** Decline. The note is required and is sent to the customer. */
  rejectRefundRequest(id: string, body: { note: string }): Promise<RefundRequest> {
    return this.http.request(`/refund-requests/${id}/reject`, { method: 'POST', body });
  }

  /**
   * Record a refund already issued in the Tap dashboard — owner-only
   * (`refunds:write`).
   *
   * This is the act that moves the money columns and tells the customer their
   * refund has been sent, so it is pressed **after** paying out, never before.
   * The gateway reference is what ties our record to its line on the payout at
   * reconciliation.
   */
  recordRefundIssued(
    id: string,
    body: { gatewayReference: string; amountMinor?: number; note?: string },
  ): Promise<RefundRequest> {
    return this.http.request(`/refund-requests/${id}/record-refund`, { method: 'POST', body });
  }

  // --- Promotions ---------------------------------------------------------

  listPromotions(): Promise<Promotion[]> {
    return this.http.request('/promotions');
  }

  createPromotion(body: CreatePromotionInput): Promise<Promotion> {
    return this.http.request('/promotions', { method: 'POST', body });
  }

  updatePromotion(id: string, body: UpdatePromotionInput): Promise<Promotion> {
    return this.http.request(`/promotions/${id}`, { method: 'PATCH', body });
  }

  publishPromotion(id: string): Promise<Promotion> {
    return this.http.request(`/promotions/${id}/publish`, { method: 'POST' });
  }

  unpublishPromotion(id: string): Promise<Promotion> {
    return this.http.request(`/promotions/${id}/unpublish`, { method: 'POST' });
  }

  deletePromotion(id: string): Promise<void> {
    return this.http.request(`/promotions/${id}`, { method: 'DELETE' });
  }

  // --- Coupons ------------------------------------------------------------

  listCoupons(params: { page?: number; limit?: number } = {}): Promise<PaginatedMeta<Coupon>> {
    return this.http.request(`/coupons${query({ limit: 25, ...params })}`);
  }

  createCoupon(body: CreateCouponInput): Promise<Coupon> {
    return this.http.request('/coupons', { method: 'POST', body });
  }

  /** Publish/unpublish an offer, change its artwork, or take a coupon off sale. */
  updateCoupon(id: string, body: UpdateCouponInput): Promise<Coupon> {
    return this.http.request(`/coupons/${id}`, { method: 'PATCH', body });
  }

  getCoupon(id: string): Promise<Coupon> {
    return this.http.request(`/coupons/${id}`);
  }

  // --- Loyalty ------------------------------------------------------------

  customerLedger(
    customerId: string,
    params: { page?: number; limit?: number } = {},
  ): Promise<LoyaltyLedger> {
    return this.http.request(`/loyalty/${customerId}${query({ limit: 50, ...params })}`);
  }

  adjustLoyalty(body: { customerId: string; points: number; reason: string }): Promise<unknown> {
    return this.http.request('/loyalty/adjust', { method: 'POST', body });
  }

  // --- Reports ------------------------------------------------------------

  salesReport(params: { from: string; to: string; branchId?: string }): Promise<SalesReport> {
    return this.http.request(`/reports/sales${query(params)}`);
  }
  vatReport(params: { from: string; to: string; branchId?: string }): Promise<VatReport> {
    return this.http.request(`/reports/vat${query(params)}`);
  }
  paymentsReport(params: { from: string; to: string; branchId?: string }): Promise<PaymentsReport> {
    return this.http.request(`/reports/payments${query(params)}`);
  }

  // --- Settlements --------------------------------------------------------

  listSettlements(params: {
    branchId?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<PaginatedMeta<Settlement>> {
    return this.http.request(`/settlements${query({ limit: 25, ...params })}`);
  }

  getSettlement(id: string): Promise<Settlement> {
    return this.http.request(`/settlements/${id}`);
  }

  // --- Drivers ------------------------------------------------------------

  listDrivers(params: {
    isOnline?: boolean;
    isAvailable?: boolean;
    page?: number;
    limit?: number;
  } = {}): Promise<PaginatedMeta<Driver>> {
    return this.http.request(`/drivers${query({ limit: 50, ...params })}`);
  }

  createDriver(body: {
    userId: string;
    vehicleType: VehicleType;
    licenseNumber?: string;
    vehiclePlate?: string;
  }): Promise<Driver> {
    return this.http.request('/drivers', { method: 'POST', body });
  }

  updateDriver(
    id: string,
    body: { vehicleType?: VehicleType; licenseNumber?: string; vehiclePlate?: string },
  ): Promise<Driver> {
    return this.http.request(`/drivers/${id}`, { method: 'PATCH', body });
  }

  deactivateDriver(id: string): Promise<unknown> {
    return this.http.request(`/drivers/${id}/deactivate`, { method: 'POST' });
  }

  // --- Staff users (owner-only) ------------------------------------------

  listUsers(params: {
    q?: string;
    role?: string;
    branchId?: string;
    isActive?: boolean;
    includeDeleted?: boolean;
    page?: number;
    limit?: number;
  } = {}): Promise<PaginatedMeta<StaffUser>> {
    return this.http.request(`/users${query({ limit: 25, ...params })}`);
  }

  getUser(id: string): Promise<StaffUser> {
    return this.http.request(`/users/${id}`);
  }

  createUser(body: {
    email: string;
    password: string;
    fullName: string;
    role?: string;
    branchId?: string;
  }): Promise<StaffUser> {
    return this.http.request('/users', { method: 'POST', body });
  }

  /**
   * `email` is the address the person signs in with. Changing it revokes every
   * live session for that account server-side — they are signed out and must
   * sign in again with the new address.
   */
  updateUser(
    id: string,
    body: { email?: string; fullName?: string; isActive?: boolean },
  ): Promise<StaffUser> {
    return this.http.request(`/users/${id}`, { method: 'PATCH', body });
  }

  resetUserPassword(id: string, password: string): Promise<unknown> {
    return this.http.request(`/users/${id}/reset-password`, { method: 'POST', body: { password } });
  }

  /**
   * Deletes a branch. Needs the operator's own password and the branch code
   * typed back — see the backend's `deleteBranch`.
   *
   * `outcome` says what actually happened: a branch that has traded is
   * ARCHIVED rather than removed, because deleting it would destroy the order
   * and settlement history the restaurant's books are built from. Report what
   * the server says, never what the button said.
   */
  deleteBranch(
    id: string,
    body: { password: string; code: string },
  ): Promise<{ outcome: 'DELETED' | 'ARCHIVED'; branch: Branch; reason: string }> {
    return this.http.request(`/branches/${id}`, { method: 'DELETE', body });
  }

  assignUserRole(id: string, body: { role: string; branchId?: string }): Promise<StaffUser> {
    return this.http.request(`/users/${id}/roles`, { method: 'POST', body });
  }

  revokeUserRole(id: string, userRoleId: string): Promise<StaffUser> {
    return this.http.request(`/users/${id}/roles/${userRoleId}`, { method: 'DELETE' });
  }

  // --- Customer directory -------------------------------------------------

  listCustomers(params: { q?: string; page?: number; limit?: number } = {}): Promise<PaginatedMeta<CustomerListItem>> {
    return this.http.request(`/customers${query({ limit: 25, ...params })}`);
  }

  getCustomer(id: string): Promise<CustomerDetail> {
    return this.http.request(`/customers/${id}`);
  }

  // --- Audit log (owner-only) --------------------------------------------

  listAudit(params: {
    action?: string;
    entityType?: string;
    entityId?: string;
    actorUserId?: string;
    actorCustomerId?: string;
    branchId?: string;
    outcome?: string;
    correlationId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<PaginatedMeta<AuditLogEntry>> {
    return this.http.request(`/audit${query({ limit: 25, ...params })}`);
  }

  // --- Cash-on-delivery reconciliation ------------------------------------

  cashCollections(params: {
    driverId?: string;
    branchId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<CashCollectionsResponse> {
    return this.http.request(`/deliveries/cash-collections${query({ limit: 50, ...params })}`);
  }

  // --- Order edit history -------------------------------------------------

  orderEdits(orderId: string): Promise<OrderEdit[]> {
    return this.http.request(`/orders/${orderId}/edits`);
  }

  // --- Reports: driver performance + dashboard KPIs -----------------------

  driverPerformanceReport(params: { from: string; to: string; branchId?: string }): Promise<DriverPerformanceReport> {
    return this.http.request(`/reports/drivers${query(params)}`);
  }

  dashboardKpis(params: { from: string; to: string; branchId?: string }): Promise<DashboardKpis> {
    return this.http.request(`/reports/dashboard-kpis${query(params)}`);
  }
}
