import type { DriverLocationPoint, OrderStatus } from '../../../api/order';

type Props = {
  points: DriverLocationPoint[];
  status: OrderStatus;
};

function normalize(points: DriverLocationPoint[]) {
  if (!points.length) {
    return [];
  }
  const lats = points.map(point => point.latitude);
  const lngs = points.map(point => point.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latDelta = maxLat - minLat || 0.0001;
  const lngDelta = maxLng - minLng || 0.0001;
  return points.map(point => ({
    id: point.id,
    x: ((point.longitude - minLng) / lngDelta) * 100,
    y: 100 - ((point.latitude - minLat) / latDelta) * 100,
    label: point.driverStatus,
    recordedAt: point.recordedAt,
  }));
}

export default function TrackingMap({ points, status }: Props) {
  const normalized = normalize(points);
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-4 text-white">
      <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
      <div className="relative flex h-full w-full flex-col justify-between">
        <div className="flex items-center justify-between text-sm">
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-wide">Live-Tracking</span>
          <span className="text-xs text-slate-200">Status: {status.replace(/_/g, ' ')}</span>
        </div>
        <div className="relative mt-4 h-full w-full">
          {normalized.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-200">
              Noch keine Standortdaten verfügbar.
            </p>
          )}
          {normalized.map((point, index) => (
            <div
              key={point.id}
              className="absolute flex items-center gap-2"
              style={{ left: `${point.x}%`, top: `${point.y}%`, transform: 'translate(-50%, -50%)' }}
            >
              <span
                className={`flex h-3 w-3 rounded-full ${index === normalized.length - 1 ? 'bg-emerald-400 shadow shadow-emerald-500/50' : 'bg-white/50'}`}
              />
              {index === normalized.length - 1 && (
                <span className="rounded-full bg-white/20 px-2 py-1 text-xs">
                  {point.label ?? 'Unterwegs'}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
