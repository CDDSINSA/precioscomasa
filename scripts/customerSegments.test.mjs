import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as XLSX from "xlsx";
import { CUSTOMER_SEGMENTS, selectCustomerSegments, NO_ALLOWED_CUSTOMERS } from "../src/services/customerSegments.mjs";

test("allows exactly the six customer segments without mutating the input", () => {
  const customers = [...CUSTOMER_SEGMENTS, "1001", "", " - ", "9999", null, undefined, "11040", "x1104", 1104, " 1103 "]
    .map((segment, index) => Object.freeze({ customerId: String(index), segment }));
  Object.freeze(customers);
  const result = selectCustomerSegments(customers);
  assert.equal(result.accepted.length, 8);
  assert.equal(result.excluded, 8);
  assert.equal(customers.length, 16);
  assert.equal(result.accepted[0], customers[0]);
});

function syncHarness() {
  const source = readFileSync(new URL("../src/services/supabase.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("supabase.ts", source, ts.ScriptTarget.ES2022, true);
  const names = ["syncCustomersToSupabase", "deduplicateCustomers", "withoutEmptyCustomerValues"];
  const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
  assert.equal(functions.length, names.length);
  const exports = {};
  const calls = [];
  vm.runInNewContext(ts.transpileModule(functions.map(node => node.getText(ast)).join("\n"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, selectCustomerSegments, NO_ALLOWED_CUSTOMERS,
    supabase: { from: table => ({ insert: payload => { calls.push({ table, payload }); return { error: null }; } }) },
    prepareCustomerSync: async () => { calls.push("prepare"); return { ok: true }; },
    customerPayload: customer => customer,
    uploadInChunks: async (rows, size, progress, label, upload) => { await upload(rows); return { ok: true }; },
  });
  return { sync: exports.syncCustomersToSupabase, calls };
}

test("empty or fully excluded sync never clears or writes the database", async () => {
  for (const input of [[], [{ customerId: "a", displayName: "A", segment: "1001" }], [{ customerId: "", displayName: "A", segment: "1104" }]]) {
    const { sync, calls } = syncHarness();
    const result = await sync(input);
    assert.equal(result.ok, false);
    assert.equal(result.message, NO_ALLOWED_CUSTOMERS);
    assert.deepEqual(calls, []);
  }
});

test("sync retains consolidation rules and separates duplicate and excluded counts", async () => {
  const { sync, calls } = syncHarness();
  const result = await sync([
    { customerId: "a", displayName: "A", segment: "1104", email: "a@example.com" },
    { customerId: "a", displayName: "A updated", segment: "1103", email: undefined },
    { customerId: "b", displayName: "B", segment: "1104" },
    { customerId: "b", displayName: "B", segment: "1001" },
  ]);
  assert.equal(result.ok, true);
  assert.match(result.message, /1 clientes publicados/);
  assert.match(result.message, /1 clientes excluidos/);
  assert.match(result.message, /2 duplicados/);
  assert.equal(calls[0], "prepare");
  assert.equal(calls[1].table, "customers");
  assert.equal(calls[1].payload.length, 1);
  assert.equal(calls[1].payload[0].segment, "1103");
  assert.equal(calls[1].payload[0].email, "a@example.com");
});

test("CLI dry-run filters normalized Excel segments and stops on an excluded-only file", () => {
  const directory = mkdtempSync(join(tmpdir(), "comasa-customer-segments-"));
  try {
    const file = join(directory, "customers.xlsx");
    const write = rows => {
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["cust_id", "nombre", "segmento"], ...rows]), "Clientes");
      XLSX.writeFile(book, file);
    };
    write([["a", "Prueba A", "COMASA 1104"], ["b", "Prueba B", 1001], ["c", "Prueba C", 1105]]);
    const run = () => spawnSync(process.execPath, ["scripts/syncCustomers.mjs", "--dry-run", file], { encoding: "utf8" });
    const accepted = run();
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.match(accepted.stdout, /2 clientes aceptados; 1 excluidos/);
    assert.match(accepted.stdout, /Modo dry-run/);
    assert.doesNotMatch(accepted.stdout, /Prueba B/);
    write([["a", "Prueba A", 1001]]);
    const excluded = run();
    assert.equal(excluded.status, 1);
    assert.match(excluded.stderr, /No hay clientes de los segmentos permitidos/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
