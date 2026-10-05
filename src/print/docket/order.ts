/**
 * The order shape the docket renderer reads.
 *
 * Narrow on purpose: this is the admin panel's **preview** of a document the
 * Branch POS prints, so it needs the fields the renderer touches and nothing
 * else. Widening it to this app's `OrderDetail` would tie the preview to a
 * screen's type and let the two drift apart in fields the printer never sees.
 */
export interface DocketOrderItemModifier {
  id: string;
  addonName: string;
  quantity: number;
}

export interface DocketOrderItem {
  id: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  modifiers?: DocketOrderItemModifier[];
  lineSubtotalMinor?: number;
  lineTotalMinor?: number;
  unitPriceMinor?: number;
  notes?: string | null;
}

export interface DocketOrder {
  id: string;
  orderNumber: string;
  referenceId?: string;
  type: 'DELIVERY' | 'PICKUP';
  placedAt: string;
  customerNotes: string | null;
  items: DocketOrderItem[];
  branch?: { id: string; code: string; name: string; nameAr: string | null };
  customer?: {
    id: string;
    phone: string;
    fullName: string | null;
    _count?: { orders: number };
  };
  subtotalMinor?: number;
  discountMinor?: number;
  deliveryFeeMinor?: number;
  chargesMinor?: number;
  vatMinor?: number;
  vatRate?: string | number;
  totalMinor: number;
  orderCharges?: { id: string; name: string; totalMinor: number }[];
  coupon?: { id: string; code: string; name: string | null } | null;
  promotion?: { id: string; name: string } | null;
  discounts?: {
    id: string;
    kind: 'COUPON' | 'PROMOTION';
    label: string;
    amountMinor: number;
    appliesToDeliveryFee?: boolean;
  }[];
}
