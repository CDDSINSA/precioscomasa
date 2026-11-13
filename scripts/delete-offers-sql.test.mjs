// Run: node scripts/delete-offers-sql.test.mjs <path-to-pglite-entry>
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
await db.exec(`
  create schema g_comasa; create schema d_comun; set search_path = g_comasa, d_comun, public;
  create role anon; create role authenticated; grant usage on schema g_comasa, d_comun to anon, authenticated; create schema auth;
  create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
  create function g_comasa.is_admin() returns boolean language sql as $$select coalesce(current_setting('test.admin',true),'yes') <> 'no'$$;
  create table offer_rules(id uuid primary key default gen_random_uuid(), external_offer_id text, promotion_id text, segment text, sku text, is_active boolean default true);
  create table promotion_deal_configs(promotion_id text, offer_id text, segment text, config jsonb);
  create table offer_configuration_details(offer_id text, sku text, set_id text);
  create table quote_lines(id integer primary key, applied_offer_rule_id uuid references offer_rules(id), total numeric);
  insert into offer_rules(external_offer_id,promotion_id,segment,sku) values
    ('O','P','A','1'),('O','P','A','2'),('O','P','B','1'),('O','Q','A','1'),('OTHER','P','A','1');
  insert into promotion_deal_configs values ('P','O','A','{"kind":"PACK"}'),('P','O','B','{"kind":"KIT"}'),('Q','O','A','{"kind":"KIT"}');
  insert into offer_configuration_details values ('O','1','1'),('OTHER','1','1');
  insert into quote_lines select 1,id,100 from offer_rules where external_offer_id='O' and promotion_id='P' and segment='A' limit 1;
`);
const sql = readFileSync(new URL('../supabase/delete_offers.sql', import.meta.url), 'utf8');
await db.exec(sql); await db.exec(sql);
const call = async (promo='P', segment='A', apply=false, revision=null, reason='Oferta retirada') =>
  (await db.query('select delete_offer($1,$2,$3,$4,$5,$6) result', ['O',promo,segment,apply,revision,reason])).rows[0].result;
const count = async table => Number((await db.query(`select count(*) n from ${table}`)).rows[0].n);
let preview = await call();
assert.equal(preview.affected_rules,2);
assert.equal(await count('offer_rules'),5); // Preview never mutates.
await assert.rejects(()=>call(null,'A'),/alcance/);
await assert.rejects(()=>call('P','A',true,null),/cambió/);
await assert.rejects(()=>call('P','A',true,preview.revision,' '),/motivo/);
await db.exec("set test.admin='no'");
await assert.rejects(()=>call(),/administradores/);
await assert.rejects(()=>call('P','A',true,preview.revision),/administradores/);
await db.exec("set test.admin='yes'; update promotion_deal_configs set config='{}' where segment='A'");
await assert.rejects(()=>call('P','A',true,preview.revision),/cambió/);
preview=await call();
// An audit failure must roll back all deletes in the transaction.
await db.exec("alter table offer_deletion_audit add constraint fail_audit check (reason <> 'fail')");
await assert.rejects(()=>call('P','A',true,preview.revision,'fail'),/fail_audit/);
assert.equal(await count('offer_rules'),5);
assert.equal(await count('promotion_deal_configs'),3);
await call('P',' A ',true,preview.revision);
assert.equal(await count('offer_rules'),3); // Other segment, promotion and offer survive.
assert.equal(await count('promotion_deal_configs'),2);
assert.equal(await count('offer_configuration_details'),2); // Shared SET survive.
assert.equal(await count('offer_deletion_audit'),1);
assert.deepEqual((await db.query('select * from quote_lines')).rows,[{id:1,applied_offer_rule_id:null,total:'100'}]);
const audit=(await db.query('select before_rows from offer_deletion_audit')).rows[0].before_rows;
assert.equal(audit.rules.length,2); assert.equal(audit.configs.length,1); assert.equal(audit.details.length,1);
await assert.rejects(()=>call(),/ya no existe/);
preview=await call(null,null);
assert.equal(preview.affected_rules,2);
await db.exec("update offer_rules set sku='changed' where promotion_id='Q'");
await assert.rejects(()=>call(null,null,true,preview.revision),/cambió/);
preview=await call(null,null);
await call(null,null,true,preview.revision);
assert.equal(await count('offer_rules'),1);
assert.equal(await count('promotion_deal_configs'),0);
assert.equal(await count('offer_configuration_details'),1);
await db.exec('set role authenticated');
await assert.rejects(()=>db.exec('delete from offer_deletion_audit'),/permission denied/);
await db.exec('reset role; drop table promotion_deal_configs; drop table offer_configuration_details;');
await db.exec("insert into offer_rules(external_offer_id,promotion_id,segment,sku) values ('O','P','A','1')");
preview=await call(); await call('P','A',true,preview.revision); // Optional migrations absent.
assert.equal(await count('offer_rules'),1);
await db.exec('set role anon');
await assert.rejects(()=>call(),/permission denied/);
await db.exec('reset role');
await db.close();
console.log('Offer deletion passed: scope, preview, revisions, permissions, audit, rollback, shared SET, cleanup and optional tables.');
