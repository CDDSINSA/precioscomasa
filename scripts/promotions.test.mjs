import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

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

test("offer cards load all distinct totals across capped pages taking over 30 seconds in total", async () => {
  const source = readFileSync(new URL("../src/services/supabase.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("supabase.ts", source, ts.ScriptTarget.ES2022, true);
  const loader = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "loadOfferConfigurationMetrics");
  assert.ok(loader);
  const input = Array.from({ length: 157 }, (_, i) => ({ id: String(i).padStart(4, "0"), external_offer_id: `offer-${i % 29}`, sku: `sku-${i}`, allow_stacking: i === 0 }));
  input.push({ ...input[0], id: "0157" }, { ...input[1], id: "0158" });
  const cursors = [];
  let elapsed = 0;
  const deadlines = [];
  const client = createClient("https://test.supabase.co", "test-key", {
    accessToken: async () => "test-token",
    global: { fetch: async (url, options) => {
      const params = new URL(url).searchParams;
      assert.equal(params.get("select"), "id,external_offer_id,sku,allow_stacking");
      assert.equal(params.get("is_active"), "eq.true");
      assert.equal(params.get("order"), "id.asc");
      assert.equal(params.has("offset"), false);
      assert.equal(new Headers(options.headers).get("Prefer")?.includes("count=exact") ?? false, false);
      const cursor = params.get("id");
      cursors.push(cursor);
      // Each request takes 20 simulated seconds, while the full read takes 60.
      elapsed += 20000;
      deadlines.forEach(timer => { if (timer.at <= elapsed) timer.controller.abort(); });
      options.signal.throwIfAborted();
      const page = input.filter(row => !cursor || row.id > cursor.slice(3)).slice(0, 80);
      return new Response(JSON.stringify(page), { status: 200, headers: { "Content-Type": "application/json" } });
    } },
  });
  const exports = {};
  vm.runInNewContext(ts.transpileModule(loader.getText(ast), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, supabase: client,
    AbortSignal: {
      any: signals => AbortSignal.any(signals),
      timeout(ms) {
        const controller = new AbortController();
        deadlines.push({ at: elapsed + ms, controller });
        return controller.signal;
      },
    },
  });
  const metrics = await exports.loadOfferConfigurationMetrics();
  assert.equal(metrics.offers, 29);
  assert.equal(metrics.offerSkus, 157);
  assert.equal(metrics.combinable, 1);
  assert.deepEqual(cursors, [null, "gt.0079", "gt.0158"]);
  assert.equal(elapsed, 60000);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(exports.loadOfferConfigurationMetrics(cancelled.signal), /abort/i);
  assert.equal(cursors.length, 3, "A cancelled refresh must not start another request");
});

test("opening offer settings refreshes cards without launching a search", () => {
  const source = readFileSync(new URL("../src/features/admin/AdminPage.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("AdminPage.tsx", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  let effect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect" && node.arguments[0]?.getText(ast).includes('activeLoad !== "offer-settings"')) effect = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(effect);
  let refreshed = 0;
  const run = vm.runInNewContext(`(${ts.transpileModule(effect.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.trim().replace(/;$/, "")})`, {
    activeLoad: "offer-settings", AbortController,
    window: { setTimeout: () => assert.fail("Do not cancel the entire background read with one timer"), clearTimeout: () => {} },
    setOfferMetricsLoading: () => {}, setOfferMetricsError: () => {}, setOfferMetrics: () => {},
    loadOfferConfigurationRows: () => assert.fail("Entering the section must not search"),
    setOfferConfigLoading: () => assert.fail("Cards must not change the search button state"),
    loadOfferConfigurationMetrics: async () => { refreshed++; return { offers: 29, offerSkus: 157, combinable: 0 }; },
  });
  const cleanup = run();
  assert.equal(refreshed, 1);
  cleanup();
});

test("offer configuration button leaves its loading state after a search error", async () => {
  const source = readFileSync(new URL("../src/features/admin/AdminPage.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("AdminPage.tsx", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  let load;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "loadOfferConfigurationRows") load = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(load);
  for (const rejects of [false, true]) {
    const loading = [];
    const messages = [];
    const context = {
      Error, offerConfigFilters: {}, setOfferConfigLoading: value => loading.push(value),
      setMessage: value => messages.push(value),
      setOfferConfigRows: () => assert.fail("A failed search must preserve the current rows"),
      searchOfferConfigurations: async () => {
        if (rejects) throw new Error("connection lost");
        return { ok: false, message: "connection lost" };
      },
    };
    vm.createContext(context);
    vm.runInContext(ts.transpileModule(load.getText(ast), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText, context);
    await context.loadOfferConfigurationRows();
    assert.deepEqual(loading, [true, false]);
    assert.deepEqual(messages, ["connection lost"]);
  }
});

test("offer configuration search returns all 157 rows even with a smaller server page cap", async () => {
  const source = readFileSync(new URL("../src/services/supabase.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("supabase.ts", source, ts.ScriptTarget.ES2022, true);
  const search = ast.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === "searchOfferConfigurations");
  assert.ok(search);
  const input = Array.from({ length: 157 }, (_, index) => ({
    id: `rule-${index}`, external_offer_id: `offer-${index}`, promotion_id: "promo", sku: `sku-${index}`, segment: " - ",
  }));
  const ranges = [];
  const filters = [];
  const orders = [];
  let fail = false;
  const request = {
    select() { return this; },
    eq(...args) { filters.push(args); return this; },
    ilike(...args) { filters.push(args); return this; },
    order(column) { orders.push(column); return this; },
    range(from, to) {
      ranges.push([from, to]);
      return { abortSignal: async () => fail ? { data: null, error: { message: "connection lost" } }
        : { data: input.slice(from, Math.min(to + 1, from + 80)), error: null, count: input.length } };
    },
  };
  const exports = {};
  const pagingSource = readFileSync(new URL("../src/services/readPromotionPages.ts", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(`${pagingSource}\n${search.getText(ast)}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, supabase: { from: () => ({ ...request }) }, AbortSignal,
    escapePostgrestPattern: value => value,
    unique: values => [...new Set(values)],
    loadPromotionMapByIds: async () => new Map([["promo", {}]]),
    readDealSettings: async () => [], readOfferDetails: async () => [],
    fetchKitCompanionRows: async () => [], mapOfferRules: () => [],
    applyOfferDetails: rules => rules, mapOfferConfigurationRows: rows => rows,
  });
  const result = await exports.searchOfferConfigurations({ promotionId: "promo", offerId: "offer", sku: "sku" });
  assert.equal(result.ok, true);
  assert.equal(result.rows.length, 157);
  assert.deepEqual(Array.from(result.rows, row => row.id), input.map(row => row.id));
  assert.deepEqual(ranges.map(([from]) => from), [0, 80]);
  assert.deepEqual(orders, ["promotion_id", "id", "promotion_id", "id"]);
  const pageFilters = [["is_active", true], ["promotion_id", "%promo%"], ["external_offer_id", "%offer%"], ["sku", "sku"]];
  assert.deepEqual(filters, [...pageFilters, ...pageFilters]);
  fail = true;
  const failure = await exports.searchOfferConfigurations({});
  assert.equal(failure.ok, false);
  assert.match(failure.message, /connection lost/);
});

const detailModule = loadModule("../src/services/offerConfiguration.ts");
const pricing = loadModule("../src/services/promotions.ts", { "./dealConfig": configModule });
const kitSets = loadModule("../src/services/kitSets.ts");
const engine = loadModule("../src/services/dealEngine.ts", { "./promotions": pricing, "./dealConfig": configModule, "./kitSets": kitSets });
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
  const kit = rule("kit", { deal: { kind: "KIT", sets: [
    { id: "1", skus: ["A"], quantity: 2, thresholdType: "EXACT", benefit: { type: "OVERRIDE_PRICE", value: 50 } },
    { id: "2", skus: ["B"], quantity: 1, thresholdType: "EXACT", benefit: { type: "PERCENT_OFF", value: 100 } },
  ] } });
  assert.equal(quoteFor([{ sku: "A", quantity: 4 }], [kit]).subtotalFinal, 400);
  const summary = quoteFor([{ sku: "A", quantity: 5 }, { sku: "B", quantity: 2 }], [kit, rule("unit")]);
  assert.equal(summary.subtotalFinal, 290);
  assert.equal(bySku(summary, "B").finalTotal, 0);
  assert.equal(bySku(summary, "A").allocations.reduce((sum, b) => sum + b.quantity, 0), 5);
});

test("imported kits of every size remain pending even with SKU thresholds", () => {
  for (const size of [1, 2, 4, 5]) {
    const rules = catalog.slice(0, size).map(p => rule("pending", { type: "KIT_OFFER", sku: p.sku, thresholdQuantity: 1, thresholdType: "EXACT", discountPercent: 100 }));
    const summary = quoteFor(rules.map(r => ({ sku: r.sku, quantity: 1 })), rules);
    assert.equal(summary.pricingError, undefined);
    assert.equal(summary.subtotalFinal, size * 100);
    assert.equal(pricing.availableOfferGroups(rules, "A", "1002").length, 0);
  }
});

test("overlapping kits compete across the complete quote, including opportunity cost", () => {
  const kit = (id, skus, discount) => rule(id, { deal: { kind: "KIT", sets: skus.map(sku => ({ id: sku, skus: [sku], quantity: 1, thresholdType: "EXACT", benefit: { type: "PERCENT_OFF", value: discount } })) } });
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
    loadModule("../src/workers/fileParser.worker.ts", { "read-excel-file/web-worker": {}, xlsx: {}, "../services/offerConfiguration": loadModule("../src/services/offerConfiguration.ts") }, { self });
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
      sets: ["A", "B", "C", "D"].map(sku => ({ id: sku, skus: [sku], quantity: 1, thresholdType: "EXACT", benefit: { type: "PERCENT_OFF", value: 40 } })),
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

  const deal = { kind: "KIT", sets: [
    { id: "1", skus: ["LOCK"], quantity: 1, thresholdType: "EXACT", benefit: { type: "PERCENT_OFF", value: 100 } },
    { id: "2", skus: ["HANDLE"], quantity: 1, thresholdType: "EXACT", benefit: { type: "OVERRIDE_PRICE", value: 300 } },
  ] };
  const summary = quoteFor(items, [{ ...kitRuleA, deal }, { ...kitRuleB, deal }], "1002", testCatalog);

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

test("pending legacy kits cannot appear as an automatic offer even with trimmed SKUs", () => {
  const rules = ["A   ", "B   "].map(sku => rule("pending", { type: "KIT_OFFER", sku }));
  assert.equal(pricing.availableOfferGroups(rules, "A", "1002").length, 0);
});

const setOf = (id, skus, quantity, thresholdType = "EXACT", benefit) => ({ id, skus, quantity, thresholdType, ...(benefit ? { benefit } : {}) });
const percent = value => ({ type: "PERCENT_OFF", value });
const setKit = (sets, changes = {}) => rule("23456", { type: "KIT_OFFER", deal: { kind: "KIT", sets }, ...changes });

test("SET alternatives: three mixed purchases and two gifts require both complete SETs", () => {
  const kit = setKit([setOf("1", ["A", "B", "C"], 3), setOf("2", ["D"], 2, "EXACT", percent(100))]);
  for (const purchases of [[{ sku: "A", quantity: 3 }], [{ sku: "A", quantity: 1 }, { sku: "C", quantity: 2 }], ["A", "B", "C"].map(sku => ({ sku, quantity: 1 }))]) {
    const summary = quoteFor([...purchases, { sku: "D", quantity: 2 }], [kit]);
    assert.equal(summary.pricingError, undefined);
    assert.equal(summary.subtotalFinal, 300);
    assert.equal(bySku(summary, "D").allocations[0].kitSet, "2");
  }
  assert.equal(quoteFor([{ sku: "A", quantity: 3 }, { sku: "D", quantity: 1 }], [kit]).subtotalFinal, 400);
  assert.equal(quoteFor([{ sku: "A", quantity: 2 }, { sku: "D", quantity: 3 }], [kit]).subtotalFinal, 500);
});

test("exact 18 of 20 reprices only the two leftovers with a qualifying offer", () => {
  const kit = setKit([setOf("1", ["A"], 18, "EXACT", percent(50))]);
  const offers = [kit, rule("two", { minQuantity: 2, discountPercent: 20 }), rule("five", { minQuantity: 5, discountPercent: 15 })];
  const summary = quoteFor([{ sku: "A", quantity: 20 }], offers);
  assert.equal(summary.subtotalFinal, 1060);
  const allocations = summary.lines[0].allocations;
  assert.equal(allocations.find(a => a.kitSet === "1").quantity, 18);
  assert.equal(allocations.find(a => a.offers.some(o => o.id === "two")).quantity, 2);
  assert.ok(allocations.every(a => !a.offers.some(o => o.id === "five")));
});

test("minimum 30 benefits all 50 units but never 29", () => {
  const kit = setKit([setOf("1", ["A"], 30, "MINIMUM", percent(10))]);
  for (const [quantity, expected] of [[29, 2900], [30, 2700], [50, 4500]]) {
    const summary = quoteFor([{ sku: "A", quantity }], [kit]);
    assert.equal(summary.pricingError, undefined);
    assert.equal(summary.subtotalFinal, expected);
    if (quantity >= 30) assert.equal(summary.lines[0].allocations.filter(a => a.kitSet).reduce((sum, a) => sum + a.quantity, 0), quantity);
  }
});

test("minimum SET excess applies only when every other SET is complete", () => {
  const kit = setKit([setOf("1", ["A", "B"], 30, "MINIMUM", percent(10)), setOf("2", ["D"], 2, "EXACT", percent(100))]);
  const items = [{ sku: "A", quantity: 20 }, { sku: "B", quantity: 30 }];
  assert.equal(quoteFor([...items, { sku: "D", quantity: 1 }], [kit]).subtotalFinal, 5100);
  const summary = quoteFor([...items, { sku: "D", quantity: 2 }], [kit]);
  assert.equal(summary.pricingError, undefined);
  assert.equal(summary.subtotalFinal, 4500);
});

test("shared SKU cannot count twice and retains its SET-specific benefit", () => {
  const kit = setKit([setOf("1", ["A", "B"], 3), setOf("2", ["A", "D"], 2, "EXACT", percent(100))]);
  assert.equal(quoteFor([{ sku: "A", quantity: 3 }], [kit]).subtotalFinal, 300);
  const summary = quoteFor([{ sku: "A", quantity: 5 }], [kit]);
  assert.equal(summary.subtotalFinal, 300);
  assert.equal(summary.lines[0].allocations.find(a => a.kitSet === "1").quantity, 3);
  assert.equal(summary.lines[0].allocations.find(a => a.kitSet === "2").quantity, 2);
  assert.match(engine.allocationLabel(summary.lines[0].allocations), /SET 2/);
});

test("assignment backtracks so flexible SETs do not take units needed by another SET", () => {
  const kit = setKit([setOf("flex", ["A", "B"], 1), setOf("only-A", ["A"], 1, "EXACT", percent(100))]);
  const summary = quoteFor([{ sku: "A", quantity: 1 }, { sku: "B", quantity: 1 }], [kit]);
  assert.equal(summary.subtotalFinal, 100);
  assert.equal(bySku(summary, "A").allocations[0].kitSet, "only-A");
});

test("shared SET alternatives choose the cheapest whole quote, independent of SKU order", () => {
  const products = [{ ...catalog[0], listPrice: 100 }, { ...catalog[1], listPrice: 300 }];
  for (const skus of [["A", "B"], ["B", "A"]]) {
    const kit = setKit([setOf("pay", skus, 1), setOf("free", skus, 1, "EXACT", percent(100))]);
    const summary = quoteFor([{ sku: "A", quantity: 1 }, { sku: "B", quantity: 1 }], [kit], "1002", products);
    assert.equal(summary.subtotalFinal, 100);
    assert.equal(bySku(summary, "B").finalTotal, 0);
  }
});

test("SET unit override, repeated kits and leftovers conserve every unit", () => {
  const kit = setKit([setOf("1", ["A", "B"], 3, "EXACT", { type: "OVERRIDE_PRICE", value: 50 }), setOf("2", ["D"], 2, "EXACT", percent(100))]);
  const summary = quoteFor([{ sku: "A", quantity: 7 }, { sku: "D", quantity: 4 }], [kit]);
  assert.equal(summary.subtotalFinal, 400);
  assert.equal(bySku(summary, "A").allocations.reduce((n, a) => n + a.quantity, 0), 7);
  assert.equal(bySku(summary, "D").allocations.reduce((n, a) => n + a.quantity, 0), 4);
});

test("SET kits compete with unit offers and packages instead of forcing a kit", () => {
  const kit = setKit([setOf("1", ["A"], 3, "EXACT", percent(10))]);
  assert.equal(quoteFor([{ sku: "A", quantity: 3 }], [kit, rule("cheaper", { discountPercent: 50 })]).subtotalFinal, 150);
  assert.equal(quoteFor([{ sku: "A", quantity: 3 }], [kit, pack("cheaper-pack", 3, 100)]).subtotalFinal, 100);
});

test("whole-offer stacking applies consistently to all SETs using existing combination rules", () => {
  const sets = [setOf("1", ["A"], 1, "EXACT", percent(10)), setOf("2", ["B"], 1, "EXACT", percent(10))];
  const items = [{ sku: "A", quantity: 1 }, { sku: "B", quantity: 1 }];
  const units = ["A", "B"].map(sku => rule(`unit-${sku}`, { sku, discountPercent: 20 }));
  assert.equal(quoteFor(items, [setKit(sets, { allowStacking: false }), ...units]).subtotalFinal, 160);
  assert.equal(quoteFor(items, [setKit(sets, { allowStacking: true }), ...units]).subtotalFinal, 144);
});

test("legacy configured kits remain readable but pending until SETs are saved", () => {
  const legacy = { kind: "KIT", items: ["A", "B"].map(sku => ({ sku, quantity: 1, benefit: percent(100) })) };
  const config = configModule.validateDealConfig(legacy);
  const kit = rule("old", { type: "KIT_OFFER", deal: config });
  assert.equal(configModule.isPendingKit(kit), true);
  assert.equal(quoteFor([{ sku: "A", quantity: 1 }, { sku: "B", quantity: 1 }], [kit]).subtotalFinal, 200);
});

test("SET validation allows overlap across SETs, rejects invalid thresholds and duplicates within a SET", () => {
  const valid = [setOf("1", ["A", "B"], 3), setOf("2", ["A"], 2, "MINIMUM", percent(100))];
  assert.equal(configModule.validateDealConfig({ kind: "KIT", sets: valid }).sets.length, 2);
  for (const sets of [[], [valid[0], valid[0]], [setOf("1", [], 1)], [setOf("1", ["A", "A"], 1)], [setOf("1", ["A"], 0)], [setOf("1", ["A"], 1, "bad")], [setOf("1", ["A"], 1, "EXACT", percent(101))]]) {
    assert.throws(() => configModule.validateDealConfig({ kind: "KIT", sets }));
  }
});

test("SET configuration round-trips through the independent settings store", async () => {
  const settings = loadModule("../src/services/dealSettings.ts", { "./dealConfig": configModule });
  const config = { kind: "KIT", sets: [setOf("1", ["A", "B"], 3), setOf("2", ["A", "D"], 2, "EXACT", percent(100))] };
  let stored;
  const client = { from(table) {
    assert.equal(table, "promotion_deal_configs");
    let offset = 0;
    const query = {
      select() { return query; }, order() { return query; }, in() { return query; },
      range(start) { offset = start; return query; },
      then(resolve) { return Promise.resolve({ data: offset ? [] : [stored], error: null }).then(resolve); },
      async upsert(row) { stored = row; return { error: null }; },
    };
    return query;
  } };
  await settings.writeDealSetting(client, { promotion_id: "p", offer_id: "23456", segment: " 1002 ", config });
  const loaded = await settings.readDealSettings(client, ["p"]);
  assert.equal(loaded[0].segment, "1002");
  assert.equal(JSON.stringify(loaded[0].config), JSON.stringify(config));
  assert.equal(configModule.isPendingKit({ type: "KIT_OFFER", deal: loaded[0].config }), false);
});

const detail = (offer, sku, set = "", quantity = 1, threshold_type = "EXACT") => ({ offer_id: offer, sku, set_id: set, quantity, threshold_type });
const detailHeader = ["TIPO", "Id de oferta", "SET", "ITEM", "Umbral", "Cantidad", "VALID"];
test("configuration template ignores A and VALID, keeps identifier zeroes and never inherits SET", () => {
  const parsed = detailModule.parseOfferDetails([detailHeader,
    ["arbitrary text", "001", "SET 1", "0007", "Exacto", "1", "no"],
    ["KIT", "002", "", "0008", "Mínimo", "24", "yes"],
  ]);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.rows[0].sku, "0007");
  assert.equal(parsed.rows[0].set_id, "1");
  assert.equal(parsed.rows[1].set_id, "");
});
test("configuration rejects duplicate rows, inconsistent SET quantities and invalid numbers", () => {
  for (const rows of [
    [["", "1", "SET 1", "A", "Exacto", 1], ["", "1", "SET 1", "A", "Exacto", 1]],
    [["", "1", "SET 1", "A", "Exacto", 1], ["", "1", "SET 1", "B", "Exacto", 2]],
    [["", "1", "", "A", "Exacto", "2 units"]],
    [["", "1", "", "A", "Exacto", 0]],
    [["", "1", "", "A", "unknown", 1]],
  ]) assert.ok(detailModule.parseOfferDetails([detailHeader, ...rows]).errors.length);
});
test("one SET with seven eligible SKUs needs one alternative, not seven units", () => {
  const products = Array.from({ length: 7 }, (_, i) => ({ ...catalog[0], sku: String(i) }));
  const rules = products.map(p => rule("kit", { sku: p.sku, type: "KIT_OFFER", discountPercent: 50 }));
  const resolved = detailModule.applyOfferDetails(rules, products.map(p => detail("kit", p.sku, "1")));
  const summary = quoteFor([{ sku: "6", quantity: 1 }], resolved, "1002", products);
  assert.equal(summary.pricingError, undefined);
  assert.equal(summary.subtotalFinal, 50);
  assert.equal(resolved[0].deal.sets[0].quantity, 1);
});
test("same SET uses each selected SKU benefit from the report", () => {
  const resolved = detailModule.applyOfferDetails([
    rule("kit", { type: "KIT_OFFER", sku: "A", discountPercent: 20 }),
    rule("kit", { type: "KIT_OFFER", sku: "B", discountType: "OVERRIDE_PRICE", fixedPrice: 30 }),
  ], [detail("kit", "A", "1"), detail("kit", "B", "1")]);
  const summary = quoteFor([{ sku: "A", quantity: 1 }, { sku: "B", quantity: 1 }], resolved);
  assert.equal(summary.pricingError, undefined);
  assert.equal(summary.subtotalFinal, 110);
  assert.equal(bySku(summary, "A").finalTotal, 80);
  assert.equal(bySku(summary, "B").finalTotal, 30);
});
test("global conditions do not leak benefits or eligibility across promotions and segments", () => {
  const resolved = detailModule.applyOfferDetails([
    rule("kit", { promotionId: "p1", type: "KIT_OFFER", segment: "1002", discountPercent: 10 }),
    rule("kit", { promotionId: "p2", type: "KIT_OFFER", segment: "1003", discountPercent: 80 }),
  ], [detail("kit", "A", "1")]);
  assert.equal(quoteFor([{ sku: "A", quantity: 1 }], resolved, "1002").subtotalFinal, 90);
  assert.equal(quoteFor([{ sku: "A", quantity: 1 }], resolved, "1003").subtotalFinal, 20);
});
test("incomplete or changed kit remains pending, invalid benefits are explicit", () => {
  const rules = [rule("kit", { type: "KIT_OFFER" })];
  const missing = detailModule.applyOfferDetails(rules, [detail("kit", "A", "1"), detail("kit", "B", "2")]);
  assert.equal(configModule.isPendingKit(missing[0]), true);
  assert.throws(() => detailModule.applyOfferDetails([rule("kit")], [detail("kit", "A", "1")]), /tipo/);
  assert.throws(() => detailModule.applyOfferDetails([rule("kit", { type: "KIT_OFFER", discountPercent: undefined })], [detail("kit", "A", "1")]), /beneficio/);
});
test("Exact 1 defaults apply discount and fixed unit price twenty times", () => {
  const discounts = detailModule.applyOfferDetails([rule("23245", { discountPercent: 20 })], []);
  assert.equal(discounts[0].thresholdType, "EXACT");
  assert.equal(discounts[0].thresholdQuantity, 1);
  assert.equal(quoteFor([{ sku: "A", quantity: 20 }], discounts).subtotalFinal, 1600);
  const fixed = detailModule.applyOfferDetails([rule("price", { type: "FIXED_QTY_PRICE", discountType: "OVERRIDE_PRICE", fixedPrice: 35 })], []);
  assert.equal(quoteFor([{ sku: "A", quantity: 20 }], fixed).subtotalFinal, 700);
});
test("Exact 1 retains compatible stacking and handles large whole orders efficiently", () => {
  const rules = detailModule.applyOfferDetails([rule("a", { allowStacking: true, discountPercent: 10 }), rule("b", { allowStacking: true, discountPercent: 20 })], []);
  const summary = quoteFor([{ sku: "A", quantity: 18000 }], rules);
  assert.equal(summary.pricingError, undefined);
  assert.equal(summary.subtotalFinal, 1296000);
});
test("non-kit exact groups repeat with leftovers, while minimum benefits all qualified units", () => {
  const source = [rule("offer", { discountPercent: 50 })];
  const exact = detailModule.applyOfferDetails(source, [detail("offer", "A", "", 3)]);
  const minimum = detailModule.applyOfferDetails(source, [detail("offer", "A", "", 3, "MINIMUM")]);
  assert.equal(quoteFor([{ sku: "A", quantity: 8 }], exact).subtotalFinal, 500);
  assert.equal(quoteFor([{ sku: "A", quantity: 8 }], minimum).subtotalFinal, 400);
  assert.equal(quoteFor([{ sku: "A", quantity: 2 }], minimum).subtotalFinal, 200);
});
test("global non-kit overrides only the submitted SKU and preserves old special conditions", () => {
  const legacy = pack("unrelated", 3, 100);
  const result = detailModule.applyOfferDetails([rule("offer"), rule("offer", { sku: "B", thresholdQuantity: 8 }), legacy], [detail("offer", "A", "", 2)]);
  assert.equal(result[0].thresholdQuantity, 2);
  assert.equal(result[1].thresholdQuantity, 8);
  assert.equal(result[2].deal.price, 100);
  assert.equal(detailModule.applyOfferDetails([rule("old", { thresholdQuantity: 250 })], [])[0].thresholdQuantity, 250);
});
test("per-SKU benefit validation rejects missing or extraneous benefits", () => {
  assert.throws(() => configModule.validateDealConfig({ kind: "KIT", sets: [{ id: "1", skus: ["A", "B"], quantity: 1, thresholdType: "EXACT", skuBenefits: { A: { type: "PERCENT_OFF", value: 10 } } }] }), /SET/);
});

test("Excel worker preserves formatted SKU zeroes and reads formatted quantities as numbers", async () => {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet([detailHeader, ["ignored", "001", "", 7, "Mínimo", 18000, ""]]);
  sheet.D2.z = "0000"; sheet.F2.z = "#,##0";
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, "Config");
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  let response; const self = { postMessage: value => { response = value; } };
  loadModule("../src/workers/fileParser.worker.ts", { "read-excel-file/web-worker": {}, xlsx: XLSX, "../services/offerConfiguration": detailModule }, { self });
  await self.onmessage({ data: { id: "xlsx", mode: "offer-details", file: { name: "config.xlsx", size: buffer.byteLength, arrayBuffer: async () => buffer } } });
  assert.equal(response.ok, true);
  assert.equal(response.result.errors.length, 0);
  assert.equal(response.result.rows[0].sku, "0007");
  assert.equal(response.result.rows[0].quantity, 18000);
});
test("global detail reads continue when database page caps are below 500", async () => {
  const store = loadModule("../src/services/offerConfigurationStore.ts");
  const rows = [detail("o", "A"), detail("o", "B"), detail("o", "C")];
  const ranges = [];
  const client = { from() {
    const query = { select: () => query, in: () => query, order: () => query,
      range: async (from, to) => { ranges.push([from, to]); return { data: rows.slice(from, from + 1), error: null }; } };
    return query;
  } };
  const result = await store.readOfferDetails(client, ["o"]);
  assert.equal(result.length, 3);
  assert.deepEqual(ranges.map(([start]) => start), [0, 1, 2, 3]);
});
test("global detail reads distinguish a missing migration from operational errors", async () => {
  const store = loadModule("../src/services/offerConfigurationStore.ts");
  const client = code => ({ from() {
    const query = { select: () => query, in: () => query, order: () => query,
      range: async () => ({ data: null, error: { code, message: "failure" } }) };
    return query;
  } });
  assert.equal(await store.readOfferDetails(client("PGRST205"), ["o"]), null);
  await assert.rejects(() => store.readOfferDetails(client("42501"), ["o"]), /configuraciones/);
});
