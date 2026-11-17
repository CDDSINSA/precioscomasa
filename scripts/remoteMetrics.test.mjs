import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function harness(responses = {}) {
  const source = readFileSync(new URL("../src/services/supabase/client.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("client.ts", source, ts.ScriptTarget.ES2022, true);
  const names = ["loadRemoteDataMetrics", "countRows", "refreshRemoteDataStatuses", "statusFromCount", "detailFromCount"];
  const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
  assert.equal(functions.length, names.length);
  const calls = [];
  const statuses = [];
  const client = schema => ({ from: table => ({
    select(columns, options) {
      const call = { schema, table, columns, ...options };
      calls.push(call);
      return { limit(limit) {
        call.limit = limit;
        return { async abortSignal() {
          const response = responses[table];
          const result = typeof response === "function" ? response(options.count) : response;
          if (result instanceof Error) throw result;
          return result ?? { count: 12, error: null };
        } };
      } };
    },
  }) });
  const exports = {};
  vm.runInNewContext(ts.transpileModule(functions.map(node => node.getText(ast)).join("\n"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, supabase: client("g_comasa"), commonDb: () => client("d_comun"),
    inventoryFeatureEnabled: true, AbortSignal, Error,
    updateStoredDataStatus: (...args) => statuses.push(args),
  });
  return { ...exports, calls, statuses };
}

test("counts shared tables in d_comun without downloading rows", async () => {
  const h = harness();
  const metrics = await h.loadRemoteDataMetrics();
  assert.equal(metrics.catalog, 12);
  for (const call of h.calls) {
    assert.equal(call.schema, ["products", "stores", "inventory"].includes(call.table) ? "d_comun" : "g_comasa");
    assert.equal(call.limit, 0);
    assert.equal(call.head, undefined);
    assert.equal(call.count, call.table === "inventory" ? "estimated" : "exact");
  }
});

test("preserves the catalog database error and reuses metrics for the orange indicator", async () => {
  const h = harness({ products: { count: null, error: { code: "57014", message: "canceling statement due to statement timeout" } } });
  const metrics = await h.loadRemoteDataMetrics();
  assert.equal(metrics.catalog, null);
  assert.equal(metrics.promotions, 12);
  assert.match(metrics.errors.catalog, /57014.*statement timeout/);
  await h.refreshRemoteDataStatuses(metrics);
  assert.equal(h.calls.length, 6, "updating LEDs must not repeat the five counts and timeout fallback");
  assert.deepEqual(h.statuses.find(item => item[0] === "catalog"), ["catalog", "warning", metrics.errors.catalog]);
});

test("a timed-out full count falls back to a clearly identified estimate", async () => {
  const h = harness({ products: mode => mode === "exact"
    ? { count: null, error: { code: "57014", message: "statement timeout" } }
    : { count: 24000, error: null } });
  const metrics = await h.loadRemoteDataMetrics();
  assert.equal(metrics.catalog, 24000);
  assert.equal(metrics.estimated.catalog, true);
  assert.equal(metrics.errors.catalog, undefined);
  await h.refreshRemoteDataStatuses(metrics);
  assert.deepEqual(h.statuses.find(item => item[0] === "catalog"), ["catalog", "ok", "24000 productos (aprox.)"]);
  assert.deepEqual(h.calls.filter(item => item.table === "products").map(item => item.count), ["exact", "planned"]);
});

test("permission errors do not trigger an approximate count", async () => {
  const h = harness({ products: { count: null, error: { code: "42501", message: "permission denied" } } });
  const metrics = await h.loadRemoteDataMetrics();
  assert.equal(metrics.catalog, null);
  assert.match(metrics.errors.catalog, /42501.*permission denied/);
  assert.equal(h.calls.filter(item => item.table === "products").length, 1);
});

test("distinguishes an empty catalog from a missing count or a network failure", async () => {
  for (const [response, expected, detail] of [
    [{ count: 0, error: null }, 0, undefined],
    [{ count: null, error: null }, null, /no devolvió/],
    [new Error("Network failure"), null, /Network failure/],
  ]) {
    const h = harness({ products: response });
    const metrics = await h.loadRemoteDataMetrics();
    assert.equal(metrics.catalog, expected);
    if (detail) assert.match(metrics.errors.catalog, detail);
    else assert.equal(metrics.errors.catalog, undefined);
    assert.equal(metrics.customers, 12);
  }
});
