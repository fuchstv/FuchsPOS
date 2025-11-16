import { FormEvent, useCallback, useMemo, useState } from 'react';
import { lookupEan, type EanLookupResponse } from '../../../api/integrations';

const statusTone: Record<EanLookupResponse['status'], string> = {
  FOUND: 'bg-emerald-500/10 text-emerald-200 border-emerald-400/60',
  NOT_FOUND: 'bg-amber-500/10 text-amber-200 border-amber-400/60',
  ERROR: 'bg-rose-500/10 text-rose-200 border-rose-400/60',
};

function ResultDetails({ result }: { result: EanLookupResponse }) {
  const entries = useMemo(() => {
    const list: Array<{ label: string; value: string | null | undefined }> = [
      { label: 'Produktname', value: result.name },
      { label: 'Marke / Hersteller', value: result.brand },
      { label: 'Kategorie', value: result.mainCategory },
      { label: 'Unterkategorie', value: result.subCategory },
      { label: 'Beschreibung', value: result.description },
    ];
    return list;
  }, [result]);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
      <div className="flex flex-wrap items-center gap-3">
        <div className="font-mono text-xs text-indigo-200">EAN: {result.ean}</div>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone[result.status]}`}>
          {result.status === 'FOUND' && 'Treffer'}
          {result.status === 'NOT_FOUND' && 'Nicht gefunden'}
          {result.status === 'ERROR' && 'Fehler'}
        </span>
        {result.message && <span className="text-xs text-slate-400">{result.message}</span>}
      </div>

      <dl className="mt-4 grid gap-3 md:grid-cols-2">
        {entries.map(entry => (
          <div key={entry.label}>
            <dt className="text-xs uppercase tracking-wide text-slate-500">{entry.label}</dt>
            <dd className="text-sm text-slate-100">{entry.value?.trim() || '—'}</dd>
          </div>
        ))}
      </dl>

      <details className="mt-4 text-xs text-slate-500">
        <summary className="cursor-pointer select-none text-slate-400">Rohdaten anzeigen</summary>
        <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-900/70 p-3 text-[11px] text-slate-300">
          {JSON.stringify(result.raw, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export default function EanLookup() {
  const [ean, setEan] = useState('');
  const [result, setResult] = useState<EanLookupResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setIsLoading(true);
      setError(null);
      setResult(null);
      try {
        const lookupResult = await lookupEan(ean);
        setResult(lookupResult);
      } catch (submissionError) {
        const message =
          submissionError instanceof Error ? submissionError.message : 'Abfrage fehlgeschlagen. Bitte erneut versuchen.';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [ean],
  );

  return (
    <section className="space-y-4">
      <header>
        <p className="text-xs uppercase tracking-wide text-indigo-400">EAN Datenbank</p>
        <h2 className="text-xl font-semibold text-white">Produkte per Barcode nachschlagen</h2>
        <p className="text-sm text-slate-400">
          Suchen Sie Produktinformationen direkt in der OpenGTIN-Datenbank, indem Sie eine EAN eingeben oder einscannen.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-3 rounded-xl border border-slate-900 bg-slate-950/60 p-4 shadow-inner shadow-black/30 md:flex-row"
      >
        <div className="flex-1">
          <label htmlFor="ean-input" className="text-xs font-medium uppercase tracking-wide text-slate-400">
            EAN / Barcode
          </label>
          <input
            id="ean-input"
            type="text"
            inputMode="numeric"
            placeholder="z.B. 4006381333931"
            value={ean}
            onChange={event => setEan(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 font-mono text-sm text-white focus:border-indigo-400 focus:outline-none"
          />
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center justify-center rounded-md bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? 'Suche…' : 'EAN nachschlagen'}
          </button>
        </div>
      </form>

      {error && (
        <p className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p>
      )}

      {result && <ResultDetails result={result} />}
    </section>
  );
}
