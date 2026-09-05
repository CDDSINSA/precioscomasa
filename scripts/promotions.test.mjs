import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Compile the actual application modules without a browser or a database session.
function loadModule(path, dependencies = {}, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    ...globals,
  }, { filename: path });
  return exports;
}

const pricing = loadModule("../src/services/promotions.ts");
const { promotionSegmentFilter } = loadModule("../src/services/promotionFilters.ts");

test("PostgREST segment filter preserves spaces in the imported universal segment", () => {
  assert.equal(promotionSegmentFilter([" - ", "-", "1002"]), '(" - ","-","1002")');
  assert.equal(promotionSegmentFilter(['a"b', 'a\\b']), '("a\\"b","a\\\\b")');
});
const { buildQuote } = loadModule("../src/services/quote.ts", {
  "./promotions": pricing,
  "./catalog": {
    findProduct: (catalog, sku) => catalog.find(product => product.sku === sku),
    productImageUrl: sku => `test-image/${sku}`,
    sampleCatalog: [],
  },
});
const base = {
  id: "fixed", promotionId: "promo", promotionName: "Test", sku: "test-sku",
  segment: " - ", type: "FIXED_QTY_PRICE", discountType: "OVERRIDE_PRICE",
  fixedPrice: 80, thresholdQuantity: 0, thresholdType: "MINIMUM",
};
const best = (rules, qty = 1, segment = "1002") => pricing.findBestRule(rules, base.sku, segment, qty, 100);

test("fixed unit override competes against percentage discounts in either order", () => {
  const percent = { ...base, id: "percent", type: "LINE_ITEM_DISCOUNT", discountType: "PERCENT_OFF", discountPercent: 10 };
  assert.equal(best([percent, base]).id, "fixed");
  assert.equal(best([base, percent]).id, "fixed");
  assert.equal(best([base, { ...percent, discountPercent: 30 }]).id, "percent");
});

test("zero minimum accepts fractional units and does not fall back to imported quantity", () => {
  assert.equal(best([{ ...base, minQuantity: 5 }], 0.5).id, "fixed");
  assert.equal(pricing.estimateLineTotal(100, 0.5, base), 40);
  for (const qty of [0, -1, NaN, Infinity]) assert.equal(best([base], qty), undefined);
});

test("an override is a unit price even when the rule requires several units", () => {
  const rule = { ...base, thresholdQuantity: 3, minQuantity: 3 };
  assert.equal(best([rule], 2), undefined);
  assert.equal(best([rule], 3).id, "fixed");
  assert.equal(pricing.estimateLineTotal(100, 3, rule), 240);
  assert.equal(pricing.estimateLineTotal(100, 6, rule), 480);
});

test("tiered unit overrides compete without dividing their price by the threshold", () => {
  const rule = { ...base, id: "tier", type: "TIERED_DISCOUNT", thresholdQuantity: 0, minQuantity: 5, fixedPrice: 70 };
  assert.equal(best([rule, base], 4).id, "fixed");
  assert.equal(best([rule, base], 5).id, "tier");
  assert.equal(pricing.estimateLineTotal(100, 5, rule), 350);
});

test("fixed offers with an explicit percentage use that benefit", () => {
  const rule = { ...base, discountType: "PERCENT_OFF", discountPercent: 30 };
  assert.equal(pricing.estimateUnitPrice(100, rule), 70);
});

test("override aliases and whitespace resolve consistently", () => {
  assert.equal(pricing.estimateUnitPrice(100, { ...base, discountType: " price_override " }), 80);
});

test("missing, invalid, equal or more expensive overrides never win", () => {
  for (const fixedPrice of [undefined, NaN, Infinity, -1, 100, 120]) {
    assert.equal(best([{ ...base, fixedPrice }]), undefined);
  }
  assert.equal(best([{ ...base, fixedPrice: 0 }]).id, "fixed");
});

test("a different segment cannot win while universal offers remain eligible", () => {
  assert.equal(best([{ ...base, segment: "1003" }]), undefined);
  assert.equal(best([base], 1, "1003").id, "fixed");
});

test("untyped legacy fixed-quantity bundles retain their existing pricing", () => {
  const rule = { ...base, discountType: undefined, thresholdQuantity: 2, fixedPrice: 150 };
  assert.equal(pricing.estimateLineTotal(100, 2, rule), 150);
});

test("offer preview and quote total use the same best price", () => {
  const group = pricing.availableOfferGroups([base], base.sku, "1002")[0];
  assert.equal(pricing.estimateOfferGroupUnitPrice(100, group), 80);
  const quote = buildQuote([{ sku: base.sku, quantity: 3 }], "1002", [base], [
    { sku: base.sku, description: "Test", listPrice: 100, taxable: true },
  ]);
  assert.equal(quote.lines[0].appliedOffer.id, "fixed");
  assert.equal(quote.subtotalFinal, 240);
  assert.equal(quote.savings, 60);
  assert.equal(quote.tax, 36);
  assert.equal(quote.totalWithTax, 276);
});

test("CSV worker imports Detail change amount as override price, including aliases", async () => {
  for (const discountType of ["OVERRIDE_PRICE", "PRICE_OVERRIDE", "override_price"]) {
    let response;
    const self = { postMessage: value => { response = value; } };
    loadModule("../src/workers/fileParser.worker.ts", { "read-excel-file/web-worker": {} }, { self });
    const csv = [
      "Id de oferta;Id de promo;Articulo;Tipo Oferta;Detail change amount;Selling unit retail;Tipo de Descuento;Segmento",
      `fixed;promo;test-sku;fixed_qty_price;80;100;${discountType};-`,
    ].join("\n");
    await self.onmessage({ data: { id: "test", mode: "promotion", file: { name: "promos.csv", text: async () => csv } } });
    assert.equal(response.ok, true);
    assert.equal(response.result[0].fixedPrice, 80);
    assert.equal(response.result[0].type, "FIXED_QTY_PRICE");
  }
});
