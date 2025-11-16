import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ImportProductCatalogPayload,
  ImportProductCatalogResponse,
  ProductRecord,
  importProductCatalog,
  listProducts,
  updateProduct,
} from '../../../api/inventory';
import { useInventoryRealtime } from '../InventoryRealtimeContext';

type EditableImportRow = {
  id: string;
  sku: string;
  ean: string;
  name: string;
  unit: string;
  price: string;
  supplierName: string;
  supplierNumber: string;
};

type ManualParseResult = {
  items: EditableImportRow[];
  errors: string[];
};

const manualHeaderMap: Record<string, keyof EditableImportRow | 'price'> = {
  sku: 'sku',
  artikelnr: 'sku',
  artikelnummer: 'sku',
  ean: 'ean',
  gtin: 'ean',
  barcode: 'ean',
  name: 'name',
  produkt: 'name',
  produktname: 'name',
  description: 'name',
  bezeichnung: 'name',
  unit: 'unit',
  einheit: 'unit',
  price: 'price',
  preis: 'price',
  nettopreis: 'price',
  bruttopreis: 'price',
  cost: 'price',
  supplier: 'supplierName',
  lieferant: 'supplierName',
  suppliername: 'supplierName',
  suppliernumber: 'supplierNumber',
  lieferantennummer: 'supplierNumber',
  lieferantennr: 'supplierNumber',
  lieferantennummern: 'supplierNumber',
  lieferantnummer: 'supplierNumber',
};

const defaultHeaderOrder: (keyof EditableImportRow | 'price')[] = [
  'sku',
  'ean',
  'name',
  'price',
  'unit',
  'supplierName',
  'supplierNumber',
];

const currencyFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

function buildRowId() {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function detectDelimiter(lines: string[]) {
  if (lines.some(line => line.includes('\t'))) return '\t';
  if (lines.some(line => line.includes(';'))) return ';';
  if (lines.some(line => line.includes(','))) return ',';
  return ';';
}

function parseManualProductEntries(text: string): ManualParseResult {
  const structuredLines = text
    .split(/\r?\n/)
    .map((content, index) => ({ content: content.trim(), lineNumber: index + 1 }))
    .filter(line => line.content.length > 0);

  if (!structuredLines.length) {
    return { items: [], errors: [] };
  }

  const delimiter = detectDelimiter(structuredLines.map(line => line.content));
  const splitLine = (line: string) => line.split(delimiter).map(value => value.trim());

  const headerCandidate = splitLine(structuredLines[0].content).map(column => column.toLowerCase());
  const headerDetected = headerCandidate.some(column => manualHeaderMap[column] || column === 'sku' || column === 'name');
  const mappedHeader = headerCandidate.map((column, index) => {
    const mapped = manualHeaderMap[column];
    if (mapped) return mapped;
    return defaultHeaderOrder[index] ?? defaultHeaderOrder[defaultHeaderOrder.length - 1];
  });

  const effectiveHeader = headerDetected ? mappedHeader : defaultHeaderOrder;
  const dataLines = headerDetected ? structuredLines.slice(1) : structuredLines;

  const items: EditableImportRow[] = [];
  const errors: string[] = [];

  for (const line of dataLines) {
    const values = splitLine(line.content);
    if (!values.length) continue;

    const record: Partial<Record<keyof EditableImportRow | 'price', string>> = {};
    values.forEach((value, columnIndex) => {
      const key = effectiveHeader[columnIndex] ?? effectiveHeader[effectiveHeader.length - 1];
      record[key] = value;
    });

    const skuCandidate = record.sku?.trim();
    const eanCandidate = record.ean?.trim();
    const normalizedEan = eanCandidate ? normalizeEanInput(eanCandidate) : null;
    if (eanCandidate && !normalizedEan) {
      errors.push(`Zeile ${line.lineNumber}: EAN "${eanCandidate}" ist ungültig (8-14 Ziffern).`);
      continue;
    }

    const sku = skuCandidate || normalizedEan;
    if (!sku) {
      errors.push(`Zeile ${line.lineNumber}: Keine SKU oder gültige EAN erkannt.`);
      continue;
    }

    const name = record.name?.trim() ?? '';
    if (!name) {
      errors.push(`Zeile ${line.lineNumber}: Kein Artikelname angegeben.`);
      continue;
    }

    items.push({
      id: buildRowId(),
      sku,
      ean: normalizedEan ?? '',
      name,
      unit: record.unit?.trim() || 'pcs',
      price: record.price?.trim() ?? '',
      supplierName: record.supplierName?.trim() ?? '',
      supplierNumber: record.supplierNumber?.trim() ?? '',
    });
  }

  return { items, errors };
}

function parsePriceInput(value: string) {
  if (!value.trim()) return null;
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrency(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return '—';
  }
  return currencyFormatter.format(parsed);
}

function normalizeEanInput(value: string) {
  const digits = value.replace(/[^0-9]/g, '');
  return digits.length >= 8 && digits.length <= 14 ? digits : null;
}

function extractSupplierNumber(product: ProductRecord) {
  const supplier = product.supplier as unknown;
  if (supplier && typeof supplier === 'object' && 'bnnSupplierNumber' in supplier) {
    return product.supplier?.supplierNumber ?? (supplier as { bnnSupplierNumber: string }).bnnSupplierNumber ?? null;
  }
  return product.supplier?.supplierNumber ?? null;
}

export default function ProductManagement() {
  const { pushEvent } = useInventoryRealtime();
  const [tenantId, setTenantId] = useState('');
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [listMeta, setListMeta] = useState({ total: 0, skip: 0, take: 25 });
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const [manualText, setManualText] = useState('');
  const [manualErrors, setManualErrors] = useState<string[]>([]);
  const [editableRows, setEditableRows] = useState<EditableImportRow[]>([]);
  const [importResult, setImportResult] = useState<ImportProductCatalogResponse | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null);
  const [editForm, setEditForm] = useState({
    sku: '',
    ean: '',
    name: '',
    unit: '',
    price: '',
    supplierName: '',
    supplierNumber: '',
  });
  const [productMessage, setProductMessage] = useState<string | null>(null);
  const [productError, setProductError] = useState<string | null>(null);
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  const tenantLabel = tenantId.trim();

  const canImport = tenantLabel.length > 0 && editableRows.length > 0 && !isImporting;

  useEffect(() => {
    if (!tenantLabel) {
      setProducts([]);
      setListMeta(previous => ({ ...previous, total: 0 }));
      return;
    }

    let isCancelled = false;
    setIsLoadingProducts(true);
    setProductsError(null);

    listProducts({ tenantId: tenantLabel, search: search.trim() || undefined, take: 25 })
      .then(response => {
        if (isCancelled) return;
        setProducts(response.items);
        setListMeta({ total: response.total, skip: response.skip, take: response.take });
      })
      .catch(error => {
        if (isCancelled) return;
        const message = error instanceof Error ? error.message : 'Artikel konnten nicht geladen werden.';
        setProductsError(message);
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingProducts(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [tenantLabel, search, refreshToken]);

  const analyzeManualInput = useCallback(() => {
    const { items, errors } = parseManualProductEntries(manualText);
    setEditableRows(items);
    setManualErrors(errors);
    if (!items.length && !errors.length) {
      setManualErrors(['Keine Artikelzeilen erkannt.']);
    }
  }, [manualText]);

  const updateRow = useCallback((rowId: string, field: keyof EditableImportRow, value: string) => {
    setEditableRows(rows => rows.map(row => (row.id === rowId ? { ...row, [field]: value } : row)));
  }, []);

  const removeRow = useCallback((rowId: string) => {
    setEditableRows(rows => rows.filter(row => row.id !== rowId));
  }, []);

  const addEmptyRow = useCallback(() => {
    setEditableRows(rows => [
      ...rows,
      {
        id: buildRowId(),
        sku: '',
        ean: '',
        name: '',
        unit: 'pcs',
        price: '',
        supplierName: '',
        supplierNumber: '',
      },
    ]);
  }, []);

  const handleImportSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!tenantLabel) {
        setImportError('Bitte eine Tenant-ID angeben.');
        return;
      }
      if (!editableRows.length) {
        setImportError('Keine Artikel zum Import ausgewählt.');
        return;
      }

      const errors: string[] = [];

      const normalizedItems = editableRows
        .map((row, index) => {
          const sku = row.sku.trim();
          const name = row.name.trim();
          if (!sku || !name) {
            errors.push(`Zeile ${index + 1}: SKU und Name sind Pflichtfelder.`);
            return null;
          }
          const priceValue = row.price.trim() ? parsePriceInput(row.price) : 0;
          if (row.price.trim() && priceValue === null) {
            errors.push(`Zeile ${index + 1}: Preis "${row.price}" ist ungültig.`);
            return null;
          }
          const eanValue = row.ean.trim();
          const normalizedEan = eanValue ? normalizeEanInput(eanValue) : null;
          if (eanValue && !normalizedEan) {
            errors.push(`Zeile ${index + 1}: EAN "${row.ean}" ist ungültig (8-14 Ziffern).`);
            return null;
          }
          return {
            sku,
            ean: normalizedEan ?? undefined,
            name,
            unit: row.unit.trim() || undefined,
            defaultPrice: priceValue ?? undefined,
            supplierName: row.supplierName.trim() || undefined,
            supplierNumber: row.supplierNumber.trim() || undefined,
          };
        })
        .filter((item): item is ImportProductCatalogPayload['items'][number] => Boolean(item));

      if (errors.length) {
        setImportError(errors[0]);
        return;
      }

      if (!normalizedItems.length) {
        setImportError('Es wurden keine gültigen Artikel erkannt.');
        return;
      }

      setIsImporting(true);
      setImportError(null);
      try {
        const response = await importProductCatalog({ tenantId: tenantLabel, items: normalizedItems });
        setImportResult(response);
        setRefreshToken(value => value + 1);
        pushEvent({
          id: `product-import-${Date.now()}`,
          type: 'product-import',
          title: 'Artikel importiert',
          timestamp: new Date().toISOString(),
          description: `${response.summary.created} neu / ${response.summary.updated} aktualisiert`,
          payload: response,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Import fehlgeschlagen.';
        setImportError(message);
      } finally {
        setIsImporting(false);
      }
    },
    [editableRows, pushEvent, tenantLabel],
  );

  const startEditingProduct = useCallback((product: ProductRecord) => {
    setEditingProduct(product);
    setEditForm({
      sku: product.sku,
      ean: product.ean ?? '',
      name: product.name,
      unit: product.unit,
      price: product.defaultPrice?.toString() ?? '',
      supplierName: product.supplier?.name ?? '',
      supplierNumber: extractSupplierNumber(product) ?? '',
    });
    setProductMessage(null);
    setProductError(null);
  }, []);

  const handleProductUpdate = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!editingProduct) return;
      if (!tenantLabel) {
        setProductError('Bitte zuerst eine Tenant-ID auswählen.');
        return;
      }

      const trimmedPrice = editForm.price.trim();
      const parsedPrice = trimmedPrice ? parsePriceInput(trimmedPrice) : undefined;
      if (trimmedPrice && parsedPrice === null) {
        setProductError('Bitte einen gültigen Preis verwenden.');
        return;
      }

      const trimmedEan = editForm.ean.trim();
      const normalizedEan = trimmedEan ? normalizeEanInput(trimmedEan) : null;
      if (trimmedEan && !normalizedEan) {
        setProductError('Bitte eine gültige EAN mit 8 bis 14 Ziffern verwenden.');
        return;
      }

      setIsSavingProduct(true);
      setProductMessage(null);
      setProductError(null);
      try {
        const updated = await updateProduct(editingProduct.id, {
          tenantId: tenantLabel,
          sku: editForm.sku.trim() || undefined,
          ean: trimmedEan ? normalizedEan ?? undefined : null,
          name: editForm.name.trim() || undefined,
          unit: editForm.unit.trim() || undefined,
          defaultPrice: parsedPrice ?? undefined,
          supplierName: editForm.supplierName.trim() || undefined,
          supplierNumber: editForm.supplierNumber.trim() || undefined,
        });
        setProducts(previous => previous.map(product => (product.id === updated.id ? updated : product)));
        setEditingProduct(updated);
        setProductMessage('Änderungen gespeichert.');
        pushEvent({
          id: `product-updated-${Date.now()}`,
          type: 'product-updated',
          title: 'Artikel bearbeitet',
          timestamp: new Date().toISOString(),
          description: `SKU ${updated.sku}`,
          payload: updated,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Produkt konnte nicht aktualisiert werden.';
        setProductError(message);
      } finally {
        setIsSavingProduct(false);
      }
    },
    [editForm, editingProduct, pushEvent, tenantLabel],
  );

  const resetEditing = useCallback(() => {
    setEditingProduct(null);
    setEditForm({ sku: '', ean: '', name: '', unit: '', price: '', supplierName: '', supplierNumber: '' });
    setProductMessage(null);
    setProductError(null);
  }, []);

  useEffect(() => {
    resetEditing();
    setImportResult(null);
  }, [resetEditing, tenantLabel]);

  const importSummaryLabel = useMemo(() => {
    if (!importResult) return null;
    const { created, updated } = importResult.summary;
    return `${created} neu · ${updated} aktualisiert`;
  }, [importResult]);

  return (
    <section className="space-y-6">
      <header className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <label className="flex-1 text-sm">
            <span className="text-slate-300">Tenant-ID</span>
            <input
              value={tenantId}
              onChange={event => setTenantId(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="tenant-123"
            />
          </label>
          <label className="flex-1 text-sm">
            <span className="text-slate-300">Artikel suchen</span>
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="z. B. Kaffee oder 4006381333931"
            />
          </label>
          <button
            type="button"
            onClick={() => setRefreshToken(value => value + 1)}
            className="rounded-md border border-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-700 hover:bg-slate-900/80"
          >
            Liste aktualisieren
          </button>
        </div>
        <p className="mt-3 text-sm text-slate-400">
          Importieren und bearbeiten Sie Artikelstammdaten. Alle Aktionen gelten für Tenant{' '}
          {tenantLabel || '—'}.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={handleImportSubmit} className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-indigo-400">Artikel importieren</p>
            <h2 className="text-lg font-semibold text-white">Manueller Katalog</h2>
            <p className="text-sm text-slate-400">
              Fügen Sie CSV-/Tabellenzeilen ein, korrigieren Sie Werte direkt in der Tabelle und starten Sie den Import.
            </p>
          </div>

          <label className="space-y-2 text-sm">
            <span className="text-slate-300">Artikelzeilen einfügen</span>
              <textarea
                value={manualText}
                onChange={event => setManualText(event.target.value)}
                rows={4}
                className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder={'SKU;EAN;Name;Preis;Einheit;Lieferant\n12345;4006381333931;Espresso;6,90;stk;Rösterei GmbH'}
              />
            </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={analyzeManualInput}
              className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Zeilen übernehmen
            </button>
            <button
              type="button"
              onClick={() => {
                setEditableRows([]);
                setManualErrors([]);
              }}
              className="rounded-md border border-slate-800 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-700 hover:bg-slate-900"
            >
              Liste leeren
            </button>
            <button
              type="button"
              onClick={addEmptyRow}
              className="rounded-md border border-slate-800 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-700 hover:bg-slate-900"
            >
              Zeile hinzufügen
            </button>
          </div>

          {manualErrors.length ? (
            <ul className="space-y-1 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
              {manualErrors.slice(0, 3).map(message => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}

          {editableRows.length ? (
            <div className="overflow-hidden rounded-lg border border-slate-900">
              <table className="min-w-full divide-y divide-slate-900 text-xs">
                  <thead className="bg-slate-900/50 text-slate-400">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">SKU</th>
                      <th className="px-3 py-2 text-left font-medium">EAN / GTIN</th>
                      <th className="px-3 py-2 text-left font-medium">Name</th>
                      <th className="px-3 py-2 text-left font-medium">Einheit</th>
                      <th className="px-3 py-2 text-left font-medium">Preis</th>
                      <th className="px-3 py-2 text-left font-medium">Lieferant</th>
                      <th className="px-3 py-2 text-left font-medium">Aktion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/70">
                    {editableRows.map(row => (
                      <tr key={row.id} className="bg-slate-950/40">
                        <td className="px-3 py-2">
                          <input
                            value={row.sku}
                            onChange={event => updateRow(row.id, 'sku', event.target.value)}
                            className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={row.ean}
                            onChange={event => updateRow(row.id, 'ean', event.target.value)}
                            className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                            placeholder="Optional"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={row.name}
                            onChange={event => updateRow(row.id, 'name', event.target.value)}
                          className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={row.unit}
                          onChange={event => updateRow(row.id, 'unit', event.target.value)}
                          className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={row.price}
                          onChange={event => updateRow(row.id, 'price', event.target.value)}
                          className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="grid gap-1">
                          <input
                            value={row.supplierName}
                            onChange={event => updateRow(row.id, 'supplierName', event.target.value)}
                            className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                            placeholder="Name"
                          />
                          <input
                            value={row.supplierNumber}
                            onChange={event => updateRow(row.id, 'supplierNumber', event.target.value)}
                            className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                            placeholder="Nummer"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          className="text-xs text-rose-300 transition hover:text-rose-200"
                        >
                          Entfernen
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-md border border-slate-900/80 bg-slate-900/40 p-3 text-sm text-slate-400">
              Noch keine zu importierenden Artikel vorbereitet.
            </p>
          )}

          {importError && (
            <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{importError}</p>
          )}

          {importResult && (
            <div className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              <p className="font-semibold">Import erfolgreich</p>
              <p className="text-emerald-200">{importSummaryLabel}</p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {editableRows.length} Zeilen bereit · Tenant {tenantLabel || '—'}
            </p>
            <button
              type="submit"
              disabled={!canImport}
              className="inline-flex items-center rounded-md bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-indigo-500/60"
            >
              {isImporting ? 'Importiere…' : 'Import starten'}
            </button>
          </div>
        </form>

        <div className="space-y-4">
          <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-indigo-400">Artikelbestand</p>
                <h2 className="text-lg font-semibold text-white">Aktuelle Produkte</h2>
                <p className="text-sm text-slate-400">
                  Es werden bis zu {listMeta.take} Einträge angezeigt. Gesamt: {listMeta.total}.
                </p>
              </div>
            </div>

            {!tenantLabel ? (
              <p className="rounded-md border border-slate-900/80 bg-slate-900/40 p-3 text-sm text-slate-400">
                Bitte eine Tenant-ID eingeben, um Artikel zu laden.
              </p>
            ) : isLoadingProducts ? (
              <p className="rounded-md border border-slate-900/80 bg-slate-900/40 p-3 text-sm text-slate-400">
                Lade Artikel…
              </p>
            ) : productsError ? (
              <p className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{productsError}</p>
            ) : products.length ? (
              <div className="overflow-hidden rounded-lg border border-slate-900">
                <table className="min-w-full divide-y divide-slate-900 text-sm">
                  <thead className="bg-slate-900/50 text-slate-400">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">SKU</th>
                      <th className="px-3 py-2 text-left font-medium">EAN / GTIN</th>
                      <th className="px-3 py-2 text-left font-medium">Name</th>
                      <th className="px-3 py-2 text-left font-medium">Preis</th>
                      <th className="px-3 py-2 text-left font-medium">Einheit</th>
                      <th className="px-3 py-2 text-left font-medium">Lieferant</th>
                      <th className="px-3 py-2 text-left font-medium">Aktualisiert</th>
                      <th className="px-3 py-2 text-left font-medium">Aktion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/70">
                    {products.map(product => (
                      <tr key={product.id} className="bg-slate-950/40">
                        <td className="px-3 py-2 font-mono text-xs text-slate-200">{product.sku}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-200">
                          {product.ean ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-slate-100">{product.name}</td>
                        <td className="px-3 py-2 text-slate-100">{formatCurrency(product.defaultPrice)}</td>
                        <td className="px-3 py-2 text-slate-300">{product.unit}</td>
                        <td className="px-3 py-2 text-slate-300">
                          {product.supplier?.name ?? '—'}
                          {extractSupplierNumber(product) ? ` · ${extractSupplierNumber(product)}` : ''}
                        </td>
                        <td className="px-3 py-2 text-slate-400">
                          {new Date(product.updatedAt).toLocaleDateString('de-DE')}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => startEditingProduct(product)}
                            className="text-sm font-medium text-indigo-300 transition hover:text-indigo-200"
                          >
                            Bearbeiten
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-md border border-slate-900/80 bg-slate-900/40 p-3 text-sm text-slate-400">
                Keine Artikel gefunden.
              </p>
            )}
          </div>

          {editingProduct && (
            <form onSubmit={handleProductUpdate} className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-indigo-400">Artikel bearbeiten</p>
                  <h3 className="text-lg font-semibold text-white">SKU {editingProduct.sku}</h3>
                </div>
                <button
                  type="button"
                  onClick={resetEditing}
                  className="text-sm text-slate-400 transition hover:text-slate-200"
                >
                  Schließen
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="text-slate-300">SKU</span>
                  <input
                    value={editForm.sku}
                    onChange={event => setEditForm(form => ({ ...form, sku: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-slate-300">EAN / GTIN</span>
                  <input
                    value={editForm.ean}
                    onChange={event => setEditForm(form => ({ ...form, ean: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="z. B. 4006381333931"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-slate-300">Name</span>
                  <input
                    value={editForm.name}
                    onChange={event => setEditForm(form => ({ ...form, name: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-slate-300">Einheit</span>
                  <input
                    value={editForm.unit}
                    onChange={event => setEditForm(form => ({ ...form, unit: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-slate-300">Preis (netto)</span>
                  <input
                    value={editForm.price}
                    onChange={event => setEditForm(form => ({ ...form, price: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="z. B. 4,99"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-slate-300">Lieferant</span>
                  <input
                    value={editForm.supplierName}
                    onChange={event => setEditForm(form => ({ ...form, supplierName: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-slate-300">Lieferantennummer</span>
                  <input
                    value={editForm.supplierNumber}
                    onChange={event => setEditForm(form => ({ ...form, supplierNumber: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </label>
              </div>

              {productError && (
                <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{productError}</p>
              )}
              {productMessage && (
                <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                  {productMessage}
                </p>
              )}

              <div className="flex items-center justify-end gap-3">
                <button
                  type="submit"
                  disabled={isSavingProduct}
                  className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-indigo-500/60"
                >
                  {isSavingProduct ? 'Speichere…' : 'Speichern'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
