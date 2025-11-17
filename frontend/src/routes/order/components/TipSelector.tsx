import { useState } from 'react';

type Props = {
  options: number[];
  value?: number | null;
  onChange: (value: number | null) => void;
};

export default function TipSelector({ options, value, onChange }: Props) {
  const [customValue, setCustomValue] = useState('');
  const handleCustomChange = (input: string) => {
    setCustomValue(input);
    const parsed = Number(input.replace(',', '.'));
    if (!Number.isNaN(parsed)) {
      onChange(parsed);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {options.map(option => (
          <button
            type="button"
            key={option}
            onClick={() => onChange(option)}
            className={`rounded-full border px-4 py-1 text-sm font-semibold ${value === option ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'}`}
          >
            {option === 0 ? 'Kein Trinkgeld' : `+${option.toFixed(2)} €`}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <label className="text-xs font-semibold text-slate-600">Individueller Betrag</label>
        <input
          type="text"
          value={customValue}
          onChange={event => handleCustomChange(event.target.value)}
          placeholder="z. B. 3,50"
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        />
      </div>
    </div>
  );
}
