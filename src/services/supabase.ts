export {
  appDb,
  commonDb,
  hasSupabaseConfig,
  loadRemoteDataMetrics,
  refreshRemoteDataStatuses,
  supabase,
  testSupabaseConnection,
  type RemoteDataMetrics,
} from "./supabase/client";

export {
  loadInventoryForSkus,
  loadProductDepartments,
  loadProductsBySkus,
  loadProductsFromSupabase,
  loadStores,
  sampleStores,
  searchProductPageFromSupabase,
  searchProductsFromSupabase,
  syncInventoryToSupabase,
  syncProductsToSupabase,
  syncStoresToSupabase,
  type ProductSearchPage,
} from "./supabase/catalog";

export {
  sampleCustomers,
  searchCustomers,
  syncCustomersToSupabase,
} from "./supabase/customers";

export {
  importPromotionRows,
  importPromotionRowsInBatches,
  loadOfferConfigurationMetrics,
  loadOfferRulesForSkus,
  saveOfferDeal,
  searchOfferConfigurations,
  syncPromotionsToSupabase,
  updateOfferCombinationSetting,
  updateOfferSkuThresholdSetting,
  type OfferConfigurationFilters,
  type OfferConfigurationMetrics,
  type OfferConfigurationRow,
  type PromotionSyncMode,
} from "./supabase/promotions";

export {
  issueQuote,
  searchIssuedQuotes,
  type AdminQuoteSearchField,
  type AdminQuoteSearchFilters,
  type IssuedQuote,
} from "./supabase/quotes";
