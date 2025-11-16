import { FormEvent, useCallback, useMemo, useRef, useState } from 'react';
import {
  BnnImportFormat,
  GoodsReceiptItem,
  GoodsReceiptResponse,
  importGoodsReceipt,
} from '../../../api/inventory';
import { useInventoryRealtime } from '../InventoryRealtimeContext';

const quantityFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

const currencyFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

type ManualParsedItem = {
  sku: string;
  ean?: string;
  name?: string;
  quantity: number;
  unitprice?: number;
  lotnumber?: string;
  expirationdate?: string;
  storagelocationcode?: string;
  unit?: string;
};

type ManualParseResult = {
  items: ManualParsedItem[];
  errors: string[];
};

const manualHeaderMap: Record<string, keyof ManualParsedItem> = {
  artikelnummer: 'sku',
  articlenumber: 'sku',
  artikelnr: 'sku',
  ean: 'ean',
  gtin: 'ean',
  barcode: 'ean',
  product: 'name',
  produkt: 'name',
  produktname: 'name',
  name: 'name',
  description: 'name',
  bezeichnung: 'name',
  quantity: 'quantity',
  menge: 'quantity',
  qty: 'quantity',
  anzahl: 'quantity',
  unit: 'unit',
  einheit: 'unit',
  unitprice: 'unitprice',
  einstandspreis: 'unitprice',
  price: 'unitprice',
  preis: 'unitprice',
  netprice: 'unitprice',
  bruttopreis: 'unitprice',
  lot: 'lotnumber',
  lotnumber: 'lotnumber',
  chargennummer: 'lotnumber',
  charge: 'lotnumber',
  batch: 'lotnumber',
  expirationdate: 'expirationdate',
  bestbefore: 'expirationdate',
  mindesthaltbarkeitsdatum: 'expirationdate',
  mhd: 'expirationdate',
  storagelocationcode: 'storagelocationcode',
  location: 'storagelocationcode',
  lagerort: 'storagelocationcode',
  bin: 'storagelocationcode',
};

function detectManualDelimiter(lines: string[]) {
  if (lines.some(line => line.includes('\t'))) return '\t';
  if (lines.some(line => line.includes(';'))) return ';';
  if (lines.some(line => line.includes(','))) return ',';
  return ';';
}

function parseDecimalNumber(value: string | undefined) {
  if (!value) return null;
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeManualEan(value?: string) {
  if (!value) return null;
  const digits = value.replace(/[^0-9]/g, '');
  return digits.length >= 8 && digits.length <= 14 ? digits : null;
}

function parseManualEntries(text: string): ManualParseResult {
  const structuredLines = text
    .split(/\r?\n/)
    .map((line, index) => ({ content: line.trim(), lineNumber: index + 1 }))
    .filter(line => line.content.length > 0);

  if (!structuredLines.length) {
    return { items: [], errors: [] };
  }

  const delimiter = detectManualDelimiter(structuredLines.map(line => line.content));

  const splitLine = (line: string) => line.split(delimiter).map(value => value.trim());

  const headerCandidate = splitLine(structuredLines[0].content).map(column => column.toLowerCase());
  const defaultHeader: (keyof ManualParsedItem)[] = [
    'sku',
    'ean',
    'name',
    'quantity',
    'unitprice',
    'lotnumber',
    'expirationdate',
    'storagelocationcode',
  ];
  const mappedHeader = headerCandidate.map((column, index) => {
    const mapped = manualHeaderMap[column];
    if (mapped) {
      return mapped;
    }
    return defaultHeader[index] ?? defaultHeader[defaultHeader.length - 1];
  });
  const headerDetected = headerCandidate.some(
    column => manualHeaderMap[column] || column === 'sku' || column === 'name' || column === 'quantity',
  );

  const dataLines = headerDetected ? structuredLines.slice(1) : structuredLines;
  const effectiveHeader = headerDetected ? mappedHeader : defaultHeader;

  const items: ManualParsedItem[] = [];
  const errors: string[] = [];

  for (const line of dataLines) {
    const values = splitLine(line.content);
    if (!values.length) {
      continue;
    }

    const record: Partial<Record<keyof ManualParsedItem, string>> = {};
    values.forEach((value, columnIndex) => {
      const key = effectiveHeader[columnIndex] ?? effectiveHeader[effectiveHeader.length - 1];
      record[key] = value;
    });

    const skuCandidate = record.sku?.trim();
    const eanCandidate = record.ean?.trim();
    const normalizedEan = eanCandidate ? normalizeManualEan(eanCandidate) : null;
    if (eanCandidate && !normalizedEan) {
      errors.push(`Zeile ${line.lineNumber}: EAN "${eanCandidate}" ist ungültig (8-14 Ziffern).`);
      continue;
    }
    const sku = skuCandidate || normalizedEan;
    if (!sku) {
      errors.push(`Zeile ${line.lineNumber}: Keine SKU oder gültige EAN gefunden.`);
      continue;
    }

    const quantityRaw = record.quantity ?? '1';
    const quantity = parseDecimalNumber(quantityRaw);
    if (quantity === null) {
      errors.push(`Zeile ${line.lineNumber}: Ungültige Menge "${quantityRaw}".`);
      continue;
    }

    const unitPrice = record.unitprice ? parseDecimalNumber(record.unitprice) ?? undefined : undefined;

    items.push({
      sku,
      ean: normalizedEan ?? undefined,
      name: record.name ?? undefined,
      quantity,
      unitprice: unitPrice,
      lotnumber: record.lotnumber ?? undefined,
      expirationdate: record.expirationdate ?? undefined,
      storagelocationcode: record.storagelocationcode ?? undefined,
      unit: record.unit ?? undefined,
    });
  }

  return { items, errors };
}

/**
 * Detects the BNN import format based on a file's extension.
 * @param {string} fileName - The name of the file.
 * @returns {BnnImportFormat} The detected format.
 */
function detectFormat(fileName: string): BnnImportFormat {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'json') return 'json';
  if (extension === 'xml') return 'xml';
  return 'csv';
}

/**
 * Normalizes and formats a decimal string for display.
 * @param {string | null | undefined} value - The decimal string to format.
 * @param {number} [fractionDigits=3] - The number of fraction digits to display.
 * @returns {string} The formatted number string.
 */
function normalizeDecimal(value: string | null | undefined, fractionDigits = 3) {
  if (!value) return '—';
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return value;
  }
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(parsed);
}

/**
 * A component that renders the items of a goods receipt in a table.
 * @param {object} props - The component props.
 * @param {GoodsReceiptItem[]} props.items - The items to display.
 * @returns {JSX.Element} The rendered table or a placeholder message.
 */
function GoodsReceiptTable({ items }: { items: GoodsReceiptItem[] }) {
  if (!items.length) {
    return (
      <p className="rounded-md border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-300">
        Keine Positionen im Wareneingang.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/60">
      <table className="min-w-full divide-y divide-slate-800 text-sm">
        <thead className="bg-slate-900/60 text-left text-slate-400">
          <tr>
            <th className="px-4 py-3 font-medium">SKU</th>
            <th className="px-4 py-3 font-medium">Produkt</th>
            <th className="px-4 py-3 font-medium text-right">Menge</th>
            <th className="px-4 py-3 font-medium">Los / Charge</th>
            <th className="px-4 py-3 font-medium">MHD</th>
            <th className="px-4 py-3 font-medium text-right">Einstandspreis</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {items.map(item => {
            const quantityLabel = normalizeDecimal(item.quantity);
            const unitCostLabel = normalizeDecimal(item.unitCost, 4);
            return (
              <tr key={item.id} className="hover:bg-slate-900/70">
                <td className="px-4 py-3 font-mono text-xs text-indigo-200">{item.product.sku}</td>
                <td className="px-4 py-3 text-slate-200">{item.product.name}</td>
                <td className="px-4 py-3 text-right text-slate-100">{quantityLabel}</td>
                <td className="px-4 py-3 text-slate-300">{item.batch?.lotNumber ?? '—'}</td>
                <td className="px-4 py-3 text-slate-300">
                  {item.batch?.expirationDate
                    ? new Date(item.batch.expirationDate).toLocaleDateString('de-DE')
                    : '—'}
                </td>
                <td className="px-4 py-3 text-right text-slate-100">
                  {unitCostLabel !== '—' ? currencyFormatter.format(Number(item.unitCost)) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A component for importing goods receipts from BNN (Bundesverband Naturkost Naturwaren) documents.
 * It provides a form with a drag-and-drop area for file uploads and fields for metadata.
 * After a successful import, it displays a summary and a detailed table of the imported items.
 *
 * @returns {JSX.Element} The rendered component.
 */
export default function GoodsReceiptImport() {
  const { pushEvent } = useInventoryRealtime();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [tenantId, setTenantId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierNumber, setSupplierNumber] = useState('');
  const [reference, setReference] = useState('');
  const [receivedAt, setReceivedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [manualEntries, setManualEntries] = useState('');

  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileFormat, setFileFormat] = useState<BnnImportFormat>('csv');
  const [fileContent, setFileContent] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GoodsReceiptResponse | null>(null);

  const manualParse = useMemo(() => parseManualEntries(manualEntries), [manualEntries]);
  const manualItemsPreview = manualParse.items.slice(0, 5);
  const hasManualItems = manualParse.items.length > 0;

  const totalQuantity = useMemo(() => {
    if (!result?.items?.length) return null;
    const sum = result.items.reduce((accumulator, item) => accumulator + Number(item.quantity ?? 0), 0);
    return quantityFormatter.format(sum);
  }, [result]);

  const totalCost = useMemo(() => {
    if (!result?.items?.length) return null;
    const sum = result.items.reduce(
      (accumulator, item) => accumulator + Number(item.unitCost ?? 0) * Number(item.quantity ?? 0),
      0,
    );
    return currencyFormatter.format(sum);
  }, [result]);

  const resetFileSelection = useCallback(() => {
    setSelectedFile(null);
    setFileContent('');
    setFileFormat('csv');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleFile = useCallback((file: File) => {
    const format = detectFormat(file.name);
    setSelectedFile(file);
    setFileFormat(format);
    setError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      setFileContent(content);
    };
    reader.onerror = () => {
      setError('Datei konnte nicht gelesen werden.');
      resetFileSelection();
    };
    reader.readAsText(file, 'utf-8');
  }, [resetFileSelection]);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragActive(false);
      const file = event.dataTransfer.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile],
  );

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!tenantId.trim()) {
        setError('Bitte eine Tenant-ID angeben.');
        return;
      }
      if (!hasManualItems && !fileContent) {
        setError('Bitte eine BNN-Datei auswählen oder Artikelzeilen einfügen.');
        return;
      }

      if (hasManualItems && manualParse.errors.length) {
        setError(manualParse.errors[0]);
        return;
      }

      setIsSubmitting(true);
      setError(null);
      try {
        const payloadToSend = hasManualItems ? JSON.stringify({ items: manualParse.items }) : fileContent;
        const formatToSend: BnnImportFormat = hasManualItems ? 'json' : fileFormat;

        const payload = {
          tenantId: tenantId.trim(),
          format: formatToSend,
          payload: payloadToSend,
          supplierName: supplierName.trim() || undefined,
          supplierNumber: supplierNumber.trim() || undefined,
          reference: reference.trim() || undefined,
          receivedAt: receivedAt ? new Date(receivedAt).toISOString() : undefined,
          notes: notes.trim() || undefined,
          fileName: selectedFile?.name,
        };

        const goodsReceipt = await importGoodsReceipt(payload);
        setResult(goodsReceipt);

        pushEvent({
          id: `goods-receipt-${goodsReceipt.id}-${Date.now()}`,
          type: 'goods-receipt',
          title: 'Wareneingang importiert',
          timestamp: new Date().toISOString(),
          description: goodsReceipt.reference ?? `Import #${goodsReceipt.id}`,
          payload: goodsReceipt,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Import fehlgeschlagen.';
        setError(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      tenantId,
      fileContent,
      fileFormat,
      supplierName,
      supplierNumber,
      reference,
      receivedAt,
      notes,
      selectedFile,
      manualParse,
      hasManualItems,
      pushEvent,
    ],
  );

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-white">BNN-Wareneingang importieren</h2>
        <p className="text-sm text-slate-400">
          Ziehen Sie eine BNN-Datei per Drag & Drop hierher oder fügen Sie unten eine Liste von Artikeln ein, um neue
          Wareneingänge zu buchen.
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="text-slate-300">Tenant-ID</span>
            <input
              value={tenantId}
              onChange={event => setTenantId(event.target.value)}
              className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="tenant-123"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-300">Lieferant</span>
            <input
              value={supplierName}
              onChange={event => setSupplierName(event.target.value)}
              className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Bio Lieferant GmbH"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-300">Lieferantennummer</span>
            <input
              value={supplierNumber}
              onChange={event => setSupplierNumber(event.target.value)}
              className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="L-10045"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-300">Referenz</span>
            <input
              value={reference}
              onChange={event => setReference(event.target.value)}
              className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="GR-2024-10"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-300">Wareneingangsdatum</span>
            <input
              type="date"
              value={receivedAt}
              onChange={event => setReceivedAt(event.target.value)}
              className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2 lg:col-span-3">
            <span className="text-slate-300">Notizen</span>
            <textarea
              value={notes}
              onChange={event => setNotes(event.target.value)}
              rows={2}
              className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="z. B. Temperaturkontrolle durchgeführt"
            />
          </label>
        </div>

        <div className="space-y-4">
          <div
            onDragOver={event => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={event => {
              event.preventDefault();
              setDragActive(false);
            }}
            onDrop={handleDrop}
            className={[
              'flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
              dragActive ? 'border-indigo-500 bg-indigo-500/10 text-indigo-200' : 'border-slate-800 bg-slate-900/50 text-slate-400',
            ].join(' ')}
          >
            <input
              type="file"
              accept=".csv,.json,.xml,.txt"
              ref={fileInputRef}
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) {
                  handleFile(file);
                }
              }}
              className="hidden"
            />
            <p className="text-sm font-medium">BNN-Datei hierher ziehen oder klicken, um eine Datei zu wählen.</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 rounded-md border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-indigo-500 hover:text-indigo-200"
            >
              Datei auswählen
            </button>
            {selectedFile && (
              <div className="mt-4 text-xs text-slate-300">
                <p className="font-medium text-slate-200">{selectedFile.name}</p>
                <p>Format: {fileFormat.toUpperCase()}</p>
                <button
                  type="button"
                  onClick={resetFileSelection}
                  className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-rose-300 hover:text-rose-200"
                >
                  Entfernen
                </button>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-200">
            <label className="flex flex-col gap-2">
              <span className="font-medium text-slate-300">Oder Artikelzeilen einfügen</span>
              <textarea
                value={manualEntries}
                onChange={event => setManualEntries(event.target.value)}
                rows={4}
                className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder={'SKU;EAN;Name;Menge;Einstandspreis\n12345;4006381333931;Mandeln 1kg;12;8,50'}
              />
            </label>
            <p className="mt-2 text-xs text-slate-400">
              Unterstützt Semikolon, Tab oder Komma als Trennzeichen. Optional mit Spaltenüberschrift (z. B. SKU;EAN;Name;Menge;Preis;MHD;Lagerort).
            </p>
            {hasManualItems ? (
              <p className="mt-2 text-xs text-emerald-200">{manualParse.items.length} Artikel erkannt. Beim Import hat diese Liste Vorrang vor der Datei.</p>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Jede Zeile sollte mindestens eine SKU oder EAN enthalten. Menge und Preis sind optional.</p>
            )}
            {manualParse.errors.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-rose-300">
                {manualParse.errors.slice(0, 3).map(message => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}
            {manualItemsPreview.length ? (
              <div className="mt-3 overflow-x-auto rounded-md border border-slate-800">
                <table className="min-w-full divide-y divide-slate-800 text-xs">
                  <thead className="bg-slate-900/40 text-slate-400">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">SKU</th>
                      <th className="px-3 py-2 text-left font-medium">EAN</th>
                      <th className="px-3 py-2 text-left font-medium">Name</th>
                      <th className="px-3 py-2 text-right font-medium">Menge</th>
                      <th className="px-3 py-2 text-right font-medium">Preis</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {manualItemsPreview.map((item, index) => (
                      <tr key={`${item.sku}-${index}`} className="bg-slate-950/40">
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-200">{item.sku}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-200">{item.ean ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-200">{item.name ?? '—'}</td>
                        <td className="px-3 py-2 text-right text-slate-100">{normalizeDecimal(String(item.quantity))}</td>
                        <td className="px-3 py-2 text-right text-slate-100">
                          {item.unitprice !== undefined ? currencyFormatter.format(item.unitprice) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>

        {error && <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Nach dem Import werden neue Chargen automatisch erzeugt.
          </p>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center rounded-md bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-indigo-500/60"
          >
            {isSubmitting ? 'Importiere…' : 'Import starten'}
          </button>
        </div>
      </form>

      {result && (
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm">
                <span className="inline-flex items-center rounded-full border border-emerald-400/60 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
                  Importiert
                </span>
                <span className="text-slate-400">{new Date(result.receivedAt).toLocaleString('de-DE')}</span>
              </div>
              <h3 className="text-base font-semibold text-white">
                {result.reference ? `Wareneingang ${result.reference}` : `Wareneingang #${result.id}`}
              </h3>
              {result.supplier && (
                <p className="text-sm text-slate-400">
                  Lieferant: {result.supplier.name ?? 'Unbekannt'}
                  {result.supplier.supplierNumber ? ` · ${result.supplier.supplierNumber}` : ''}
                </p>
              )}
            </div>
            <div className="text-right text-sm text-slate-300">
              {totalQuantity && <p>Menge gesamt: {totalQuantity}</p>}
              {totalCost && <p>Warenwert: {totalCost}</p>}
            </div>
          </div>

          <GoodsReceiptTable items={result.items} />

          {result.importSources?.length ? (
            <div className="rounded-lg border border-slate-900 bg-slate-900/40 p-4 text-xs text-slate-400">
              <p className="font-semibold uppercase tracking-wide text-slate-300">Importquelle</p>
              <ul className="mt-2 space-y-1">
                {result.importSources.map(source => (
                  <li key={source.id}>
                    {source.format.toUpperCase()} ·{' '}
                    {source.sourceFileName ?? 'Dateiname unbekannt'} ·{' '}
                    {new Date(source.createdAt).toLocaleString('de-DE')}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
