import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function functions(path, names, context) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true);
  const selected = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
  assert.equal(selected.length, names.length);
  const exports = {};
  vm.runInNewContext(ts.transpileModule(selected.map(node => node.getText(ast)).join('\n'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText + '\n' + names.map(n => `exports.${n} = ${n};`).join('\n'), { exports, ...context });
  return exports;
}

function searchHarness({ rpc = { data: [], error: null }, direct = { data: [], error: null }, onRpc } = {}) {
  const calls = [];
  const builder = (kind, response) => {
    const call = { kind, orders: [] };
    calls.push(call);
    const request = {
      select() { return request; }, or() { return request; }, in() { return request; },
      order(column) { call.orders.push(column); return request; },
      range(from, to) { call.range = [from, to]; return request; },
      abortSignal(signal) { call.signal = signal; return request; },
      then(resolve, reject) { if (kind === 'rpc') onRpc?.(); return Promise.resolve(response).then(resolve, reject); },
    };
    return request;
  };
  const fns = functions('../src/services/supabase/catalog.ts', ['searchProductPageFromSupabase', 'searchProductPageWithInventory'], {
    supabase: { rpc: () => builder('rpc', rpc) }, commonDb: () => ({ from: () => builder('direct', direct) }),
    inventoryFeatureEnabled: true, inventoryStoreId: '1041',
    isSupplierRestrictedRole: () => false, restrictProductsForRole: rows => rows,
    productSelectColumns: '*', unique: items => [...new Set(items)], escapePostgrestPattern: x => x,
    isMissingColumnError: () => false, sortProductsByRelevance: rows => rows,
    mapProduct: row => row, mapProductSearchInventory: () => new Map(),
  });
  return { ...fns, calls };
}

test('successful empty inventory search does not repeat the search through the fallback', async () => {
  const h = searchHarness();
  const page = await h.searchProductPageFromSupabase('missing', { prioritizeInventory: true });
  assert.equal(page.products.length, 0);
  assert.equal(page.hasMore, false);
  assert.equal(h.calls.length, 1);
});

test('abort signal reaches the RPC and an aborted RPC cannot trigger a fallback scan', async () => {
  const controller = new AbortController();
  const h = searchHarness({ rpc: { data: null, error: { message: 'aborted' } }, onRpc: () => controller.abort() });
  const page = await h.searchProductPageFromSupabase('old', { prioritizeInventory: true, signal: controller.signal });
  assert.equal(page, null);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].signal, controller.signal);
});

test('direct search has deterministic pagination for products with identical descriptions', async () => {
  const controller = new AbortController();
  const h = searchHarness({ direct: { data: Array.from({ length: 37 }, (_, i) => ({ sku: String(i) })), error: null } });
  const page = await h.searchProductPageFromSupabase('', { offset: 72, limit: 36, signal: controller.signal });
  assert.equal(page.products.length, 36);
  assert.equal(page.hasMore, true);
  assert.equal(h.calls[0].signal, controller.signal);
  assert.deepEqual(h.calls[0].orders, ['description', 'sku']);
  assert.deepEqual(h.calls[0].range, [72, 108]);
});

test('stock on later pages cannot move earlier products or duplicate their SKU', () => {
  const { sortProductPagesByInventory } = functions('../src/features/quotes/components/skuSearchHelpers.ts', ['sortProductsByInventory', 'sortProductPagesByInventory'], {});
  const rows = Array.from({ length: 72 }, (_, i) => ({ sku: String(i) }));
  const inventory = new Map([['1', { totalQuantity: 2 }], ['40', { totalQuantity: 3 }]]);
  const before = sortProductPagesByInventory(rows.slice(0, 36), inventory, 36);
  const after = sortProductPagesByInventory(rows, inventory, 36);
  assert.deepEqual(after.slice(0, 36), before);
  assert.equal(after[36].sku, '40');
  assert.equal(new Set(after.map(row => row.sku)).size, 72);
});
