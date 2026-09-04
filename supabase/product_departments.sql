create table if not exists public.product_departments (
  department_id text primary key,
  department_name text not null default '',
  division_id text not null default '',
  division_name text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.product_departments add column if not exists department_name text default '';
alter table public.product_departments add column if not exists division_id text default '';
alter table public.product_departments add column if not exists division_name text default '';
alter table public.product_departments add column if not exists updated_at timestamptz default now();

alter table public.products add column if not exists department_id text;

create index if not exists products_department_id_idx
on public.products (department_id);

create index if not exists product_departments_division_id_idx
on public.product_departments (division_id);

insert into public.product_departments (
  division_id,
  division_name,
  department_id,
  department_name,
  updated_at
)
values
  ($$11$$, $$Acabados$$, $$60$$, $$Listelos y Cenefas$$, now()),
  ($$12$$, $$Construccion$$, $$61$$, $$Aceros y Metales$$, now()),
  ($$12$$, $$Construccion$$, $$62$$, $$Fibro Cemento y Similares$$, now()),
  ($$1$$, $$Electrico$$, $$1$$, $$Cables Media y Alta Tension$$, now()),
  ($$1$$, $$Electrico$$, $$2$$, $$Postes$$, now()),
  ($$1$$, $$Electrico$$, $$3$$, $$Transformadores$$, now()),
  ($$1$$, $$Electrico$$, $$4$$, $$Accesorios Media Tension$$, now()),
  ($$1$$, $$Electrico$$, $$5$$, $$Cables Baja Tension$$, now()),
  ($$1$$, $$Electrico$$, $$6$$, $$Paneles y Breakers$$, now()),
  ($$1$$, $$Electrico$$, $$7$$, $$Accesorios Electricos$$, now()),
  ($$1$$, $$Electrico$$, $$8$$, $$Tubos y Accesorios$$, now()),
  ($$1$$, $$Electrico$$, $$9$$, $$Control y automatizacion$$, now()),
  ($$1$$, $$Electrico$$, $$10$$, $$Equipos de medicion y Proteccion Electrica$$, now()),
  ($$2$$, $$Telecom$$, $$11$$, $$Audio y video$$, now()),
  ($$2$$, $$Telecom$$, $$12$$, $$Seguridad y vigilancia$$, now()),
  ($$2$$, $$Telecom$$, $$13$$, $$Dispositivos Activos$$, now()),
  ($$2$$, $$Telecom$$, $$14$$, $$Dispositivos Pasivos$$, now()),
  ($$7$$, $$Plomeria$$, $$29$$, $$Tuberia Canoas y Accesorios$$, now()),
  ($$7$$, $$Plomeria$$, $$30$$, $$Pantry-Accesorios$$, now()),
  ($$7$$, $$Plomeria$$, $$31$$, $$Griferia- Duchas$$, now()),
  ($$7$$, $$Plomeria$$, $$32$$, $$Calentadores de Agua y Accesorios$$, now()),
  ($$7$$, $$Plomeria$$, $$33$$, $$Tanques de Agua y Accesorios$$, now()),
  ($$8$$, $$Pintura$$, $$34$$, $$Arquitectonicos$$, now()),
  ($$8$$, $$Pintura$$, $$35$$, $$Especialidades$$, now()),
  ($$8$$, $$Pintura$$, $$36$$, $$Industrial$$, now()),
  ($$8$$, $$Pintura$$, $$37$$, $$Herramientas y Complementos para Pintar$$, now()),
  ($$8$$, $$Pintura$$, $$38$$, $$Dilusion$$, now()),
  ($$8$$, $$Pintura$$, $$39$$, $$Adhesivos$$, now()),
  ($$9$$, $$Automotriz$$, $$40$$, $$Llantas$$, now()),
  ($$9$$, $$Automotriz$$, $$41$$, $$Baterias$$, now()),
  ($$9$$, $$Automotriz$$, $$42$$, $$Limpieza -Aditivos y Lubricantes$$, now()),
  ($$9$$, $$Automotriz$$, $$43$$, $$Herramientas-Accesorios$$, now()),
  ($$10$$, $$Vida Exterior$$, $$44$$, $$Muebles$$, now()),
  ($$10$$, $$Vida Exterior$$, $$45$$, $$Camping$$, now()),
  ($$10$$, $$Vida Exterior$$, $$46$$, $$Infables$$, now()),
  ($$10$$, $$Vida Exterior$$, $$47$$, $$Deportes$$, now()),
  ($$10$$, $$Vida Exterior$$, $$48$$, $$Mascotas$$, now()),
  ($$10$$, $$Vida Exterior$$, $$49$$, $$Jardin Riego y Accesorios$$, now()),
  ($$10$$, $$Vida Exterior$$, $$50$$, $$Quimicos y accesorios$$, now()),
  ($$10$$, $$Vida Exterior$$, $$51$$, $$Maquinarias y Accesorios$$, now()),
  ($$10$$, $$Vida Exterior$$, $$52$$, $$Herramientas Agricolas$$, now()),
  ($$11$$, $$Acabados$$, $$53$$, $$Ceramica$$, now()),
  ($$11$$, $$Acabados$$, $$54$$, $$Porcelanato$$, now()),
  ($$11$$, $$Acabados$$, $$55$$, $$Cuarzo y granito$$, now()),
  ($$11$$, $$Acabados$$, $$56$$, $$Imitacion de piedras$$, now()),
  ($$11$$, $$Acabados$$, $$57$$, $$Pegamentos y accesorios$$, now()),
  ($$11$$, $$Acabados$$, $$58$$, $$Fraguas$$, now()),
  ($$11$$, $$Acabados$$, $$59$$, $$Vidrio$$, now()),
  ($$5$$, $$Herramientas$$, $$23$$, $$Seguridad Industrial$$, now()),
  ($$5$$, $$Herramientas$$, $$24$$, $$Maquinarias para Construccion$$, now()),
  ($$6$$, $$Ferreteria$$, $$25$$, $$Herrajes$$, now()),
  ($$6$$, $$Ferreteria$$, $$26$$, $$Tornilleria$$, now()),
  ($$6$$, $$Ferreteria$$, $$27$$, $$Cerraduras y Seguridad$$, now()),
  ($$6$$, $$Ferreteria$$, $$28$$, $$Cadenas, Mecates y Accesorios$$, now()),
  ($$13$$, $$Hogar$$, $$75$$, $$Cortinas y Accesorios$$, now()),
  ($$13$$, $$Hogar$$, $$76$$, $$Alfombras$$, now()),
  ($$13$$, $$Hogar$$, $$77$$, $$Complementos Decorativos$$, now()),
  ($$13$$, $$Hogar$$, $$78$$, $$Articulos de Oficina$$, now()),
  ($$13$$, $$Hogar$$, $$79$$, $$Hoteleria$$, now()),
  ($$13$$, $$Hogar$$, $$80$$, $$Navidad$$, now()),
  ($$14$$, $$Electrodomesticos$$, $$81$$, $$Linea Blanca$$, now()),
  ($$14$$, $$Electrodomesticos$$, $$82$$, $$Linea Marron$$, now()),
  ($$14$$, $$Electrodomesticos$$, $$83$$, $$Electrodomesticos Pequeños$$, now()),
  ($$15$$, $$Baño$$, $$84$$, $$Muebles Para Baño$$, now()),
  ($$15$$, $$Baño$$, $$85$$, $$Sanitarios-Lavamanos-Accesorios$$, now()),
  ($$15$$, $$Baño$$, $$86$$, $$Bañeras y Jacuzzys$$, now()),
  ($$15$$, $$Baño$$, $$87$$, $$Puertas de Baño$$, now()),
  ($$15$$, $$Baño$$, $$88$$, $$Accesorio y textil para baños$$, now()),
  ($$15$$, $$Baño$$, $$89$$, $$Institucional$$, now()),
  ($$15$$, $$Baño$$, $$90$$, $$Organizacion$$, now()),
  ($$16$$, $$Limpieza$$, $$91$$, $$Quimicos y Accesorios$$, now()),
  ($$17$$, $$Servicios$$, $$92$$, $$Servicios de Ingenieria$$, now()),
  ($$17$$, $$Servicios$$, $$93$$, $$Servicios Financieros$$, now()),
  ($$17$$, $$Servicios$$, $$94$$, $$Copias de Llaves$$, now()),
  ($$17$$, $$Servicios$$, $$95$$, $$Renta de equipos$$, now()),
  ($$17$$, $$Servicios$$, $$96$$, $$Repuestos$$, now()),
  ($$5$$, $$Herramientas$$, $$22$$, $$Equipos Electricos-Combustion-Accesorios$$, now()),
  ($$13$$, $$Hogar$$, $$97$$, $$Articulos para Bebe$$, now()),
  ($$15$$, $$Baño$$, $$114$$, $$Accesorios para Sanitarios$$, now()),
  ($$1$$, $$Electrico$$, $$120$$, $$MEDICION ELECTRICA Y PROTECCION$$, now()),
  ($$7$$, $$Plomeria$$, $$123$$, $$Llaves$$, now()),
  ($$7$$, $$Plomeria$$, $$124$$, $$Valvulas$$, now()),
  ($$7$$, $$Plomeria$$, $$125$$, $$DUCHAS ELECTRICAS Y ACCESORIOS$$, now()),
  ($$17$$, $$Servicios$$, $$99$$, $$Taller de Servicio$$, now()),
  ($$17$$, $$Servicios$$, $$234$$, $$Servicios de iluminacion residencial$$, now()),
  ($$17$$, $$Servicios$$, $$233$$, $$Maestros$$, now()),
  ($$15$$, $$Baño$$, $$130$$, $$Espejos y Gabinetes$$, now()),
  ($$9$$, $$Automotriz$$, $$221$$, $$Servicio de Llanta$$, now()),
  ($$12$$, $$Construccion$$, $$112$$, $$Aislantes para la Construccion$$, now()),
  ($$12$$, $$Construccion$$, $$156$$, $$Aditivos Ceramicos$$, now()),
  ($$10$$, $$Vida Exterior$$, $$98$$, $$Maceteras y Accesorios$$, now()),
  ($$9$$, $$Automotriz$$, $$170$$, $$Conos de Seguridad$$, now()),
  ($$9$$, $$Automotriz$$, $$180$$, $$Equipos de Limpieza y Accesorios$$, now()),
  ($$14$$, $$Electrodomesticos$$, $$127$$, $$Extractores de Grasa$$, now()),
  ($$17$$, $$Servicios$$, $$222$$, $$Servicio de Transporte$$, now()),
  ($$17$$, $$Servicios$$, $$223$$, $$Servicio y Suministro de iluminacion$$, now()),
  ($$17$$, $$Servicios$$, $$224$$, $$Servicio Financiero$$, now()),
  ($$17$$, $$Servicios$$, $$225$$, $$Servicio Instalacion de  Pantry y Granito$$, now()),
  ($$17$$, $$Servicios$$, $$226$$, $$Servicio Residencial$$, now()),
  ($$17$$, $$Servicios$$, $$227$$, $$Servicios de Media Tension$$, now()),
  ($$17$$, $$Servicios$$, $$228$$, $$Servicios de Pinturas$$, now()),
  ($$17$$, $$Servicios$$, $$229$$, $$Servicios Mantenimiento$$, now()),
  ($$17$$, $$Servicios$$, $$200$$, $$Repuestos para maquinaria$$, now()),
  ($$3$$, $$Iluminacion$$, $$15$$, $$Iluminacion Residencial$$, now()),
  ($$1$$, $$Electrico$$, $$230$$, $$Herramientas Media Tension$$, now()),
  ($$1$$, $$Electrico$$, $$231$$, $$Cable Acero y Aluminio$$, now()),
  ($$1$$, $$Electrico$$, $$232$$, $$Accesorios Baja Tension$$, now()),
  ($$16$$, $$Limpieza$$, $$116$$, $$Basureros$$, now()),
  ($$12$$, $$Construccion$$, $$155$$, $$Fijacion y Tornilleria$$, now()),
  ($$6$$, $$Ferreteria$$, $$160$$, $$Grillete Ferreteria$$, now()),
  ($$6$$, $$Ferreteria$$, $$161$$, $$Seguridad$$, now()),
  ($$16$$, $$Limpieza$$, $$118$$, $$Institucional Limpieza$$, now()),
  ($$16$$, $$Limpieza$$, $$117$$, $$Cuido Personal$$, now()),
  ($$5$$, $$Herramientas$$, $$129$$, $$Herramientas para Trabajo Manual$$, now()),
  ($$13$$, $$Hogar$$, $$131$$, $$Muebles para Cocina$$, now()),
  ($$15$$, $$Baño$$, $$150$$, $$Secadores de Mano$$, now()),
  ($$10$$, $$Vida Exterior$$, $$126$$, $$Decorativos para Jardin$$, now()),
  ($$5$$, $$Herramientas$$, $$128$$, $$Tapes para Ductos y Reflectivos$$, now()),
  ($$17$$, $$Servicios$$, $$220$$, $$Servicio Corte Madera$$, now()),
  ($$17$$, $$Servicios$$, $$235$$, $$Servicios ferreteria$$, now()),
  ($$12$$, $$Construccion$$, $$63$$, $$Gypsum$$, now()),
  ($$12$$, $$Construccion$$, $$64$$, $$Madera y Derivados$$, now()),
  ($$12$$, $$Construccion$$, $$65$$, $$Puertas Y Ventanas$$, now()),
  ($$12$$, $$Construccion$$, $$66$$, $$Covintec$$, now()),
  ($$5$$, $$Herramientas$$, $$67$$, $$Escaleras-carreterillas y accesorios$$, now()),
  ($$12$$, $$Construccion$$, $$68$$, $$Cementos Aditivos$$, now()),
  ($$13$$, $$Hogar$$, $$69$$, $$Cocina$$, now()),
  ($$13$$, $$Hogar$$, $$70$$, $$Comedor$$, now()),
  ($$13$$, $$Hogar$$, $$71$$, $$Dormitorio$$, now()),
  ($$13$$, $$Hogar$$, $$72$$, $$Closet$$, now()),
  ($$13$$, $$Hogar$$, $$73$$, $$Check Out$$, now()),
  ($$13$$, $$Hogar$$, $$74$$, $$Muebles Interior$$, now()),
  ($$3$$, $$Iluminacion$$, $$16$$, $$Iluminacion Comercial$$, now()),
  ($$4$$, $$Ventilacion$$, $$17$$, $$Abanicos$$, now()),
  ($$4$$, $$Ventilacion$$, $$18$$, $$Aires Acondicionados$$, now()),
  ($$4$$, $$Ventilacion$$, $$19$$, $$Evaporadores-Extractores de Aire-Dehumificadores$$, now()),
  ($$5$$, $$Herramientas$$, $$20$$, $$Herramientas Manuales$$, now()),
  ($$5$$, $$Herramientas$$, $$21$$, $$Herramientas Electricas y Accesorios$$, now())
on conflict (department_id) do update
set
  department_name = excluded.department_name,
  division_id = excluded.division_id,
  division_name = excluded.division_name,
  updated_at = excluded.updated_at;

alter table public.product_departments enable row level security;

drop policy if exists "product_departments_read_for_quotes" on public.product_departments;
drop policy if exists "product_departments_admin_write" on public.product_departments;

create policy "product_departments_read_for_quotes" on public.product_departments
for select to authenticated using (true);

create policy "product_departments_admin_write" on public.product_departments
for all to authenticated using (public.is_admin()) with check (public.is_admin());
