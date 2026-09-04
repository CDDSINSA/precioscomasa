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

export type ThresholdType = "EXACT" | "MINIMUM";

export type Product = {
  sku: string;
  legacyNumber?: string;
  description: string;
  unitOfMeasure?: string;
  listPrice: number;
  partNumber?: string;
  departmentId?: string;
  maxDiscount?: number;
  taxable: boolean;
};

export type ProductDepartment = {
  departmentId: string;
  departmentName: string;
  divisionId: string;
  divisionName: string;
};

export type StoreLocation = {
  id: string;
  name: string;
};

export type InventoryRecord = {
  storeId: string;
  sku: string;
  quantity: number;
};

export type InventoryStoreStock = {
  storeId: string;
  storeName: string;
  quantity: number;
};

export type ProductInventory = {
  totalQuantity: number;
  stores: InventoryStoreStock[];
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
  ruleId?: string;
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
  thresholdQuantity?: number;
  thresholdType?: ThresholdType;
  allowStacking?: boolean;
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

export type AdminQuoteLine = {
  lineNumber: number;
  sku: string;
  quantity: number;
  listPrice: number;
  listTotal: number;
  finalTotal: number;
  savings: number;
  productDescription?: string;
  appliedOfferId?: string;
  appliedPromotionId?: string;
  appliedPromotionName?: string;
};

export type AdminQuote = {
  id: string;
  quoteCode?: string;
  quoteNumber?: number;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerNationalId?: string;
  originalSegment: string;
  comparedSegment?: string;
  subtotalList: number;
  subtotalFinal: number;
  tax: number;
  totalWithTax: number;
  savings: number;
  createdBy?: string;
  generatedByName?: string;
  generatedByEmail?: string;
  createdAt: string;
  lines: AdminQuoteLine[];
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
