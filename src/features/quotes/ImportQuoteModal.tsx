import { ClipboardPaste, FileUp, Upload, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui";
import { parseQuoteFile, parseQuoteText } from "../../services/importers";
import type { QuoteItem } from "../../types/domain";

type ImportMode = "file" | "paste";

type Props = {
  onClose: () => void;
  onReplaceItems: (items: QuoteItem[]) => void;
  onAppendItems: (items: QuoteItem[]) => void;
};

export function ImportQuoteModal({ onClose, onReplaceItems, onAppendItems }: Props) {
  const [mode, setMode] = useState<ImportMode>("file");
  const [pasteText, setPasteText] = useState("");
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState("");
  const [isReading, setIsReading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pastedItems = useMemo(() => parseQuoteText(pasteText), [pasteText]);

  async function handleFile(file?: File) {
    if (!file) return;
    setIsReading(true);
    setMessage("");
    setFileName(file.name);

    try {
      const parsed = await parseQuoteFile(file);
      const validItems = parsed.filter((item) => item.sku);
      if (!validItems.length) {
        setMessage("No se encontraron SKU validos en el archivo.");
        return;
      }

      onReplaceItems(validItems);
      onClose();
    } catch {
      setMessage("No se pudo leer el archivo seleccionado.");
    } finally {
      setIsReading(false);
    }
  }

  function handlePasteImport() {
    if (!pastedItems.length) {
      setMessage("Pegue al menos un SKU valido.");
      return;
    }

    onAppendItems(pastedItems);
    onClose();
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="quote-import-modal">
        <header className="modal-head">
          <div>
            <h2>Importar SKU</h2>
            <span>Seleccione una fuente para actualizar la cotizacion.</span>
          </div>
          <button className="icon-btn" title="Cerrar" onClick={onClose}>
            <X size={17} />
          </button>
        </header>

        <div className="import-tabs" role="tablist" aria-label="Metodo de importacion">
          <button className={mode === "file" ? "active" : ""} type="button" onClick={() => setMode("file")}>
            <FileUp size={16} />
            Archivo
          </button>
          <button className={mode === "paste" ? "active" : ""} type="button" onClick={() => setMode("paste")}>
            <ClipboardPaste size={16} />
            Pegar datos
          </button>
        </div>

        <div className="import-body">
          {mode === "file" ? (
            <div className="import-file-panel">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv,.tsv"
                onChange={(event) => handleFile(event.target.files?.[0])}
              />
              <button className="import-file-drop" type="button" onClick={() => fileInputRef.current?.click()} disabled={isReading}>
                <Upload size={22} />
                <strong>{fileName || "Seleccionar archivo"}</strong>
                <span>XLSX, CSV o TSV</span>
              </button>
            </div>
          ) : (
            <div className="import-paste-panel">
              <textarea
                autoFocus
                value={pasteText}
                onChange={(event) => {
                  setPasteText(event.target.value);
                  setMessage("");
                }}
                placeholder={"SKU Cantidad\n100634895 8\n152281753 1"}
              />
              <div className="import-preview">
                <span>{pastedItems.length ? `${pastedItems.length} lineas listas` : "Sin lineas detectadas"}</span>
                <Button onClick={handlePasteImport} disabled={!pastedItems.length}>
                  <ClipboardPaste size={16} />
                  Agregar
                </Button>
              </div>
            </div>
          )}

          {message ? <p className="import-message">{message}</p> : null}
        </div>
      </section>
    </div>
  );
}
