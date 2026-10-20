import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
create function public.is_admin() returns boolean language sql as $$select coalesce(current_setting('test.admin',true),'yes') <> 'no'$$;
create table products(sku text primary key);
create table offer_rules(id uuid primary key default gen_random_uuid(), external_offer_id text, promotion_id text, offer_type text, sku text, segment text,
min_quantity numeric default 0, fixed_price numeric, discount_percent numeric, discount_type text, promotion_attribute text, allow_stacking boolean,
threshold_quantity numeric, threshold_type text, is_active boolean default true, updated_at timestamptz default now());
create table promotion_deal_configs(promotion_id text, offer_id text, segment text, config jsonb);
insert into products values ('A'),('B'),('C');
insert into offer_rules(external_offer_id,promotion_id,offer_type,sku,segment,discount_type,discount_percent,min_quantity,threshold_quantity,threshold_type)
values ('O','P','LINE_ITEM_DISCOUNT','A','1104','PERCENT_OFF',10,3,3,'MINIMUM'),('O','P','LINE_ITEM_DISCOUNT','A','1103','PERCENT_OFF',5,1,1,'MINIMUM');
`);
const sql = readFileSync(new URL('../supabase/manual_offer_edits.sql',import.meta.url),'utf8');
await db.exec(sql); await db.exec(sql);
const call = async (changes=null, revision=null, segment='1104') => (await db.query('select edit_simple_offer($1,$2,$3,$4::jsonb,$5,$6) result',['P','O',segment,changes === null ? null : JSON.stringify(changes),revision,'Solicitud comprador'])).rows[0].result;
const p = await call(); const id=p.rows[0].id;
await call([{action:'update',id,benefit:'PERCENT_OFF',value:20},{action:'add',id,sku:'B',benefit:'OVERRIDE_PRICE',value:99}],p.revision);
let state=await call();
assert.equal(state.rows.length,2); assert.equal(state.rows.find(r=>r.sku==='A').discount_percent,20);
assert.equal(state.rows.find(r=>r.sku==='B').min_quantity,3);
assert.equal((await call(null,null,'1103')).rows[0].discount_percent,5);
await assert.rejects(()=>call([{action:'remove',id}],p.revision),/cambió/);
for (const change of [
{action:'add',id,sku:'B',benefit:'PERCENT_OFF',value:10},
{action:'add',id,sku:'missing',benefit:'PERCENT_OFF',value:10},
{action:'update',id,benefit:'PERCENT_OFF',value:101},
{action:'update',id,benefit:'OVERRIDE_PRICE',value:-1},
{action:'update',id,benefit:'OVERRIDE_PRICE',value:1.12345},
]) await assert.rejects(()=>call([change],state.revision));
await assert.rejects(()=>call([{action:'update',id,benefit:'PERCENT_OFF',value:30},{action:'add',id,sku:'missing',benefit:'PERCENT_OFF',value:5}],state.revision));
assert.equal((await call()).revision,state.revision); // rollback completo
const foreign=(await call(null,null,'1103')).rows[0].id;
await assert.rejects(()=>call([{action:'remove',id:foreign}],state.revision),/pertenece/);
await db.exec("set test.admin='no'"); await assert.rejects(()=>call(),/administradores/); await db.exec("set test.admin='yes'");
await db.exec("insert into promotion_deal_configs values ('P','O','1104','{\"kind\":\"KIT\"}')");
await assert.rejects(()=>call(),/especial/); await db.exec('delete from promotion_deal_configs');
await call([{action:'remove',id:state.rows.find(r=>r.sku==='B').id}],state.revision);
assert.equal((await call()).rows.length,1);
await db.exec("update offer_rules set offer_type='KIT_OFFER' where segment='1104'"); await assert.rejects(()=>call(),/simples/);
// Igual que publicación actual: reconstruir reglas reemplaza ediciones sin reintroducirlas.
await db.exec("delete from offer_rules where segment='1104'; insert into offer_rules(external_offer_id,promotion_id,offer_type,sku,segment,discount_type,discount_percent) values ('O','P','LINE_ITEM_DISCOUNT','A','1104','PERCENT_OFF',25)");
assert.equal((await call()).rows[0].discount_percent,25);
assert.equal(Number((await db.query('select count(*) n from manual_offer_edit_audit')).rows[0].n),2);
await db.exec('set role authenticated'); await assert.rejects(()=>db.exec('delete from manual_offer_edit_audit'),/permission denied/); await db.exec('reset role');
await db.close(); console.log('Manual offers SQL passed: migration, edits, additions, removals, scope, validation, rollback, concurrency, roles, audit and report replacement.');
