export const CUSTOMER_SEGMENTS: readonly string[];
export const CUSTOMER_SEGMENTS_LABEL: string;
export const NO_ALLOWED_CUSTOMERS: string;
export function selectCustomerSegments<T extends { segment?: unknown }>(customers: readonly T[]): {
  accepted: T[];
  excluded: number;
};
export function customerImportMessage(accepted: number, excluded: number): string;
