// Run with: node scripts/offer-configuration-sql.test.mjs <path-to-pglite-entry>
// Uses isolated PostgreSQL/WASM, never the production database.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
  create function public.is_admin() returns boolean language sql as $$select coalesce(current_setting('test.admin',true),'yes') <> 'no'$$;
  create table public.offer_rules (
    id text primary key, external_offer_id text, promotion_id text, segment text, sku text,
    is_active boolean default true, offer_type text, discount_type text,
    fixed_price numeric, discount_percent numeric, threshold_quantity numeric, threshold_type text
  );
  create table public.promotion_deal_configs (promotion_id text, offer_id text, segment text, config jsonb);
  insert into public.offer_rules(id,external_offer_id,promotion_id,segment,sku,offer_type,discount_type,discount_percent)
  values ('1','kit','p1','1002','A','KIT_OFFER','PERCENT_OFF',10),
    ('2','kit','p1','1002','B','KIT_OFFER','PERCENT_OFF',50),
    ('3','unit','p1','1002','A','LINE_ITEM_DISCOUNT','PERCENT_OFF',20),
    ('4','other','p1','1002','A','LINE_ITEM_DISCOUNT','PERCENT_OFF',30);
`);
const migration = readFileSync(new URL("../supabase/offer_configuration_details.sql", import.meta.url), "utf8");
await db.exec(migration);
await db.exec(migration); // Idempotence.
const d = (offer_id, sku, set_id = "", quantity = 1, threshold_type = "EXACT") => ({ offer_id, sku, set_id, quantity, threshold_type });
const call = async (rows, revision = null) => (await db.query("select public.import_offer_configuration_details($1::jsonb, $2, $3) result", [JSON.stringify(rows), revision !== null, revision])).rows[0].result;
const count = async table => Number((await db.query(`select count(*) n from public.${table}`)).rows[0].n);
const kit = [d("kit", "A", "1"), d("kit", "B", "1")];
const preview = await call(kit);
assert.equal(preview.applied, false);
assert.equal(await count("offer_configuration_details"), 0);
assert.equal((await call(kit, preview.revision)).applied, true);
assert.equal(await count("offer_configuration_details"), 2);
assert.equal(await count("offer_configuration_import_audit"), 1);
for (const rows of [
  [d("kit", "A", "1")], // Incomplete kit.
  [d("unit", "A", "1")], // SET on non-kit.
  [d("kit", "A"), d("kit", "B")], // Kit without SET.
  [d("missing", "A")],
  [d("unit", "A", "", 0)],
  [d("unit", "A", "", 1.5)],
  [d("unit", "A"), d("unit", "A")],
  [d("kit", "A", "1"), d("kit", "B", "1", 2)],
]) await assert.rejects(() => call(rows));
assert.equal(await count("offer_configuration_details"), 2);
assert.equal(await count("offer_configuration_import_audit"), 1);
const ordinary = [d("unit", "A", "", 24, "MINIMUM"), d("other", "A")];
const p2 = await call(ordinary);
await db.exec("update public.offer_rules set discount_percent = 25 where external_offer_id = 'unit'");
await assert.rejects(() => call(ordinary, p2.revision), /cambiaron/);
await call(ordinary, (await call(ordinary)).revision);
assert.equal(await count("offer_configuration_details"), 4);
const replacement = [d("kit", "A", "1", 2), d("kit", "B", "2")];
const p3 = await call(replacement);
await call(replacement, p3.revision);
assert.equal(await count("offer_configuration_details"), 4); // Other offers survive.
assert.equal((await db.query("select set_id from public.offer_configuration_details where offer_id='kit' and sku='B'")).rows[0].set_id, "2");
await assert.rejects(() => call(replacement, p3.revision), /cambiaron/);
await db.exec("set test.admin = 'no'");
await assert.rejects(() => call(kit), /administradores/);
await db.exec("set test.admin = 'yes'; set role authenticated");
await assert.rejects(() => db.exec("delete from public.offer_configuration_details"), /permission denied/);
await db.exec("reset role");
assert.equal(await count("offer_configuration_details"), 4);
await db.close();
console.log("SQL integration passed: repeatable migration, preview, validation, atomic writes, audit, concurrency and permissions.");
