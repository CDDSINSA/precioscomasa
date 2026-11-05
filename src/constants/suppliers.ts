import type { AppRole, Product } from "../types/domain";

/** Proveedor PEINSA: único proveedor visible para el rol asesor-peinsa. */
export const PEINSA_SUPPLIER_ID = "1022301";

type SupplierFields = {
  supplier?: string | null;
  supplier_id?: string | null;
  supplierId?: string | null;
};

/** Comprueba ambas columnas (supplier y supplier_id) porque la carga escribe las dos. */
export function isPeinsaSupplier(row: SupplierFields) {
  return [row.supplierId, row.supplier_id, row.supplier]
    .some((value) => String(value ?? "").trim() === PEINSA_SUPPLIER_ID);
}

export function isSupplierRestrictedRole(role?: AppRole) {
  return role === "asesor-peinsa";
}

/** Defensa en el cliente; la restricción real la aplica RLS en Supabase. */
export function restrictProductsForRole<T extends SupplierFields>(rows: T[], role?: AppRole): T[] {
  return isSupplierRestrictedRole(role) ? rows.filter(isPeinsaSupplier) : rows;
}

export function productAllowedForRole(product: Product | undefined, role?: AppRole) {
  if (!product) return false;
  return !isSupplierRestrictedRole(role) || isPeinsaSupplier(product);
}
