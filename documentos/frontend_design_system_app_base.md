# Guia frontend base para nueva app

Este documento sirve como especificacion visual y de experiencia para crear una app nueva desde cero reutilizando el estilo frontend de esta aplicacion, pero sin heredar su logica de negocio.

La nueva app debe sentirse como parte de la misma familia: corporativa, sobria, moderna, productiva y facil de operar en escritorio y movil.

## Objetivo

Construir una aplicacion web operativa con una interfaz limpia, profesional y orientada a productividad.

La logica de negocio, entidades, permisos, flujos y persistencia pueden cambiar completamente. Lo que debe conservarse es el lenguaje visual:

- Navegacion lateral en escritorio.
- Navegacion inferior en movil.
- Fondo claro con leve tinte azul en la parte superior.
- Tarjetas blancas con borde suave y sombra discreta.
- Botones con iconos.
- Formularios compactos.
- Tablas densas, escaneables y con encabezados fijos.
- Metricas superiores para resumen operativo.
- Estados visuales claros: listo, advertencia, error, activo, resuelto, archivado.

## Filosofia UX/UI

- Priorizar productividad sobre decoracion.
- Usar densidad moderada: la app debe permitir escanear mucha informacion sin sentirse saturada.
- Evitar estilo de landing page, hero comercial o composiciones decorativas.
- Usar textos breves, directos y operativos.
- Hacer que la primera pantalla sea util de inmediato.
- Mantener controles previsibles: botones para acciones, selects para opciones, inputs para busqueda, tabs para vistas.
- Usar iconos de `lucide-react` en acciones principales.
- Evitar elementos puramente ornamentales.

## Stack recomendado

- React + Vite.
- CSS plano global o CSS modules, segun preferencia del nuevo proyecto.
- `lucide-react` para iconos.
- Componentes base simples: `Header`, `Button`, `Card`, `CardContent`, `Metric`.
- Mantener el diseno desacoplado de la logica de negocio.

## Paleta

Usar estos colores como base:

```css
:root {
  --color-text: #0f172a;
  --color-heading: #1e293b;
  --color-muted: #64748b;
  --color-border: #e5e7eb;
  --color-border-strong: #cbd5e1;
  --color-page: #f8fafc;
  --color-surface: #ffffff;

  --color-primary: #005baa;
  --color-primary-dark: #003f7d;
  --color-primary-soft: #eaf4ff;
  --color-accent: #00a6c8;
  --color-warning: #ffc72c;

  --color-success-text: #047857;
  --color-success-bg: #ecfdf5;
  --color-warning-text: #854d0e;
  --color-warning-bg: #fef3c7;
  --color-error-text: #b91c1c;
  --color-error-bg: #fef2f2;
}
```

Reglas de uso:

- Azul principal para acciones primarias, marca y estados activos. Esta division del negocio usa azul como color de marca; no cambiarlo a verde salvo que cambie la identidad visual aprobada.
- Azul suave para seleccionados, hover de filas y superficies activas.
- Celeste para acentos secundarios, foco y barras laterales activas.
- Verde solo para estados positivos, confirmaciones y exito; no usarlo como color principal de marca en esta app.
- Amarillo para advertencias no bloqueantes.
- Rojo solo para errores, acciones destructivas o fallos.
- No dominar la interfaz con un solo tono; balancear con blancos, grises y estados.

## Tipografia

Usar fuentes de sistema con preferencia por Aptos/Segoe UI:

```css
:root {
  --font-body: "Aptos", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
  --font-heading: "Segoe UI Variable Display", "Aptos Display", "Aptos", "Segoe UI", system-ui, sans-serif;
  --weight-regular: 400;
  --weight-medium: 500;
  --weight-strong: 650;
  --weight-bold: 700;
}
```

Jerarquia recomendada:

- H1 de pagina: 1.85rem desktop, 1.5rem movil.
- Titulos de seccion: 1rem a 1.125rem.
- Texto normal: 0.875rem.
- Metadatos y ayudas: 0.72rem a 0.8rem.
- No usar letter-spacing negativo.
- No escalar texto con ancho de viewport.

## Layout general

### App desktop

La app debe usar un layout lateral:

```css
.app {
  display: flex;
  min-height: 100vh;
  color: var(--color-text);
  background:
    linear-gradient(180deg, #eef6ff 0, var(--color-page) 13rem),
    var(--color-page);
}

main {
  flex: 1;
  min-width: 0;
  padding: 1.5rem;
}
```

### Sidebar

La navegacion lateral debe:

- Medir aproximadamente `16rem`.
- Poder colapsar a `5rem`.
- Tener fondo blanco, borde derecho y sombra muy suave.
- Mostrar marca arriba.
- Mostrar botones con icono + etiqueta.
- Marcar el item activo con fondo azul claro, texto azul oscuro y una barra celeste interna.

Patron visual:

```css
.sidebar {
  display: flex;
  flex: 0 0 16rem;
  flex-direction: column;
  width: 16rem;
  min-height: 100vh;
  background: #ffffff;
  border-right: 1px solid var(--color-border);
  box-shadow: 8px 0 24px rgba(15, 23, 42, 0.04);
}

.sidebar nav button.active {
  color: var(--color-primary-dark);
  background: var(--color-primary-soft);
  font-weight: var(--weight-medium);
  box-shadow: inset 3px 0 0 var(--color-accent);
}
```

### Mobile

En pantallas menores a `900px`:

- Ocultar sidebar.
- Usar navegacion inferior fija.
- Dejar padding inferior en `main` para que el contenido no quede tapado.
- Mostrar maximo 4 items primarios y un menu "Mas" para overflow.

## Componentes base

Crear componentes simples y reutilizables.

```jsx
export function Header({ title, subtitle }) {
  return (
    <div className="header">
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  );
}

export function Button({ children, className = "", variant = "default", ...props }) {
  return (
    <button className={`btn ${variant === "outline" ? "btn-outline" : "btn-primary"} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Card({ children, className = "" }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function CardContent({ children, className = "" }) {
  return <div className={className}>{children}</div>;
}

export function Metric({ title, value, icon: Icon }) {
  return (
    <Card>
      <CardContent className="metric">
        <div>
          <p>{title}</p>
          <strong>{value}</strong>
        </div>
        <div className="metric-icon"><Icon size={20} /></div>
      </CardContent>
    </Card>
  );
}
```

## Header de pagina

```css
.header {
  margin-bottom: 1.25rem;
}

.header h1 {
  margin: 0;
  font-family: var(--font-heading);
  color: var(--color-text);
  font-size: 1.85rem;
  line-height: 2.25rem;
  font-weight: var(--weight-strong);
}

.header p {
  margin: 0.25rem 0 0;
  color: var(--color-muted);
  font-size: 0.9rem;
  line-height: 1.35rem;
}
```

Uso:

- Titulo directo del modulo.
- Subtitulo breve que diga que se hace ahi.
- No usar textos largos ni instrucciones extensas.

## Tarjetas

```css
.card {
  overflow: hidden;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 1.25rem;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.07);
}

.card > div {
  padding: 1rem;
}
```

Reglas:

- Usar tarjetas para paneles, formularios, filtros, metricas, listas y tablas.
- No meter tarjetas dentro de tarjetas salvo en casos muy justificados.
- Las secciones grandes pueden ser layouts sin tarjeta si ya tienen contenedores internos.

## Botones

```css
.btn {
  display: inline-flex;
  min-height: 2.5rem;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: 1px solid transparent;
  border-radius: 0.9rem;
  padding: 0.55rem 0.95rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}

.btn-primary {
  color: #ffffff;
  background: var(--color-primary);
}

.btn-primary:hover {
  background: var(--color-primary-dark);
}

.btn-outline {
  color: #334155;
  background: #ffffff;
  border-color: #e2e8f0;
}

.btn-outline:hover {
  background: #f8fafc;
}

.btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
```

Reglas:

- Boton primario para la accion principal del modulo.
- Boton outline para acciones secundarias.
- Acciones destructivas deben usar rojo o pedir confirmacion.
- Acciones que crean registros oficiales, asignan consecutivos o cambian estados de negocio deben tener una accion secundaria de borrador/vista previa cuando aplique y pedir confirmacion antes de ejecutarse.
- Usar iconos de `lucide-react` dentro de botones.
- No usar botones enormes; mantener la UI compacta.

## Formularios

```css
.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field > span,
.filter-field span {
  color: var(--color-muted);
  font-size: 0.72rem;
  line-height: 1rem;
}

input,
select,
textarea {
  width: 100%;
  min-height: 2.25rem;
  padding: 0.6rem 0.8rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.9rem;
  color: var(--color-text);
  background: #ffffff;
  font-size: 0.875rem;
  line-height: 1.25rem;
  outline: 0;
}

textarea {
  min-height: 5rem;
  resize: vertical;
}

.readonly {
  margin-top: 0.25rem;
  padding: 0.75rem;
  border-radius: 0.9rem;
  color: var(--color-primary-dark);
  background: var(--color-primary-soft);
  font-size: 0.875rem;
  line-height: 1.25rem;
}

.btn:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible,
button:focus-visible {
  outline: 2px solid rgba(0, 166, 200, 0.35);
  outline-offset: 2px;
}
```

Reglas:

- Formularios en grillas de `repeat(auto-fit, minmax(14rem, 1fr))`.
- Labels cortos.
- Ayudas y errores cerca del campo.
- Usar `readonly` para informacion contextual no editable.

## Toolbars y filtros

```css
.toolbar,
.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.625rem;
  flex-wrap: wrap;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
  gap: 0.7rem;
}

.search {
  position: relative;
}

.search svg {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  color: #94a3b8;
  transform: translateY(-50%);
  pointer-events: none;
}

.search input {
  width: min(16rem, 100%);
  padding-left: 2.25rem;
}
```

Reglas:

- Acciones arriba a la derecha en desktop.
- En movil, acciones a ancho completo si hace falta.
- Filtros se aplican con boton "Buscar" cuando las consultas pueden ser costosas.
- Usar "Limpiar" para resetear filtros.

## Metricas

```css
.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1.15rem;
  margin-bottom: 1.25rem;
}

.metric {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 6rem;
  border-top: 4px solid var(--color-primary);
}

.metric p {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.75rem;
}

.metric strong {
  display: block;
  margin-top: 0.25rem;
  font-family: var(--font-heading);
  color: var(--color-text);
  font-size: 1.85rem;
  line-height: 2rem;
  font-weight: var(--weight-strong);
}

.metric-icon {
  display: flex;
  width: 2.5rem;
  height: 2.5rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}
```

Reglas:

- Usar 3 o 4 metricas por modulo.
- Las metricas deben resumir el estado operativo, no decorar.
- En movil pasar a 1 columna.

## Tablas

```css
.grid-card > div {
  padding: 0;
}

.grid-card .toolbar {
  margin: 0;
  padding: 1.15rem 1.25rem;
  border-bottom: 1px solid var(--color-border);
  background: #ffffff;
}

.table-wrap {
  max-height: 560px;
  overflow: auto;
}

table {
  width: 100%;
  min-width: 1120px;
  border-collapse: collapse;
  color: var(--color-text);
  font-size: 0.875rem;
  line-height: 1.25rem;
}

th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 0.75rem;
  color: #475569;
  background: #f1f5f9;
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: var(--weight-regular);
  text-align: left;
  white-space: nowrap;
}

td {
  padding: 0.65rem;
  border-top: 1px solid var(--color-border);
  vertical-align: top;
}

tbody tr:nth-child(odd) {
  background: #f8fafc;
}

tbody tr:nth-child(even) {
  background: #ffffff;
}

tbody tr:hover {
  background: var(--color-primary-soft) !important;
}
```

Reglas:

- Tablas para datos operativos densos.
- Encabezado fijo.
- Scroll horizontal permitido.
- Hover con azul suave.
- Columnas clave pueden ser sticky si el flujo lo necesita.
- Mantener botones de fila como icon buttons compactos.

## Estados, pills y badges

```css
.pill,
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: 999px;
  padding: 0.25rem 0.5rem;
  color: #475569;
  background: #f1f5f9;
  font-size: 0.75rem;
  line-height: 1rem;
  white-space: nowrap;
}

.pill.green,
.status-success {
  color: var(--color-success-text);
  background: var(--color-success-bg);
}

.pill.yellow,
.status-warning {
  color: var(--color-warning-text);
  background: var(--color-warning-bg);
}

.status-error {
  color: var(--color-error-text);
  background: var(--color-error-bg);
}
```

Reglas:

- Estados positivos en verde.
- Advertencias en amarillo.
- Errores en rojo.
- Archivado/inactivo en gris.
- Usar textos cortos: `Activo`, `Pendiente`, `En revision`, `Finalizado`, `Archivado`.

## Modales y confirmaciones

```css
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.42);
  backdrop-filter: blur(4px);
}

.modal-card {
  width: min(34rem, 100%);
  border: 1px solid #dbe7e1;
  border-radius: 1.25rem;
  background: #ffffff;
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.22);
}

.modal-head,
.modal-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.15rem;
}

.modal-head {
  border-bottom: 1px solid var(--color-border);
}

.modal-body {
  display: grid;
  gap: 0.85rem;
  padding: 1rem 1.15rem;
}
```

Reglas:

- Confirmar acciones destructivas.
- Confirmar acciones irreversibles o semirreversibles, como emitir cotizaciones oficiales, asignar consecutivos, publicar datos o reemplazar bases.
- Explicar impacto en una frase breve.
- Boton secundario a la izquierda, accion principal a la derecha.
- Evitar modales para tareas que pueden resolverse inline.

## Icon buttons

```css
.icon-btn {
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  align-items: center;
  justify-content: center;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  color: #475569;
  background: #ffffff;
  cursor: pointer;
}

.icon-btn:hover {
  color: var(--color-primary);
  background: #f8fafc;
}
```

Usar para cerrar, editar, eliminar, expandir, colapsar, refrescar y acciones de fila.

## Estructura recomendada de archivos

```text
src/
  app/
    shell/
      AppShell.jsx
      MobileNav.jsx
  components/
    ui.jsx
    AppFeedback.jsx
  constants/
    navigation.js
    permissions.js
  features/
    modulo-a/
    modulo-b/
  hooks/
  services/
  styles.css
  App.jsx
  main.jsx
```

La nueva logica de negocio debe vivir en `features/` y `services/`. Los componentes base visuales deben mantenerse genericos.

## Patron de pantalla

Cada modulo deberia seguir esta composicion:

```jsx
export function ExamplePage() {
  return (
    <div>
      <Header
        title="Nombre del modulo"
        subtitle="Descripcion operativa breve del modulo."
      />

      <div className="metrics">
        <Metric title="Pendientes" value={12} icon={Clock3} />
        <Metric title="Aprobados" value={8} icon={CheckCircle2} />
        <Metric title="Alertas" value={3} icon={AlertTriangle} />
        <Metric title="Total" value={23} icon={ListChecks} />
      </div>

      <Card className="consolidado-filter-card">
        <CardContent>
          <div className="section-head">
            <div>
              <h2>Filtros</h2>
              <span>Presione Buscar para cargar</span>
            </div>
            <div className="toolbar-actions">
              <Button variant="outline"><Search size={16} /> Buscar</Button>
              <Button variant="outline"><X size={16} /> Limpiar</Button>
              <Button><Save size={16} /> Guardar</Button>
            </div>
          </div>
          <div className="filter-grid">
            <label className="filter-field">
              <span>Busqueda</span>
              <input placeholder="Buscar" />
            </label>
          </div>
        </CardContent>
      </Card>

      <Card className="grid-card">
        <CardContent>
          <div className="toolbar">
            <div>
              <h2>Base operativa</h2>
              <p>Datos principales del modulo.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>{/* filas */}</table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

## Responsive

```css
@media (max-width: 1100px) {
  .metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .app {
    display: block;
  }

  .sidebar {
    display: none;
  }

  main {
    padding: 1rem 1rem 5rem;
  }

  .toolbar,
  .section-head {
    align-items: stretch;
    flex-direction: column;
  }

  .toolbar-actions,
  .toolbar-actions .btn,
  .toolbar-actions select,
  .search,
  .search input {
    width: 100%;
  }
}

@media (max-width: 640px) {
  .metrics {
    grid-template-columns: 1fr;
  }

  .header h1 {
    font-size: 1.5rem;
  }
}
```

## Reglas de contenido

- Titulos claros y literales.
- Subtitulos cortos.
- Etiquetas de campo de 1 a 3 palabras cuando sea posible.
- Mensajes de error accionables.
- Estados de carga visibles.
- Empty states simples: "No hay datos con esos filtros."
- Evitar explicar dentro de la UI funciones evidentes.

## Do

- Usar iconos en botones.
- Usar tablas para trabajo repetitivo y escaneable.
- Mantener filtros compactos.
- Usar tarjetas para separar herramientas.
- Usar feedback inmediato al guardar, cargar o fallar.
- Mantener consistencia de spacing y radios.

## Don't

- No crear landing pages para apps operativas.
- No usar heroes decorativos.
- No usar gradientes morados o azules saturados dominantes; el azul de marca debe sentirse sobrio y funcional, no decorativo.
- No llenar la UI con tarjetas anidadas.
- No poner texto largo de instrucciones dentro de la pantalla.
- No ocultar errores importantes en consola.
- No usar colores de estado sin texto.

## Prompt sugerido para iniciar el nuevo proyecto

Puedes pasar este bloque a Codex o a otro asistente junto con este archivo:

```text
Quiero crear una nueva app web desde cero con React + Vite.

Usa la guia `frontend_design_system_app_base.md` como contrato visual.
La nueva app NO debe reutilizar la logica de promociones ni sus entidades.
Debe conservar el mismo estilo frontend: sidebar desktop, mobile nav inferior, tarjetas blancas, fondo claro con tinte azul, botones con lucide-react, formularios compactos, metricas superiores, filtros y tablas operativas.

Antes de implementar:
1. Define modulos segun la nueva logica de negocio.
2. Crea componentes base genericos.
3. Crea `styles.css` con los tokens y patrones de esta guia.
4. Implementa una primera pantalla funcional, no una landing page.
5. Mantener el codigo simple y preparado para cambiar persistencia despues.
```

## Checklist de aceptacion visual

- La app se ve corporativa y sobria.
- Desktop tiene sidebar y contenido principal con padding.
- Movil tiene navegacion inferior y contenido sin solaparse.
- Las tarjetas tienen borde, radio y sombra suave.
- Los botones primarios son azules y cumplen contraste sobre fondo blanco.
- Los estados activos usan azul suave y acento celeste.
- Las tablas tienen encabezados fijos, zebra striping y hover azul suave.
- Los formularios se ven compactos y consistentes.
- No hay elementos decorativos innecesarios.
- La UI sigue siendo util aunque cambie completamente la logica de negocio.
