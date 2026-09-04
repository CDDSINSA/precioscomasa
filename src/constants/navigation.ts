import { ClipboardList, Home, ReceiptText, Settings2, type LucideIcon } from "lucide-react";
import type { AppRole } from "../types/domain";

export type NavItem = {
  path: string;
  label: string;
  icon: LucideIcon;
  roles: AppRole[];
};

export const roles = [
  { id: "admin", label: "Administrativo" },
  { id: "asesor-comasa", label: "Asesor de ventas COMASA" },
  { id: "asesor-retail", label: "Asesor de ventas retail" },
] satisfies { id: AppRole; label: string }[];

export const navigation: NavItem[] = [
  { path: "/", label: "Inicio", icon: Home, roles: ["admin"] },
  {
    path: "/administracion",
    label: "Administración",
    icon: Settings2,
    roles: ["admin"],
  },
  {
    path: "/cotizaciones",
    label: "Gestión de cotizaciones",
    icon: ReceiptText,
    roles: ["admin"],
  },
  {
    path: "/cotizacion",
    label: "Cotización",
    icon: ClipboardList,
    roles: ["admin", "asesor-comasa", "asesor-retail"],
  },
];
