import type { AppRole } from "../types/domain";

export const rolePermissions: Record<AppRole, string[]> = {
  admin: ["promotions:import", "promotions:configure", "quotes:create"],
  "asesor-comasa": ["quotes:create", "quotes:compare"],
  "asesor-retail": ["quotes:create"],
};

export function can(role: AppRole, permission: string) {
  return rolePermissions[role].includes(permission);
}
