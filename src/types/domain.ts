export type AppRole = "admin" | "asesor-comasa" | "asesor-retail";

export type AppProfile = {
  id: string;
  fullName: string;
  email: string;
  role: AppRole;
};

export type OfferType =
  | "LINE_ITEM_DISCOUNT"
  | "TIERED_DISCOUNT"
  | "FIXED_QTY_PRICE"
  | "KIT_OFFER";

export type Product = {
  sku: string;
  legacyNumber?: string;
  description: string;
  listPrice: number;
  partNumber?: string;
  maxDiscount?: number;
  taxable: boolean;
};

export type Promotion = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  storeId: string;
  family: "fidelizacion" | "estrategica";
  status: "activa" | "programada" | "vencida";
};

export type OfferRule = {
  id: string;
  promotionId: string;
  promotionName: string;
  startsAt?: string;
  endsAt?: string;
  type: OfferType;
  sku: string;
  segment: string;
  discountPercent?: number;
  fixedPrice?: number;
  minQuantity?: number;
  discountType?: string;
  configurationNote?: string;
};

export type QuoteItem = {
  sku: string;
  quantity: number;
};

export type Customer = {
  customerId: string;
  firstName: string;
  lastName: string;
  orgName?: string;
  displayName: string;
  mobile?: string;
  nationalId?: string;
  segment: string;
  address?: string;
};

export type QuoteLine = QuoteItem & {
  product?: Product;
  unitPrice: number;
  listTotal: number;
  finalTotal: number;
  savings: number;
  appliedOffer?: OfferRule;
  imageUrl: string;
};

export type QuoteSummary = {
  subtotalList: number;
  subtotalFinal: number;
  tax: number;
  totalWithTax: number;
  savings: number;
  lines: QuoteLine[];
};

export type ImportedPromotionRow = {
  offerId: string;
  promotionId: string;
  promotionName: string;
  startsAt: string;
  endsAt: string;
  storeId: string;
  sku: string;
  description: string;
  type: OfferType;
  quantity?: number;
  fixedPrice?: number;
  discountPercent?: number;
  discountType?: string;
  attribute?: string;
  segment: string;
};
