import type { Product } from "../types/domain";
import { updateStoredDataStatus } from "./dataStatus";

export const imageBaseUrl =
  "https://integration-oic-vtex-bucket.s3.us-east-1.amazonaws.com/B2C-images";

const defaultCatalogUrl =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSK3K3H_iL0iG-LqQt96jLXDly7ru3kCRzlr4our5GcIye1kr-NjBD9alSIsp6c4A/pub?output=tsv";

export const sampleCatalog: Product[] = [
  {
    sku: "100535125",
    legacyNumber: "5605153400",
    description: "CHUPON UNIVERSAL 1-1/2 Y 1-1/4 COFLEX",
    listPrice: 76.6,
    partNumber: "2-P-B9030",
    maxDiscount: 5,
    taxable: true,
  },
  {
    sku: "100634895",
    legacyNumber: "3205428800",
    description: "CAJA DE HERRAMIENTAS/COSMETIQUERA 14 PRETUL",
    listPrice: 373.04,
    partNumber: "25052",
    maxDiscount: 5,
    taxable: true,
  },
  {
    sku: "145617861",
    description: "CINCEL ACANALADO SDS MAX 7/8X16 TRUPER",
    listPrice: 425.22,
    partNumber: "101239",
    maxDiscount: 5,
    taxable: true,
  },
  {
    sku: "136550781",
    description: "SWITCH DE 8 PUERTOS PARA ETHERNET GIGABIT NEXXT",
    listPrice: 1346.96,
    partNumber: "ASBDT084U2",
    taxable: true,
  },
  {
    sku: "152281753",
    description: "JUEGO DE HERRAMIENTAS STANLEY 141 PIEZAS",
    listPrice: 10670,
    partNumber: "STMT98109-LA",
    maxDiscount: 5,
    taxable: true,
  },
  {
    sku: "140862737",
    description: "AURICULARES GAMING DARTH VADER CON MICROFONO PRIMUS",
    listPrice: 1149,
    partNumber: "PHS-SW15",
    taxable: true,
  },
];

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function parseNumber(value: unknown) {
  const normalized = String(value ?? "").replace(/[^\d.,-]/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCatalogTsv(text: string): Product[] {
  const rows = text.trim().split(/\r?\n/).map((line) => line.split("\t"));
  const [headers = [], ...body] = rows;
  const keys = headers.map(normalizeHeader);

  function value(row: string[], names: string[], fallbackIndex: number) {
    const index = keys.findIndex((key) => names.includes(key));
    return row[index >= 0 ? index : fallbackIndex] ?? "";
  }

  return body
    .map((row) => ({
      sku: String(value(row, ["item", "sku", "articulo"], 0)).trim(),
      legacyNumber: String(value(row, ["legacy_number"], 1)).trim(),
      description: String(value(row, ["item_desc", "descripcion", "description"], 3)).trim(),
      listPrice: parseNumber(value(row, ["unit_retail", "precio de lista", "list_price"], 11)),
      partNumber: String(value(row, ["vpn", "numero de parte", "part_number"], 13)).trim(),
      maxDiscount: parseNumber(value(row, ["tienda_desc_max"], 26)) || undefined,
      taxable: String(value(row, ["aplica_impuesto"], 25)).trim().toUpperCase() !== "N",
    }))
    .filter((product) => product.sku && product.description && product.listPrice > 0);
}

export async function loadCatalog() {
  const url = import.meta.env.VITE_CATALOG_TSV_URL || defaultCatalogUrl;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const catalog = parseCatalogTsv(await response.text());
    if (!catalog.length) throw new Error("Catalogo sin filas validas");
    updateStoredDataStatus("master", "ok", `${catalog.length} productos`);
    return catalog;
  } catch {
    updateStoredDataStatus("master", "warning", "Usando respaldo local");
    return sampleCatalog;
  }
}

export function findProduct(catalog: Product[], sku: string) {
  return catalog.find((product) => product.sku === sku.trim());
}

export function searchProducts(catalog: Product[], term: string) {
  const query = term.trim().toLowerCase();
  if (!query) return catalog;

  return catalog.filter((product) =>
    [product.sku, product.description, product.partNumber, product.legacyNumber]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(query)),
  );
}

export function productImageUrl(sku: string) {
  return `${imageBaseUrl}/${sku}-1.jpg`;
}
