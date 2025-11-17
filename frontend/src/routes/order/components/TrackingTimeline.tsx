import type { OrderStatus, TrackingEvent } from '../../../api/order';

type Props = {
  events: TrackingEvent[];
  currentStatus: OrderStatus;
};

const STATUS_ORDER: OrderStatus[] = [
  'SUBMITTED',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
];

export default function TrackingTimeline({ events, currentStatus }: Props) {
  const merged = STATUS_ORDER.map(status => {
    const event = events.find(entry => entry.status === status);
    return {
      status,
      label: event?.notes ?? labelForStatus(status),
      createdAt: event?.createdAt,
      isActive: status === currentStatus,
      isCompleted: STATUS_ORDER.indexOf(status) <= STATUS_ORDER.indexOf(currentStatus),
    };
  });

  return (
    <ol className="relative border-l border-slate-200 pl-6">
      {merged.map(item => (
        <li key={item.status} className="mb-6 last:mb-0">
          <div className="absolute -left-2.5 mt-1 h-3 w-3 rounded-full border-2 border-white shadow" style={{ backgroundColor: item.isCompleted ? '#10b981' : '#cbd5f5' }} />
          <p className="text-sm font-semibold text-slate-900">{labelForStatus(item.status)}</p>
          <p className="text-xs text-slate-500">{item.label}</p>
          {item.createdAt && (
            <p className="text-xs text-slate-400">{new Date(item.createdAt).toLocaleString('de-DE')}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

function labelForStatus(status: OrderStatus) {
  switch (status) {
    case 'SUBMITTED':
      return 'Eingegangen';
    case 'CONFIRMED':
      return 'Bestätigt';
    case 'PREPARING':
      return 'Produktion';
    case 'READY':
      return 'Bereit zur Abholung';
    case 'OUT_FOR_DELIVERY':
      return 'Unterwegs';
    case 'DELIVERED':
      return 'Zugestellt';
    case 'CANCELLED':
      return 'Storniert';
    default:
      return status;
  }
}
