import { useState, type FormEvent } from 'react';
import TipSelector from './TipSelector';

type Props = {
  tipSuggestions: number[];
  existingFeedback?: {
    rating: number;
    comment?: string | null;
    tipAmount?: string | null;
    tipCurrency?: string | null;
    driverMood?: string | null;
  };
  submitting: boolean;
  disabled?: boolean;
  onSubmit: (values: FeedbackFormValues) => void | Promise<void>;
};

export type FeedbackFormValues = {
  rating: number;
  comment?: string;
  tipAmount?: number | null;
  tipCurrency?: string;
  driverMood?: string;
  contactConsent?: boolean;
};

export default function FeedbackForm({ tipSuggestions, existingFeedback, submitting, disabled, onSubmit }: Props) {
  const [rating, setRating] = useState(existingFeedback?.rating ?? 5);
  const [comment, setComment] = useState(existingFeedback?.comment ?? '');
  const [tipAmount, setTipAmount] = useState<number | null>(
    existingFeedback?.tipAmount ? Number(existingFeedback.tipAmount) : null,
  );
  const [driverMood, setDriverMood] = useState(existingFeedback?.driverMood ?? 'SEHR_ZUFRIEDEN');
  const [contactConsent, setContactConsent] = useState(false);

  if (existingFeedback) {
    return (
      <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-semibold text-slate-900">Danke für dein Feedback!</p>
        <p>Bewertung: {existingFeedback.rating} / 5</p>
        {existingFeedback.comment && <p className="mt-2 italic">“{existingFeedback.comment}”</p>}
        {existingFeedback.tipAmount && (
          <p className="mt-2">Trinkgeld: {Number(existingFeedback.tipAmount).toFixed(2)} €</p>
        )}
      </div>
    );
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      rating,
      comment: comment || undefined,
      tipAmount: tipAmount ?? undefined,
      tipCurrency: 'EUR',
      driverMood,
      contactConsent,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-sm">
      <div>
        <p className="font-semibold text-slate-900">Wie zufrieden bist du?</p>
        <div className="mt-2 flex gap-2">
          {[1, 2, 3, 4, 5].map(value => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              className={`h-10 w-10 rounded-full border text-sm font-semibold ${value <= rating ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500'}`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="font-semibold text-slate-900">Kommentar (optional)</label>
        <textarea
          value={comment}
          onChange={event => setComment(event.target.value)}
          rows={3}
          className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          placeholder="Was hat besonders gut geklappt?"
        />
      </div>
      <div>
        <label className="font-semibold text-slate-900">Stimmung des Fahrers / Service</label>
        <select
          value={driverMood}
          onChange={event => setDriverMood(event.target.value)}
          className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        >
          <option value="SEHR_ZUFRIEDEN">Top (5 Sterne)</option>
          <option value="ZUFRIEDEN">Zufrieden</option>
          <option value="NEUTRAL">Neutral</option>
          <option value="UNZUFRIEDEN">Verbesserungswürdig</option>
        </select>
      </div>
      <div>
        <label className="font-semibold text-slate-900">Trinkgeld</label>
        <TipSelector options={tipSuggestions} value={tipAmount} onChange={setTipAmount} />
      </div>
      <label className="flex items-start gap-2 text-xs text-slate-500">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={contactConsent}
          onChange={event => setContactConsent(event.target.checked)}
        />
        Ich bin mit einer Kontaktaufnahme zur Qualitätssicherung einverstanden.
      </label>
      <button
        type="submit"
        disabled={disabled || submitting}
        className="w-full rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Feedback senden
      </button>
    </form>
  );
}
