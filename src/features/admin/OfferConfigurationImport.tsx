import { useMemo, useRef, useState } from "react";
import { Download, Info, Upload } from "lucide-react";
import { utils, writeFile } from "xlsx";
import { Button } from "../../components/ui";
import { parseOfferConfigurationFile } from "../../services/importers";
import type { OfferDetail } from "../../services/offerConfiguration";
import { submitOfferDetails, type ConfigurationPreview } from "../../services/offerConfigurationStore";
import { supabase } from "../../services/supabase";
import "./offer-configuration.css";

export async function downloadConfigurationTemplate(rows: OfferDetail[] = []) {
  const sheet = utils.aoa_to_sheet([
    ["TIPO (ignorado)", "Id de oferta", "SET", "ITEM", "Umbral", "Cantidad", "VALID (ignorado)"],
    ...rows.map(row => ["", row.offer_id, row.set_id ? `SET ${row.set_id}` : "", row.sku, row.threshold_type === "EXACT" ? "Exacto" : "Mínimo", row.quantity, ""]),
  ]);
  sheet["!cols"] = [22, 18, 15, 20, 16, 14, 20].map(wch => ({ wch }));
  const book = utils.book_new();
  utils.book_append_sheet(book, sheet, "Configuraciones");
  writeFile(book, "configuraciones_ofertas.xlsx");
}

export type RowValidationInfo = {
  status: "pending" | "valid" | "error";
  message?: string;
};

export function OfferConfigurationImport({ onSaved }: { onSaved: () => void }) {
  const [rows, setRows] = useState<OfferDetail[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<ConfigurationPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [filename, setFilename] = useState("");
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(0);
  const [parseValid, setParseValid] = useState(false);
  const [validationMap, setValidationMap] = useState<Map<number, RowValidationInfo>>(new Map());
  const [isValidated, setIsValidated] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | "error" | "valid">("all");
  const fileInput = useRef<HTMLInputElement>(null);

  async function load(file?: File) {
    if (!file) return;
    setBusy(true);
    setRows([]);
    setErrors([]);
    setPreview(null);
    setMessage("");
    setFilename(file.name);
    setPage(0);
    setParseValid(false);
    setValidationMap(new Map());
    setIsValidated(false);
    setFilterStatus("all");

    try {
      const result = await parseOfferConfigurationFile(file);
      setRows(result.rows);
      setErrors(result.errors);
      setParseValid(result.errors.length === 0 && result.rows.length > 0);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "No se pudo leer el archivo."]);
    } finally {
      setBusy(false);
    }
  }

  async function validateOrSave(save = false) {
    if (!parseValid || (save && !preview)) return;
    if (!supabase) { setErrors(["Supabase no está configurado."]); return; }
    setBusy(true);
    setErrors([]);
    setMessage("");

    if (!save) {
      // Validar cada fila contra la base de datos (offer_rules)
      try {
        const offerIds = [...new Set(rows.map(r => r.offer_id.trim()).filter(Boolean))];
        const dbRules: { external_offer_id: string; sku: string; offer_type: string; is_active: boolean }[] = [];

        // Consultar en bloques de 100 para evitar URLs largas
        for (let i = 0; i < offerIds.length; i += 100) {
          const chunk = offerIds.slice(i, i + 100);
          const { data, error } = await supabase
            .from("offer_rules")
            .select("external_offer_id,sku,offer_type,is_active")
            .in("external_offer_id", chunk)
            .eq("is_active", true);

          if (error) throw new Error(`Error consultando la base de datos: ${error.message}`);
          if (data) dbRules.push(...data);
        }

        const rulesByOffer = new Map<string, { skus: Set<string>; isKit: boolean }>();
        for (const rule of dbRules) {
          const offerId = rule.external_offer_id?.trim() ?? "";
          const sku = rule.sku?.trim() ?? "";
          const isKit = rule.offer_type === "KIT_OFFER";
          const existing = rulesByOffer.get(offerId);
          if (existing) {
            existing.skus.add(sku);
            if (isKit) existing.isKit = true;
          } else {
            rulesByOffer.set(offerId, { skus: new Set([sku]), isKit });
          }
        }

        const fileSkusByOffer = new Map<string, Set<string>>();
        for (const row of rows) {
          const offerId = row.offer_id.trim();
          const set = fileSkusByOffer.get(offerId) ?? new Set<string>();
          set.add(row.sku.trim());
          fileSkusByOffer.set(offerId, set);
        }

        const nextValidationMap = new Map<number, RowValidationInfo>();
        const valErrors: string[] = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const offerInfo = rulesByOffer.get(row.offer_id.trim());

          if (!offerInfo) {
            const msg = `Oferta "${row.offer_id}" no existe en la BD o no está activa`;
            nextValidationMap.set(i, { status: "error", message: msg });
            valErrors.push(`Fila ${i + 2}: ${msg}`);
            continue;
          }

          if (!offerInfo.skus.has(row.sku.trim())) {
            const msg = `ITEM "${row.sku}" no pertenece a la oferta "${row.offer_id}"`;
            nextValidationMap.set(i, { status: "error", message: msg });
            valErrors.push(`Fila ${i + 2}: ${msg}`);
            continue;
          }

          if (offerInfo.isKit) {
            if (!row.set_id) {
              const msg = `Oferta tipo KIT requiere SET (ej. SET 1)`;
              nextValidationMap.set(i, { status: "error", message: msg });
              valErrors.push(`Fila ${i + 2}: ${msg}`);
              continue;
            }
            const fileSkus = fileSkusByOffer.get(row.offer_id.trim());
            const missingSkus = [...offerInfo.skus].filter(sku => !fileSkus?.has(sku));
            if (missingSkus.length > 0) {
              const msg = `Faltan SKUs en el archivo para completar el KIT (${missingSkus.slice(0, 3).join(", ")}${missingSkus.length > 3 ? "..." : ""})`;
              nextValidationMap.set(i, { status: "error", message: msg });
              valErrors.push(`Fila ${i + 2}: ${msg}`);
              continue;
            }
          } else {
            if (row.set_id) {
              const msg = `Esta oferta no es KIT; el SET debe estar vacío`;
              nextValidationMap.set(i, { status: "error", message: msg });
              valErrors.push(`Fila ${i + 2}: ${msg}`);
              continue;
            }
          }

          nextValidationMap.set(i, { status: "valid", message: "Verificado contra la BD" });
        }

        setValidationMap(nextValidationMap);
        setIsValidated(true);

        if (valErrors.length > 0) {
          setErrors(valErrors);
          setPreview(null);
          return;
        }

        // Si todas las filas pasaron, validar contra el RPC para preview oficial
        const payload = rows.map(r => ({
          offer_id: r.offer_id,
          sku: r.sku,
          set_id: r.set_id,
          quantity: r.quantity,
          threshold_type: r.threshold_type,
        }));
        const result = await submitOfferDetails(supabase, payload, undefined);
        setPreview(result);
      } catch (error) {
        setPreview(null);
        setErrors([error instanceof Error ? error.message : "Error durante la validación."]);
      } finally {
        setBusy(false);
      }
      return;
    }

    // Guardado definitivo
    try {
      const payload = rows.map(r => ({
        offer_id: r.offer_id,
        sku: r.sku,
        set_id: r.set_id,
        quantity: r.quantity,
        threshold_type: r.threshold_type,
      }));
      const result = await submitOfferDetails(supabase, payload, preview?.revision);
      if (result.applied) {
        setMessage(`Configuración guardada: ${rows.length} filas. Se conservó una copia de los valores anteriores.`);
        setRows([]);
        setPreview(null);
        setValidationMap(new Map());
        setIsValidated(false);
        onSaved();
      } else {
        setPreview(result);
      }
    } catch (error) {
      setPreview(null);
      setErrors([error instanceof Error ? error.message : "No se pudo guardar."]);
    } finally {
      setBusy(false);
    }
  }

  const validCount = useMemo(() => {
    let count = 0;
    validationMap.forEach(v => { if (v.status === "valid") count++; });
    return count;
  }, [validationMap]);

  const errorCount = useMemo(() => {
    let count = 0;
    validationMap.forEach(v => { if (v.status === "error") count++; });
    return count;
  }, [validationMap]);

  const filteredRowIndices = useMemo(() => {
    if (!isValidated || filterStatus === "all") {
      return rows.map((_, i) => i);
    }
    return rows
      .map((_, i) => i)
      .filter(i => {
        const info = validationMap.get(i);
        return filterStatus === "error" ? info?.status === "error" : info?.status === "valid";
      });
  }, [rows, isValidated, filterStatus, validationMap]);

  const before = (row: OfferDetail) => preview?.before.find(item => item.offer_id === row.offer_id && item.sku === row.sku && item.set_id === row.set_id);
  const condition = (row: OfferDetail) => `${row.quantity} · ${row.threshold_type === "EXACT" ? "Exacto" : "Mínimo"}`;

  return <section className="configuration-import" aria-labelledby="configuration-import-title">
    <div className="configuration-import-head">
      <div className="configuration-title-row">
        <h3 id="configuration-import-title">Cargar configuraciones adicionales</h3>
        <div className="info-tooltip-wrapper">
          <button
            type="button"
            className="info-tooltip-trigger"
            aria-label="Información sobre reglas de importación y condiciones"
            title="Ver reglas de configuración y carga"
          >
            <Info size={14} />
          </button>
          <div className="info-tooltip-popover" role="tooltip">
            <div className="info-tooltip-header">
              <Info size={14} />
              <span>Reglas de configuración y carga</span>
            </div>
            <div className="info-tooltip-content">
              <p>
                <strong>Condiciones por oferta–SKU:</strong> Compartidas entre promociones y segmentos. Se ignoran A y VALID. SET vacío significa oferta no kit. Los beneficios se toman del reporte de promociones.
              </p>
              <p>
                <strong>Kits y SETs:</strong> Incluya todos los SKU y SET de cada kit. La cantidad se repite en las filas del SET y se exige una sola vez por grupo; no se suma. Las ofertas no incluidas se conservan.
              </p>
              <p>
                <strong>Aplicación de unidades:</strong> Exacto 1 aplica una vez por cada unidad; 20 unidades cumplen 20 veces.
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="configuration-actions">
        <Button variant="outline" disabled={busy} onClick={async () => {
          try { await downloadConfigurationTemplate(); } catch { setErrors(["No se pudo descargar la plantilla."]); }
        }}><Download size={16} />Plantilla vacía</Button>
        <input ref={fileInput} type="file" hidden accept=".xlsx,.xls,.xlsb,.csv,.tsv" onChange={event => { void load(event.target.files?.[0]); event.target.value = ""; }} />
        <Button variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}><Upload size={16} />Seleccionar archivo</Button>
        {rows.length > 0 && !preview ? <Button disabled={busy || !parseValid} onClick={() => void validateOrSave(false)}>Validar contra ofertas</Button> : null}
        {preview && errorCount === 0 ? <Button disabled={busy} onClick={() => void validateOrSave(true)}>Guardar {rows.length} filas</Button> : null}
        {rows.length > 0 ? <Button variant="ghost" disabled={busy} onClick={() => { setRows([]); setPreview(null); setErrors([]); setFilename(""); setValidationMap(new Map()); setIsValidated(false); setFilterStatus("all"); }}>Cancelar carga</Button> : null}
      </div>
    </div>
    <div role="status" aria-live="polite" className="configuration-status">{busy ? "Procesando…" : message || (filename ? `${filename} · ${rows.length} filas · ${new Set(rows.map(row => row.offer_id)).size} ofertas` : "Excel, CSV o TSV · Primera hoja · Máximo 10 MB / 10,000 filas")}</div>
    {errors.length ? <div role="alert" className="configuration-errors"><strong>{errorCount > 0 ? `Se encontraron ${errorCount} filas con error:` : "No se guardó ningún cambio."}</strong><ul>{errors.slice(0, 30).map((error, index) => <li key={index}>{error}</li>)}</ul>{errors.length > 30 ? <p>{errors.length - 30} errores adicionales. Corrija el archivo y vuelva a cargarlo.</p> : null}</div> : null}
    {preview && errorCount === 0 ? <p>Validación completa. {preview.affected_rules} registros del reporte pertenecen a estas ofertas. {preview.legacy_count > 0 ? `${preview.legacy_count} reglas anteriores se conservan como respaldo; las condiciones cargadas tendrán prioridad para los SKU incluidos.` : ""} Los kits incluidos reemplazan sus SET completos.</p> : null}
    
    {rows.length ? <>
      {isValidated ? (
        <div className="validation-summary-bar">
          <div className="validation-badges">
            <span className="validation-badge-item">
              <span className="led-dot led-green" />
              <span className="led-label-green"><strong>{validCount}</strong> {validCount === 1 ? "línea correcta" : "líneas correctas"}</span>
            </span>
            {errorCount > 0 ? (
              <span className="validation-badge-item">
                <span className="led-dot led-red" />
                <span className="led-label-red"><strong>{errorCount}</strong> {errorCount === 1 ? "línea con error" : "líneas con error"}</span>
              </span>
            ) : null}
          </div>

          <div className="validation-filter-buttons">
            <button
              type="button"
              className={`validation-filter-btn ${filterStatus === "all" ? "active" : ""}`}
              onClick={() => { setFilterStatus("all"); setPage(0); }}
            >
              Todas ({rows.length})
            </button>
            {errorCount > 0 ? (
              <button
                type="button"
                className={`validation-filter-btn ${filterStatus === "error" ? "active" : ""}`}
                onClick={() => { setFilterStatus("error"); setPage(0); }}
              >
                Solo con error ({errorCount})
              </button>
            ) : null}
            <button
              type="button"
              className={`validation-filter-btn ${filterStatus === "valid" ? "active" : ""}`}
              onClick={() => { setFilterStatus("valid"); setPage(0); }}
            >
              Solo correctas ({validCount})
            </button>
          </div>
        </div>
      ) : null}

      <div className="configuration-table">
        <table>
          <thead>
            <tr>
              <th style={{ width: "160px" }}>Estado</th>
              <th>Oferta</th>
              <th>SET</th>
              <th>ITEM</th>
              <th>Anterior</th>
              <th>Nueva condición</th>
            </tr>
          </thead>
          <tbody>
            {filteredRowIndices.slice(page * 50, (page + 1) * 50).map((index: number) => {
              const row = rows[index];
              const val = validationMap.get(index);
              const isError = val?.status === "error";
              const isValid = val?.status === "valid";
              const rowClass = isError ? "row-state-error" : isValid ? "row-state-valid" : "";

              return (
                <tr key={`${row.offer_id}-${row.sku}-${row.set_id}-${index}`} className={rowClass}>
                  <td className="led-cell">
                    <div className="led-indicator" title={val?.message}>
                      {isError ? (
                        <>
                          <span className="led-dot led-red" aria-label="Línea con error" />
                          <span className="led-label-red">Error</span>
                        </>
                      ) : isValid ? (
                        <>
                          <span className="led-dot led-green" aria-label="Línea correcta" />
                          <span className="led-label-green">Correcto</span>
                        </>
                      ) : (
                        <>
                          <span className="led-dot led-gray" aria-label="Pendiente de validación" />
                          <span className="led-label-gray">Pendiente</span>
                        </>
                      )}
                    </div>
                    {val?.message && isError ? (
                      <span className="row-error-message">{val.message}</span>
                    ) : null}
                  </td>
                  <td><strong>{row.offer_id}</strong></td>
                  <td>{row.set_id ? `SET ${row.set_id}` : "No kit"}</td>
                  <td><code>{row.sku}</code></td>
                  <td>{preview ? before(row) ? condition(before(row)!) : "Sin condición global" : "Pendiente de validar"}</td>
                  <td>{condition(row)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {preview?.before.some(old => rows.some(row => row.offer_id === old.offer_id && row.set_id) && !rows.some(row => row.offer_id === old.offer_id && row.sku === old.sku && row.set_id === old.set_id)) ? <details><summary>SET / ITEM que se quitarán de los kits incluidos</summary><ul>{preview.before.filter(old => rows.some(row => row.offer_id === old.offer_id && row.set_id) && !rows.some(row => row.offer_id === old.offer_id && row.sku === old.sku && row.set_id === old.set_id)).map(old => <li key={JSON.stringify(old)}>{old.offer_id} · SET {old.set_id} · {old.sku} · {condition(old)}</li>)}</ul></details> : null}
      
      <div className="configuration-actions">
        <Button variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
        <span>Página {page + 1} de {Math.max(1, Math.ceil(filteredRowIndices.length / 50))}</span>
        <Button variant="ghost" disabled={(page + 1) * 50 >= filteredRowIndices.length} onClick={() => setPage(page + 1)}>Siguiente</Button>
      </div>
    </> : null}
  </section>;
}
