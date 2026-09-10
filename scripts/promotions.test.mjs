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

const configModule = loadModule("../src/services/dealConfig.ts");
const pricing = loadModule("../src/services/promotions.ts", { "./dealConfig": configModule });
const engine = loadModule("../src/services/dealEngine.ts", { "./promotions": pricing, "./dealConfig": configModule });
const { promotionSegmentFilter } = loadModule("../src/services/promotionFilters.ts");

test("PostgREST segment filter preserves spaces in the imported universal segment", () => {
  assert.equal(promotionSegmentFilter([" - ", "-", "1002"]), '(" - ","-","1002")');
  assert.equal(promotionSegmentFilter(['a"b', 'a\\b']), '("a\\"b","a\\\\b")');
});
const { buildQuote } = loadModule("../src/services/quote.ts", {
  "./dealEngine": engine,
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

const catalog = ["A", "B", "C", "D", "E"].map(sku => ({ sku, description: sku, listPrice: 100, taxable: true }));
const rule = (id, changes = {}) => ({ ...base, id, sku: "A", fixedPrice: undefined, type: "LINE_ITEM_DISCOUNT", discountType: "PERCENT_OFF", discountPercent: 10, ...changes });
const pack = (id, quantity, price, changes = {}) => rule(id, { deal: { kind: "PACK", quantity, price }, ...changes });
const quoteFor = (items, rules, segment = "1002", products = catalog, options = {}) => buildQuote(items, segment, rules, products, { today: "2026-09-05", ...options });
const bySku = (summary, sku) => summary.lines.find(line => line.sku === sku);

test("scope: no segment gets universal only; a specific offer does not displace a cheaper universal", () => {
  const offers = [rule("specific", { segment: "1002", discountPercent: 20 }), rule("universal", { discountPercent: 30 })];
  assert.equal(quoteFor([{ sku: "A", quantity: 1 }], offers, "").subtotalFinal, 70);
  assert.equal(quoteFor([{ sku: "A", quantity: 1 }], offers).lines[0].appliedOffer.id, "universal");
  assert.equal(quoteFor([{ sku: "A", quantity: 1 }], [offers[0]], "1003").subtotalFinal, 100);
});

test("twenty units: two eight-unit packages and four units at their best tier", () => {
  const summary = quoteFor([{ sku: "A", quantity: 20 }], [pack("eight", 8, 1000), rule("four", { type: "TIERED_DISCOUNT", minQuantity: 4, discountPercent: 20 }), rule("ten", { discountPercent: 10 })], "1002", [{ ...catalog[0], listPrice: 200 }]);
  assert.equal(summary.pricingError, undefined);
  assert.equal(summary.subtotalFinal, 2640);
  assert.equal(summary.lines[0].allocations.find(b => b.offers.some(r => r.id === "eight")).quantity, 16);
  assert.equal(summary.lines[0].allocations.find(b => b.offers.some(r => r.id === "four")).quantity, 4);
});

test("a whole-quantity tier can beat a package plus leftovers", () => {
  const summary = quoteFor([{ sku: "A", quantity: 20 }], [pack("eight", 8, 500), rule("twenty", { type: "TIERED_DISCOUNT", minQuantity: 20, discountPercent: 45 })]);
  assert.equal(summary.subtotalFinal, 1100);
  assert.equal(summary.lines[0].appliedOffer.id, "twenty");
});

test("global optimum: two 3-unit packs beat the cheapest per-unit 4-unit pack with surplus", () => {
  const summary = quoteFor([{ sku: "A", quantity: 6 }], [pack("four", 4, 200), pack("three", 3, 180)]);
  assert.equal(summary.subtotalFinal, 360);
  assert.equal(summary.lines[0].allocations[0].offers[0].id, "three");
});

test("remainders never requalify a tier using already consumed units", () => {
  const summary = quoteFor([{ sku: "A", quantity: 10 }], [pack("eight", 8, 100), rule("five", { type: "TIERED_DISCOUNT", minQuantity: 5, discountPercent: 50 }), rule("unit", { discountPercent: 10 })]);
  assert.equal(summary.subtotalFinal, 280);
});

test("kits require every SKU in proportion and return surplus to individual offers", () => {
  const kit = rule("kit", { deal: { kind: "KIT", items: [
    { sku: "A", quantity: 2, benefit: { type: "OVERRIDE_PRICE", value: 50 } },
    { sku: "B", quantity: 1, benefit: { type: "PERCENT_OFF", value: 100 } },
  ] } });
  assert.equal(quoteFor([{ sku: "A", quantity: 4 }], [kit]).subtotalFinal, 400);
  const summary = quoteFor([{ sku: "A", quantity: 5 }, { sku: "B", quantity: 2 }], [kit, rule("unit")]);
  assert.equal(summary.subtotalFinal, 290);
  assert.equal(bySku(summary, "B").finalTotal, 0);
  assert.equal(bySku(summary, "A").allocations.reduce((sum, b) => sum + b.quantity, 0), 5);
});

test("legacy kits with four or more SKU without threshold are omitted, while configured or small kits apply", () => {
  // 4 SKUs without threshold/type configured:
  const unconfiguredKits = ["A", "B", "C", "D"].map(sku => rule("legacy-kit", { type: "KIT_OFFER", sku, minQuantity: 1, thresholdQuantity: undefined, thresholdType: undefined, discountPercent: 50 }));
  assert.equal(quoteFor(unconfiguredKits.map(r => ({ sku: r.sku, quantity: 1 })), unconfiguredKits).subtotalFinal, 400);

  // 2 SKUs without threshold/type configured: should apply as 2-SKU kit
  const smallKit = ["A", "B"].map(sku => rule("small-kit", { type: "KIT_OFFER", sku, minQuantity: 1, thresholdQuantity: undefined, thresholdType: undefined, discountPercent: 50 }));
  assert.equal(quoteFor(smallKit.map(r => ({ sku: r.sku, quantity: 1 })), smallKit).subtotalFinal, 100);

  // 4 SKUs WITH threshold configured: should apply
  const configuredKits = ["A", "B", "C", "D"].map(sku => rule("conf-kit", { type: "KIT_OFFER", sku, minQuantity: 1, thresholdQuantity: 1, thresholdType: "EXACT", discountPercent: 50 }));
  assert.equal(quoteFor(configuredKits.map(r => ({ sku: r.sku, quantity: 1 })), configuredKits).subtotalFinal, 200);
});

test("overlapping kits compete across the complete quote, including opportunity cost", () => {
  const kit = (id, skus, discount) => rule(id, { deal: { kind: "KIT", items: skus.map(sku => ({ sku, quantity: 1, benefit: { type: "PERCENT_OFF", value: discount } })) } });
  const summary = quoteFor(["A", "B", "C"].map(sku => ({ sku, quantity: 1 })), [kit("AB", ["A", "B"], 50), kit("AC", ["A", "C"], 60), rule("C-cheap", { sku: "C", discountPercent: 90 })]);
  assert.equal(summary.subtotalFinal, 110); // AB 100 + C 10, versus AC 80 + B 100.
  assert.ok(bySku(summary, "A").allocations.every(b => !b.offers.some(r => r.id === "AC")));
});

test("buy 3 get 1 same SKU consumes four units, repeats and reprices surplus", () => {
  const offer = rule("3plus1", { deal: { kind: "BUY_GET", buySkus: ["A"], buyQuantity: 3, getSkus: ["A"], getQuantity: 1, benefit: { type: "PERCENT_OFF", value: 100 }, discountTriggers: false } });
  assert.equal(quoteFor([{ sku: "A", quantity: 3 }], [offer]).subtotalFinal, 300);
  const summary = quoteFor([{ sku: "A", quantity: 10 }], [offer, rule("unit")]);
  assert.equal(summary.subtotalFinal, 780);
  assert.equal(summary.lines[0].allocations.find(b => b.role === "reward").quantity, 2);
});

test("same-SKU buy 2 get 2 requires the full X+Y group", () => {
  const offer = rule("2plus2", { deal: { kind: "BUY_GET", buySkus: ["A"], buyQuantity: 2, getSkus: ["A"], getQuantity: 2, benefit: { type: "PERCENT_OFF", value: 50 }, discountTriggers: false } });
  assert.equal(quoteFor([{ sku: "A", quantity: 3 }], [offer]).subtotalFinal, 300);
  assert.equal(quoteFor([{ sku: "A", quantity: 4 }], [offer]).subtotalFinal, 300);
});

test("cross-SKU buy/get caps reward at quoted quantity and cannot invent products", () => {
  const offer = rule("cross", { deal: { kind: "BUY_GET", buySkus: ["A"], buyQuantity: 2, getSkus: ["B"], getQuantity: 2, benefit: { type: "PERCENT_OFF", value: 100 }, discountTriggers: false } });
  assert.equal(quoteFor([{ sku: "A", quantity: 2 }], [offer]).subtotalFinal, 200);
  assert.equal(quoteFor([{ sku: "A", quantity: 2 }, { sku: "B", quantity: 1 }], [offer]).subtotalFinal, 200);
  assert.equal(quoteFor([{ sku: "A", quantity: 2 }, { sku: "B", quantity: 3 }], [offer]).subtotalFinal, 300);
});

test("overlapping trigger/reward lists cannot consume the same physical unit twice", () => {
  const offer = rule("overlap", { deal: { kind: "BUY_GET", buySkus: ["A", "B"], buyQuantity: 2, getSkus: ["A", "C"], getQuantity: 1, benefit: { type: "PERCENT_OFF", value: 100 }, discountTriggers: false } });
  assert.equal(quoteFor([{ sku: "A", quantity: 2 }], [offer]).subtotalFinal, 200);
  assert.equal(quoteFor([{ sku: "A", quantity: 3 }], [offer]).subtotalFinal, 200);
});

test("mix-and-match counts mixed units, including repeated SKU, rather than distinct codes", () => {
  const offer = rule("mix", { deal: { kind: "MIX_MATCH", skus: ["A", "B", "C", "D", "E", ...Array.from({ length: 15 }, (_, i) => `other-${i}`)], quantity: 3, benefit: { type: "PERCENT_OFF", value: 50 } } });
  assert.equal(quoteFor([{ sku: "A", quantity: 2 }, { sku: "B", quantity: 1 }], [offer]).subtotalFinal, 150);
  assert.equal(quoteFor([{ sku: "A", quantity: 3 }], [offer]).subtotalFinal, 150);
  assert.equal(quoteFor([{ sku: "A", quantity: 2 }], [offer]).subtotalFinal, 200);
});

test("mixed trigger pool can unlock a reward without buying all eligible SKUs", () => {
  const offer = rule("mix-reward", { deal: { kind: "BUY_GET", buySkus: ["A", "B", "C", "D"], buyQuantity: 3, getSkus: ["E"], getQuantity: 1, benefit: { type: "PERCENT_OFF", value: 100 }, discountTriggers: false } });
  assert.equal(quoteFor([{ sku: "A", quantity: 2 }, { sku: "B", quantity: 1 }, { sku: "E", quantity: 1 }], [offer]).subtotalFinal, 300);
});

test("stacking is multiplicative and allows one non-stackable base promotion", () => {
  const stack = [rule("ten", { allowStacking: true }), rule("five", { discountPercent: 5, allowStacking: true })];
  assert.equal(quoteFor([{ sku: "A", quantity: 1 }], stack).subtotalFinal, 85.5);
  // An exclusive 20% discount combines with stackable 10% and 5% (100 * 0.8 * 0.9 * 0.95 = 68.4):
  assert.equal(quoteFor([{ sku: "A", quantity: 1 }], [...stack, rule("exclusive", { discountPercent: 20 })]).subtotalFinal, 68.4);
  // An offer with allowStacking=true CAN combine with an offer with allowStacking=false:
  assert.equal(quoteFor([{ sku: "A", quantity: 1 }], [stack[0], { ...stack[1], allowStacking: false }]).subtotalFinal, 85.5);
  // Two offers with allowStacking=false CANNOT combine (they compete, best wins):
  assert.equal(quoteFor([{ sku: "A", quantity: 1 }], [{ ...stack[0], allowStacking: false }, { ...stack[1], allowStacking: false }]).subtotalFinal, 90);
  // Between two exclusive offers, the one with bigger discount wins:
  assert.equal(quoteFor([{ sku: "A", quantity: 1 }], [rule("ten-excl", { allowStacking: false }), rule("twenty-excl", { discountPercent: 20, allowStacking: false })]).subtotalFinal, 80);
});

test("fixed override precedes percentages and can stack with a stackable promotion even if override is exclusive", () => {
  const fixed = rule("fixed", { type: "FIXED_QTY_PRICE", discountType: "OVERRIDE_PRICE", fixedPrice: 80, allowStacking: true });
  assert.equal(quoteFor([{ sku: "A", quantity: 1 }], [fixed, rule("ten", { allowStacking: true })]).subtotalFinal, 72);
  // If fixed has allowStacking=false, rule("ten") with allowStacking=true CAN still stack on it:
  assert.equal(quoteFor([{ sku: "A", quantity: 1 }], [{ ...fixed, allowStacking: false }, rule("ten", { allowStacking: true })]).subtotalFinal, 72);
  // If BOTH have allowStacking=false, they cannot combine (80 fixed beats 90 percentage):
  assert.equal(quoteFor([{ sku: "A", quantity: 1 }], [{ ...fixed, allowStacking: false }, rule("ten", { allowStacking: false })]).subtotalFinal, 80);
});

test("the same offer's duplicate rows or tiers never stack twice", () => {
  const offers = [rule("tier", { type: "TIERED_DISCOUNT", allowStacking: true, minQuantity: 1 }), rule("tier", { type: "TIERED_DISCOUNT", allowStacking: true, minQuantity: 2, discountPercent: 20 })];
  assert.equal(quoteFor([{ sku: "A", quantity: 2 }], [...offers, ...offers]).subtotalFinal, 160);
});

test("buy/get trigger discounts allow stacking if at least one offer allows stacking", () => {
  const offer = rule("cross", { allowStacking: true, deal: { kind: "BUY_GET", buySkus: ["A"], buyQuantity: 2, getSkus: ["B"], getQuantity: 1, benefit: { type: "PERCENT_OFF", value: 100 }, discountTriggers: true } });
  const items = [{ sku: "A", quantity: 2 }, { sku: "B", quantity: 1 }];
  assert.equal(quoteFor(items, [offer, rule("ten", { allowStacking: true })]).subtotalFinal, 180);
  assert.equal(quoteFor(items, [offer, rule("ten", { allowStacking: false })]).subtotalFinal, 180);
  assert.equal(quoteFor(items, [{ ...offer, allowStacking: false }, rule("ten", { allowStacking: false })]).subtotalFinal, 200);
});

test("tie breaks by segment, override then earliest expiration regardless of input order", () => {
  const universal = rule("universal", { discountPercent: 20, endsAt: "2026-09-06" });
  const specific = rule("specific", { discountPercent: 20, segment: "1002", endsAt: "2026-09-30" });
  const fixed = rule("fixed", { type: "FIXED_QTY_PRICE", discountType: "OVERRIDE_PRICE", fixedPrice: 80, segment: "1002", endsAt: "2026-09-30" });
  const earlier = { ...fixed, id: "earlier", endsAt: "2026-09-10" };
  const items = [{ sku: "A", quantity: 1 }];
  assert.equal(quoteFor(items, [universal, specific]).lines[0].appliedOffer.id, "specific");
  assert.equal(quoteFor(items, [specific, fixed]).lines[0].appliedOffer.id, "fixed");
  for (const candidates of [[earlier, universal, fixed, specific], [specific, fixed, universal, earlier]]) assert.equal(quoteFor(items, candidates).lines[0].appliedOffer.id, "earlier");
});

test("equal payable cents prefer an override over a fractional-cent percentage result", () => {
  const percent = rule("percent", { discountPercent: 25 });
  const fixed = rule("fixed", { discountType: "OVERRIDE_PRICE", fixedPrice: 299.35 });
  const summary = quoteFor([{ sku: "A", quantity: 1 }], [percent, fixed], "1002", [{ ...catalog[0], listPrice: 399.13 }]);
  assert.equal(summary.subtotalFinal, 299.35);
  assert.equal(summary.lines[0].appliedOffer.id, "fixed");
});

test("duplicate quote lines pool quantity but preserve line allocations and totals", () => {
  const summary = quoteFor([{ sku: "A", quantity: 2 }, { sku: "A", quantity: 2 }], [pack("four", 4, 150)]);
  assert.equal(summary.subtotalFinal, 150);
  assert.equal(summary.lines.length, 2);
  assert.equal(summary.lines.reduce((sum, line) => sum + line.allocations.reduce((n, b) => n + b.quantity, 0), 0), 4);
  assert.equal(summary.totalWithTax, 172.5);
});

test("dates apply before optimization and include the last day", () => {
  const items = [{ sku: "A", quantity: 1 }];
  assert.equal(quoteFor(items, [rule("future", { startsAt: "2026-09-06" }), rule("past", { endsAt: "2026-09-04" })]).subtotalFinal, 100);
  assert.equal(quoteFor(items, [rule("lastday", { endsAt: "2026-09-05" })]).subtotalFinal, 90);
});

test("fractional package remainder is priced separately without negative/free extra units", () => {
  const summary = quoteFor([{ sku: "A", quantity: 2.5 }], [pack("two", 2, 100), rule("ten")]);
  assert.equal(summary.subtotalFinal, 145);
  assert.equal(summary.lines[0].allocations.reduce((sum, b) => sum + b.quantity, 0), 2.5);
});

test("an exact-search budget failure is explicit and cannot masquerade as best pricing", () => {
  const summary = quoteFor([{ sku: "A", quantity: 10 }], [pack("two", 2, 100)], "1002", catalog, { maxTransitions: 1 });
  assert.ok(summary.pricingError);
});

test("a default threshold of one cannot erase an imported tier minimum", () => {
  const offer = rule("tier", { type: "TIERED_DISCOUNT", minQuantity: 8, thresholdQuantity: 1, discountPercent: 50 });
  assert.equal(quoteFor([{ sku: "A", quantity: 7 }], [offer]).subtotalFinal, 700);
  assert.equal(quoteFor([{ sku: "A", quantity: 8 }], [offer]).subtotalFinal, 400);
});

test("a stacked tier can qualify over repeated identical packages", () => {
  const offers = [pack("four", 4, 200, { allowStacking: true }), rule("eight", { type: "TIERED_DISCOUNT", minQuantity: 8, discountPercent: 10, allowStacking: true })];
  assert.equal(quoteFor([{ sku: "A", quantity: 8 }], offers).subtotalFinal, 360);
});

test("a reward percentage stacks after an eligible target unit override", () => {
  const offer = rule("reward", { allowStacking: true, deal: { kind: "BUY_GET", buySkus: ["A"], buyQuantity: 1, getSkus: ["B"], getQuantity: 1, benefit: { type: "PERCENT_OFF", value: 50 }, discountTriggers: false } });
  const fixed = rule("fixedB", { sku: "B", discountType: "OVERRIDE_PRICE", fixedPrice: 80, allowStacking: true });
  assert.equal(quoteFor([{ sku: "A", quantity: 1 }, { sku: "B", quantity: 1 }], [offer, fixed]).subtotalFinal, 140);
});

test("invalid quantities block pricing rather than silently dropping a line", () => {
  for (const quantity of [0, -1, NaN, Infinity, 0.0000001]) assert.ok(quoteFor([{ sku: "A", quantity }], []).pricingError);
});

test("invalid deal definitions are rejected before the allocation search", () => {
  for (const value of [{ kind: "PACK", quantity: 0, price: 10 }, { kind: "PACK", quantity: 0.0000001, price: 10 }, { kind: "MIX_MATCH", skus: ["A", "A"], quantity: 3, benefit: { type: "PERCENT_OFF", value: 50 } }]) assert.throws(() => configModule.validateDealConfig(value));
});

test("all pages are read even if the server caps a page below the requested size", async () => {
  const { readPromotionPages } = loadModule("../src/services/readPromotionPages.ts");
  const input = Array.from({ length: 7 }, (_, i) => i);
  const result = await readPromotionPages(async from => ({ data: input.slice(from, from + 2), error: null }));
  assert.deepEqual([...result], input);
  await assert.rejects(readPromotionPages(async () => ({ data: null, error: { message: "connection lost" } })), /connection lost/);
});

test("the original live SKU keeps its universal unit override", () => {
  const fixed = rule("50369", { sku: "160292022", type: "FIXED_QTY_PRICE", fixedPrice: 299.35, discountType: "OVERRIDE_PRICE", startsAt: "2026-09-03", endsAt: "2026-09-30" });
  const summary = quoteFor([{ sku: fixed.sku, quantity: 1 }], [fixed], "", [{ ...catalog[0], sku: fixed.sku, listPrice: 399.13 }]);
  assert.equal(summary.subtotalFinal, 299.35);
  assert.equal(summary.savings, 99.78);
  assert.equal(summary.totalWithTax, 344.25);
});

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

test("quote fallback: unallocated remainder or calculation error safely charges list price, never C$ 0", () => {
  // If pricing throws, quote falls back to list price
  const summary = quoteFor([{ sku: "A", quantity: 3 }], [pack("bundle", 2, 100)], "1002", catalog, { maxTransitions: 0 });
  assert.ok(summary.pricingError);
  assert.equal(summary.subtotalFinal, 300);
  assert.equal(summary.savings, 0);
  assert.equal(summary.lines[0].finalTotal, 300);
  assert.equal(summary.lines[0].allocations[0].role, "regular");
});

test("4-SKU kit configured via deal (configuraciones adicionales) applies even without threshold", () => {
  const customKit = rule("custom-4kit", {
    deal: {
      kind: "KIT",
      items: ["A", "B", "C", "D"].map(sku => ({ sku, quantity: 1, benefit: { type: "PERCENT_OFF", value: 40 } })),
    },
  });
  const summary = quoteFor(["A", "B", "C", "D"].map(sku => ({ sku, quantity: 1 })), [customKit]);
  assert.equal(summary.subtotalFinal, 240);
  assert.equal(summary.savings, 160);
});

test("isUniversalSegment recognizes universal segment identifiers and excludes specific segments", () => {
  assert.equal(pricing.isUniversalSegment(" - "), true);
  assert.equal(pricing.isUniversalSegment("-"), true);
  assert.equal(pricing.isUniversalSegment(""), true);
  assert.equal(pricing.isUniversalSegment("Todos los segmentos"), true);
  assert.equal(pricing.isUniversalSegment("Universal"), true);
  assert.equal(pricing.isUniversalSegment("1002"), false);
  assert.equal(pricing.isUniversalSegment("1003"), false);
  assert.equal(pricing.isUniversalSegment("1105"), false);
});

test("availableOfferGroups includes universal offers and client segment offers only, strictly excluding others", () => {
  const universal = rule("universal-rule", { sku: "SKU-TEST", segment: " - ", discountPercent: 10 });
  const segment1002 = rule("seg-1002-rule", { sku: "SKU-TEST", segment: "1002", discountPercent: 20 });
  const segment1003 = rule("seg-1003-rule", { sku: "SKU-TEST", segment: "1003", discountPercent: 25 });
  const allRules = [universal, segment1002, segment1003];

  // For customer with segment 1002:
  const groups1002 = pricing.availableOfferGroups(allRules, "SKU-TEST", "1002");
  const ids1002 = groups1002.map((g) => g.primary.id);
  assert.ok(ids1002.includes("universal-rule"), "Must include universal offer");
  assert.ok(ids1002.includes("seg-1002-rule"), "Must include client segment 1002 offer");
  assert.ok(!ids1002.includes("seg-1003-rule"), "Must NOT include segment 1003 offer");

  // For customer with segment 1003:
  const groups1003 = pricing.availableOfferGroups(allRules, "SKU-TEST", "1003");
  const ids1003 = groups1003.map((g) => g.primary.id);
  assert.ok(ids1003.includes("universal-rule"), "Must include universal offer");
  assert.ok(ids1003.includes("seg-1003-rule"), "Must include client segment 1003 offer");
  assert.ok(!ids1003.includes("seg-1002-rule"), "Must NOT include segment 1002 offer");

  // For customer with segment 1105 (where no specific offer exists):
  const groups1105 = pricing.availableOfferGroups(allRules, "SKU-TEST", "1105");
  const ids1105 = groups1105.map((g) => g.primary.id);
  assert.ok(ids1105.includes("universal-rule"), "Must include universal offer");
  assert.ok(!ids1105.includes("seg-1002-rule"), "Must NOT include 1002 offer");
  assert.ok(!ids1105.includes("seg-1003-rule"), "Must NOT include 1003 offer");
  assert.equal(ids1105.length, 1);
});

test("tiered discount threshold qualification and preview ranking by quantity", () => {
  const tier200 = rule("tier-200", {
    sku: "GYPSUM",
    type: "TIERED_DISCOUNT",
    discountType: "OVERRIDE_PRICE",
    fixedPrice: 325,
    minQuantity: 200,
  });
  const tier100 = rule("tier-100", {
    sku: "GYPSUM",
    type: "TIERED_DISCOUNT",
    discountType: "OVERRIDE_PRICE",
    fixedPrice: 330,
    minQuantity: 100,
  });
  const unitPromo = rule("unit-promo", {
    sku: "GYPSUM",
    discountPercent: 5,
    minQuantity: 1,
  });

  const allGypsumRules = [tier200, tier100, unitPromo];
  const listPrice = 390.43;

  // ruleMatchesQuantity tests
  assert.equal(pricing.ruleMatchesQuantity(tier200, 1), false);
  assert.equal(pricing.ruleMatchesQuantity(tier100, 1), false);
  assert.equal(pricing.ruleMatchesQuantity(unitPromo, 1), true);
  assert.equal(pricing.ruleMatchesQuantity(tier100, 100), true);
  assert.equal(pricing.ruleMatchesQuantity(tier200, 100), false);
  assert.equal(pricing.ruleMatchesQuantity(tier200, 200), true);

  // sortOfferGroupsByUnitPrice with quantity = 1:
  // unitPromo (applies: true) must come BEFORE tier200 and tier100 (applies: false)
  const groups = pricing.availableOfferGroups(allGypsumRules, "GYPSUM", "1002");
  const sortedQty1 = pricing.sortOfferGroupsByUnitPrice(groups, listPrice, 1);
  assert.equal(sortedQty1[0].primary.id, "unit-promo");

  // sortOfferGroupsByUnitPrice with quantity = 200:
  // tier200 (applies: true, price 325) must beat tier100 (price 330) and unitPromo (price 370.91)
  const sortedQty200 = pricing.sortOfferGroupsByUnitPrice(groups, listPrice, 200);
  assert.equal(sortedQty200[0].primary.id, "tier-200");

  // Quote integration test with SKU 101031543-like rules:
  const gypsumCatalog = [{ sku: "GYPSUM", description: "Gypsum", listPrice: 390.43, taxable: true }];

  // 1 unit with only tiered discounts (no unitPromo):
  const quote1 = quoteFor([{ sku: "GYPSUM", quantity: 1 }], [tier200, tier100], "1002", gypsumCatalog);
  assert.equal(quote1.subtotalFinal, 390.43);
  assert.equal(quote1.lines[0].appliedOffer, undefined);
  assert.equal(quote1.lines[0].savings, 0);

  // 100 units:
  const quote100 = quoteFor([{ sku: "GYPSUM", quantity: 100 }], [tier200, tier100], "1002", gypsumCatalog);
  assert.equal(quote100.subtotalFinal, 33000);
  assert.equal(quote100.lines[0].appliedOffer.id, "tier-100");

  // 200 units:
  const quote200 = quoteFor([{ sku: "GYPSUM", quantity: 200 }], [tier200, tier100], "1002", gypsumCatalog);
  assert.equal(quote200.subtotalFinal, 65000);
  assert.equal(quote200.lines[0].appliedOffer.id, "tier-200");
});

test("estimateKitTotals correctly calculates kit total price and kit savings", () => {
  const kitCatalog = [
    { sku: "LOCK", description: "Cerradura", listPrice: 250, taxable: true },
    { sku: "COMPANION", description: "Complemento", listPrice: 307.83, taxable: true },
  ];

  const lockRule = {
    id: "48698",
    promotionId: "PROMO_KIT",
    promotionName: "KIT HERR",
    type: "KIT_OFFER",
    sku: "LOCK",
    segment: "1002",
    discountPercent: 100,
    minQuantity: 1,
  };

  const companionRule = {
    id: "48698",
    promotionId: "PROMO_KIT",
    promotionName: "KIT HERR",
    type: "KIT_OFFER",
    sku: "COMPANION",
    segment: "1002",
    fixedPrice: 307.83,
    minQuantity: 1,
  };

  const kitGroup = {
    key: "KIT_48698",
    primary: lockRule,
    rules: [lockRule, companionRule],
    isKit: true,
    skuCount: 2,
  };

  // 1 kit:
  // List total = 250 + 307.83 = 557.83
  // Final total = 0 + 307.83 = 307.83
  // Savings = 250.00
  const totals1 = pricing.estimateKitTotals(kitGroup, kitCatalog, 1);
  assert.equal(totals1.totalList, 557.83);
  assert.equal(totals1.totalFinal, 307.83);
  assert.equal(totals1.savings, 250.0);

  // 2 kits:
  // List total = 557.83 * 2 = 1115.66
  // Final total = 307.83 * 2 = 615.66
  // Savings = 500.00
  const totals2 = pricing.estimateKitTotals(kitGroup, kitCatalog, 2);
  assert.equal(totals2.totalList, 1115.66);
  assert.equal(totals2.totalFinal, 615.66);
  assert.equal(totals2.savings, 500.0);
});

test("buildQuote groups kit companion items together even if added at separate positions", () => {
  const kitRuleA = rule("kit-48698", {
    promotionId: "PROMO_48698",
    type: "KIT_OFFER",
    sku: "LOCK",
    discountPercent: 100,
    minQuantity: 1,
  });
  const kitRuleB = rule("kit-48698", {
    promotionId: "PROMO_48698",
    type: "KIT_OFFER",
    sku: "HANDLE",
    fixedPrice: 300,
    minQuantity: 1,
  });

  const testCatalog = [
    { sku: "LOCK", description: "Cerradura", listPrice: 250, taxable: true },
    { sku: "GYPSUM", description: "Gypsum", listPrice: 400, taxable: true },
    { sku: "PAINT", description: "Pintura", listPrice: 150, taxable: true },
    { sku: "HANDLE", description: "Manija", listPrice: 350, taxable: true },
  ];

  // Items added separated: LOCK at index 0, then GYPSUM, then PAINT, and HANDLE at index 3:
  const items = [
    { sku: "LOCK", quantity: 1 },
    { sku: "GYPSUM", quantity: 1 },
    { sku: "PAINT", quantity: 1 },
    { sku: "HANDLE", quantity: 1 },
  ];

  const summary = quoteFor(items, [kitRuleA, kitRuleB], "1002", testCatalog);

  // In the resulting summary.lines, LOCK and HANDLE must be consecutive (positions 0 and 1)!
  assert.equal(summary.lines[0].sku, "LOCK");
  assert.equal(summary.lines[1].sku, "HANDLE");
  assert.equal(summary.lines[2].sku, "GYPSUM");
  assert.equal(summary.lines[3].sku, "PAINT");

  // And itemIndex must be preserved:
  assert.equal(summary.lines[0].itemIndex, 0); // LOCK was items[0]
  assert.equal(summary.lines[1].itemIndex, 3); // HANDLE was items[3]
  assert.equal(summary.lines[2].itemIndex, 1); // GYPSUM was items[1]
  assert.equal(summary.lines[3].itemIndex, 2); // PAINT was items[2]
});
