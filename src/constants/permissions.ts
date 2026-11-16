import type { AppRole } from "../types/domain";

export const rolePermissions: Record<AppRole, string[]> = {
  admin: ["promotions:import", "promotions:configure", "quotes:create", "users:manage"],
  "asesor-comasa": ["quotes:create", "quotes:compare"],
  "asesor-retail": ["quotes:create"],
  "asesor-peinsa": ["quotes:create"],
  // Operación: carga y actualiza datos y configura ofertas; en Cotización solo consulta.
  // Sin clientes, sin usuarios, sin gestión de cotizaciones y sin PDF/emisión.
  oper: ["promotions:import", "promotions:configure", "quotes:view"],
};

/** Roles que pueden cargar/actualizar datos maestros desde Administración. */
export function canManageData(role?: AppRole) {
  return role === "admin" || role === "oper";
}

/** Roles que pueden ver y cargar la base de clientes. */
export function canManageCustomers(role?: AppRole) {
  return role === "admin";
}

/** Roles que pueden administrar usuarios. */
export function canManageUsers(role?: AppRole) {
  return role === "admin";
}

/** Roles que pueden emitir cotizaciones o descargar PDF (borrador o final). */
export function canIssueQuotes(role?: AppRole) {
  return Boolean(role) && role !== "oper";
}

export function can(role: AppRole, permission: string) {
  return rolePermissions[role]?.includes(permission) ?? false;
}
