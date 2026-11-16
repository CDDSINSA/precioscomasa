import type {
  AdminQuote,
  AdminQuoteLine,
  Customer,
  QuoteSummary,
} from "../../types/domain";
import { allocationLabel } from "../dealEngine";
import { supabase } from "./client";
import { escapePostgrestPattern } from "./shared";

export type AdminQuoteSearchField = "all" | "quote" | "customer" | "user" | "segment";

export type AdminQuoteSearchFilters = {
  query?: string;
  field?: AdminQuoteSearchField;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};

type IssueQuoteOptions = {
  customer?: Customer | null;
  segment: string;
  comparedSegment?: string;
};

export type IssuedQuote = {
  id: string;
  quoteCode: string;
  quoteNumber: number;
  createdAt: string;
  generatedByName?: string;
  generatedByEmail?: string;
};

type IssueQuoteResult =
  | { ok: true; quote: IssuedQuote }
  | { ok: false; message: string };

type IssuedQuoteRow = {
  quote_id: string;
  quote_code: string;
  quote_number: number | string;
  created_at: string;
  generated_by_name: string | null;
  generated_by_email: string | null;
};

type AdminQuoteLineRow = {
  line_number: number | null;
  sku: string;
  quantity: number | string | null;
  list_price: number | string | null;
  list_total: number | string | null;
  final_total: number | string | null;
  savings: number | string | null;
  product_description: string | null;
  applied_offer_id: string | null;
  applied_promotion_id: string | null;
  applied_promotion_name: string | null;
};

type AdminQuoteRow = {
  id: string;
  quote_number: number | string | null;
  quote_code: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_national_id: string | null;
  original_segment: string;
  compared_segment: string | null;
  subtotal_list: number | string | null;
  subtotal_final: number | string | null;
  tax: number | string | null;
  total_with_tax: number | string | null;
  savings: number | string | null;
  created_by: string | null;
  generated_by_name: string | null;
  generated_by_email: string | null;
  created_at: string;
  quote_lines?: AdminQuoteLineRow[];
};

export async function issueQuote(summary: QuoteSummary, options: IssueQuoteOptions): Promise<IssueQuoteResult> {
  if (summary.pricingError) return { ok: false, message: summary.pricingError };
  if (!supabase) {
    return { ok: false, message: "Supabase no está configurado; no se puede asignar un consecutivo seguro." };
  }

  if (!summary.lines.length) {
    return { ok: false, message: "Agregue al menos un SKU antes de emitir la cotización." };
  }

  const payload = {
    customer: options.customer ? customerQuotePayload(options.customer) : null,
    original_segment: options.segment,
    compared_segment: options.comparedSegment || null,
    subtotal_list: summary.subtotalList,
    subtotal_final: summary.subtotalFinal,
    tax: summary.tax,
    total_with_tax: summary.totalWithTax,
    savings: summary.savings,
    lines: summary.lines.map((line) => ({
      sku: line.sku,
      quantity: line.quantity,
      list_price: line.unitPrice,
      list_total: line.listTotal,
      final_total: line.finalTotal,
      savings: line.savings,
      product_description: line.product?.description ?? null,
      applied_offer_id: line.appliedOffer?.id ?? null,
      applied_promotion_id: line.appliedOffer?.promotionId ?? null,
      applied_promotion_name: allocationLabel(line.allocations) || line.appliedOffer?.promotionName || null,
    })),
  };

  const { data, error } = await supabase.rpc("issue_quote", { payload });
  if (error) return { ok: false, message: error.message };

  const row = Array.isArray(data) ? data[0] as IssuedQuoteRow | undefined : undefined;
  if (!row?.quote_id || !row.quote_code) {
    return { ok: false, message: "La cotización se envió, pero Supabase no devolvió el consecutivo." };
  }

  return {
    ok: true,
    quote: {
      id: row.quote_id,
      quoteCode: row.quote_code,
      quoteNumber: Number(row.quote_number),
      createdAt: row.created_at,
      generatedByName: row.generated_by_name ?? undefined,
      generatedByEmail: row.generated_by_email ?? undefined,
    },
  };
}

export async function searchIssuedQuotes(
  filters: AdminQuoteSearchFilters = {},
): Promise<{ ok: true; quotes: AdminQuote[] } | { ok: false; message: string }> {
  if (!supabase) {
    return { ok: false, message: "Supabase no esta configurado en este entorno." };
  }

  const limit = Math.max(10, Math.min(filters.limit ?? 80, 200));
  const query = filters.query?.trim() ?? "";
  const field = filters.field ?? "all";

  let request: any = supabase
    .from("quotes")
    .select(
      "id,quote_number,quote_code,customer_id,customer_name,customer_phone,customer_national_id,original_segment,compared_segment,subtotal_list,subtotal_final,tax,total_with_tax,savings,created_by,generated_by_name,generated_by_email,created_at,quote_lines(line_number,sku,quantity,list_price,list_total,final_total,savings,product_description,applied_offer_id,applied_promotion_id,applied_promotion_name)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.dateFrom) request = request.gte("created_at", `${filters.dateFrom}T00:00:00`);
  if (filters.dateTo) request = request.lt("created_at", nextDateIso(filters.dateTo));
  if (query) request = applyIssuedQuoteSearch(request, field, query);

  const { data, error } = await request;
  if (error || !data) return { ok: false, message: error?.message ?? "No se pudieron cargar las cotizaciones." };

  return { ok: true, quotes: (data as AdminQuoteRow[]).map(mapAdminQuote) };
}

function mapAdminQuote(row: AdminQuoteRow): AdminQuote {
  const lines = [...(row.quote_lines ?? [])]
    .sort((left, right) => Number(left.line_number ?? 0) - Number(right.line_number ?? 0))
    .map(mapAdminQuoteLine);

  return {
    id: row.id,
    quoteCode: row.quote_code ?? undefined,
    quoteNumber: row.quote_number === null ? undefined : Number(row.quote_number),
    customerId: row.customer_id ?? undefined,
    customerName: row.customer_name ?? undefined,
    customerPhone: row.customer_phone ?? undefined,
    customerNationalId: row.customer_national_id ?? undefined,
    originalSegment: row.original_segment,
    comparedSegment: row.compared_segment ?? undefined,
    subtotalList: Number(row.subtotal_list ?? 0),
    subtotalFinal: Number(row.subtotal_final ?? 0),
    tax: Number(row.tax ?? 0),
    totalWithTax: Number(row.total_with_tax ?? 0),
    savings: Number(row.savings ?? 0),
    createdBy: row.created_by ?? undefined,
    generatedByName: row.generated_by_name ?? undefined,
    generatedByEmail: row.generated_by_email ?? undefined,
    createdAt: row.created_at,
    lines,
  };
}

function mapAdminQuoteLine(row: AdminQuoteLineRow): AdminQuoteLine {
  return {
    lineNumber: Number(row.line_number ?? 0),
    sku: row.sku,
    quantity: Number(row.quantity ?? 0),
    listPrice: Number(row.list_price ?? 0),
    listTotal: Number(row.list_total ?? 0),
    finalTotal: Number(row.final_total ?? 0),
    savings: Number(row.savings ?? 0),
    productDescription: row.product_description ?? undefined,
    appliedOfferId: row.applied_offer_id ?? undefined,
    appliedPromotionId: row.applied_promotion_id ?? undefined,
    appliedPromotionName: row.applied_promotion_name ?? undefined,
  };
}

function customerQuotePayload(customer: Customer) {
  return {
    customer_id: customer.customerId,
    display_name: customer.displayName,
    mobile: customer.mobile ?? null,
    national_id: customer.nationalId ?? null,
    segment: customer.segment,
    address: customer.address ?? null,
  };
}

function applyIssuedQuoteSearch(request: any, field: AdminQuoteSearchField, query: string) {
  const pattern = `%${escapePostgrestPattern(query)}%`;
  const quoteFilters = [`quote_code.ilike.${pattern}`];
  const numericQuote = Number(query);
  if (Number.isInteger(numericQuote) && numericQuote > 0) quoteFilters.push(`quote_number.eq.${numericQuote}`);
  if (isUuid(query)) quoteFilters.push(`id.eq.${query}`);

  if (field === "quote") return quoteFilters.length > 1 ? request.or(quoteFilters.join(",")) : request.ilike("quote_code", pattern);

  const fieldFilters: Record<Exclude<AdminQuoteSearchField, "all" | "quote">, string[]> = {
    customer: [
      `customer_id.ilike.${pattern}`,
      `customer_name.ilike.${pattern}`,
      `customer_phone.ilike.${pattern}`,
      `customer_national_id.ilike.${pattern}`,
    ],
    user: [
      `generated_by_name.ilike.${pattern}`,
      `generated_by_email.ilike.${pattern}`,
    ],
    segment: [
      `original_segment.ilike.${pattern}`,
      `compared_segment.ilike.${pattern}`,
    ],
  };

  if (field !== "all") return request.or(fieldFilters[field].join(","));

  return request.or([
    ...quoteFilters,
    ...fieldFilters.customer,
    ...fieldFilters.user,
    ...fieldFilters.segment,
  ].join(","));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function nextDateIso(value: string) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString();
}
