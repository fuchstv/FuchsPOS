import { useEffect, useMemo, useState } from 'react';
import type { FulfillmentSlot, FulfillmentType } from '../../../api/order';
import { useOrderStore } from '../../../store/orderStore';

interface SlotPickerProps {
  type: FulfillmentType;
}

const formatTimeRange = (slot: FulfillmentSlot) => {
  const start = new Date(slot.startsAt).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const end = new Date(slot.endsAt).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const date = new Date(slot.startsAt).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
  return `${date} • ${start} – ${end}`;
};

export default function SlotPicker({ type }: SlotPickerProps) {
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().slice(0, 10));
  const { slotOptions, slotLoading, slotError, fetchSlots, reserveSlot, selectedSlot } = useOrderStore(state => ({
    slotOptions: state.slotOptions,
    slotLoading: state.slotLoading,
    slotError: state.slotError,
    fetchSlots: state.fetchSlots,
    reserveSlot: state.reserveSlot,
    selectedSlot: state.selectedSlot,
  }));

  useEffect(() => {
    fetchSlots(type, dateFilter);
  }, [type, dateFilter, fetchSlots]);

  const filteredSlots = useMemo(
    () => slotOptions.filter(slot => slot.type === type),
    [slotOptions, type],
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Liefer- &amp; Abholslots</h3>
          <p className="text-sm text-slate-500">
            Reserviere ein Zeitfenster. Die Kapazitäten werden in Echtzeit aktualisiert.
          </p>
        </div>
        <label className="text-sm text-slate-600">
          Datum
          <input
            type="date"
            value={dateFilter}
            onChange={event => setDateFilter(event.target.value)}
            className="ml-2 rounded-lg border border-slate-200 px-3 py-1 text-sm"
          />
        </label>
      </div>

      {slotLoading && <p className="mt-4 text-sm text-slate-500">Lade verfügbare Slots…</p>}
      {slotError && <p className="mt-4 text-sm text-red-500">{slotError}</p>}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {!slotLoading && filteredSlots.length === 0 && (
          <p className="text-sm text-slate-500">Für den gewählten Tag sind keine Slots verfügbar.</p>
        )}
        {filteredSlots.map(slot => {
          const remaining = Math.max(slot.remainingCapacity, 0);
          const isSelected = selectedSlot?.id === slot.id;
          const disabled = remaining === 0;
          return (
            <button
              key={slot.id}
              type="button"
              disabled={disabled}
              onClick={() => reserveSlot(slot)}
              className={[
                'rounded-2xl border p-4 text-left transition',
                disabled
                  ? 'border-slate-200 bg-slate-100 text-slate-400'
                  : isSelected
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow'
                    : 'border-slate-200 bg-white text-slate-900 hover:border-indigo-200 hover:bg-indigo-50',
              ].join(' ')}
            >
              <p className="text-sm font-semibold">{formatTimeRange(slot)}</p>
              <p className="text-xs text-slate-500">Kapazität: {remaining} / {slot.capacity}</p>
              {slot.instructions && <p className="mt-1 text-xs text-slate-500">{slot.instructions}</p>}
              {isSelected && <p className="mt-1 text-xs font-semibold text-indigo-600">Slot reserviert</p>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
