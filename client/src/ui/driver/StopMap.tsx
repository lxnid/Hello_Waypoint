import { MapPin, Navigation } from 'lucide-react';

type Location = {
  address?: string | null | undefined;
  latitude?: string | null | undefined;
  longitude?: string | null | undefined;
  outlet_name?: string | null | undefined;
};

export function StopMap({ location, online }: { location: Location; online: boolean }) {
  const destination =
    location.latitude != null && location.longitude != null
      ? `${location.latitude},${location.longitude}`
      : location.address;
  const key = import.meta.env.VITE_GOOGLE_MAPS_EMBED_KEY as string | undefined;

  if (!destination)
    return (
      <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface p-5 text-center text-sm text-muted">
        <MapPin size={28} />
        <p>
          Outlet location has not been recorded.
          <br />
          Confirm the destination with dispatch.
        </p>
      </div>
    );

  const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;

  return (
    <div className="space-y-3">
      {online && key ? (
        <div className="relative overflow-hidden rounded-2xl border border-border shadow-sm">
          <iframe
            title="Delivery destination on Google Maps"
            className="h-64 w-full border-0"
            src={`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(destination)}`}
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
          />
          <a
            className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-control bg-white/95 px-3 py-1.5 text-xs font-semibold text-primary shadow backdrop-blur hover:bg-white"
            href={directions}
            target="_blank"
            rel="noreferrer"
          >
            <Navigation size={14} />
            Directions
          </a>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-2xl border border-stone-200 bg-[#E8ECEF] min-h-60 p-4 flex flex-col justify-between shadow-sm">
          {/* Stylized vector map pattern resembling modern mobile navigation */}
          <svg
            className="absolute inset-0 w-full h-full opacity-40 pointer-events-none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <pattern id="grid-pattern" width="60" height="60" patternUnits="userSpaceOnUse">
                <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#94A3B8" strokeWidth="1" />
                <path d="M 0 30 Q 30 10 60 30" fill="none" stroke="#CBD5E1" strokeWidth="3" />
                <path d="M 30 0 Q 10 30 30 60" fill="none" stroke="#CBD5E1" strokeWidth="2.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid-pattern)" />
            <path
              d="M 20 220 C 80 180, 140 160, 180 110 C 220 60, 260 90, 320 50"
              fill="none"
              stroke="#2563EB"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <path
              d="M 20 220 C 80 180, 140 160, 180 110 C 220 60, 260 90, 320 50"
              fill="none"
              stroke="#60A5FA"
              strokeWidth="2"
              strokeDasharray="4 4"
              strokeLinecap="round"
            />
          </svg>

          <div className="relative z-10 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-stone-700 shadow-sm backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Route Preview
            </span>
            <span className="text-[11px] text-stone-500 font-medium bg-white/80 px-2 py-0.5 rounded">
              {online ? 'Maps Ready' : 'Offline Mode'}
            </span>
          </div>

          <div className="relative z-10 flex flex-col items-center justify-center my-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white shadow-xl ring-4 ring-white/90">
              <MapPin size={22} className="fill-current text-white" />
            </div>
            <p className="mt-2.5 text-xs font-semibold text-stone-800 bg-white/95 px-3 py-1 rounded-full shadow-sm max-w-[85%] truncate">
              {location.outlet_name ?? location.address ?? destination}
            </p>
          </div>

          <div className="relative z-10 flex justify-end">
            <a
              className="inline-flex items-center gap-1.5 rounded-control bg-white/95 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm hover:bg-white transition-colors"
              href={directions}
              target="_blank"
              rel="noreferrer"
            >
              <Navigation size={14} />
              Open directions
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
