import { MapPin, Navigation } from 'lucide-react';
type Location = { address?: string | null; latitude?: string | null; longitude?: string | null };
export function StopMap({ location, online }: { location: Location; online: boolean }) {
  const destination =
    location.latitude != null && location.longitude != null
      ? `${location.latitude},${location.longitude}`
      : location.address;
  const key = import.meta.env.VITE_GOOGLE_MAPS_EMBED_KEY as string | undefined;
  if (!destination)
    return (
      <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-card border border-dashed border-border bg-surface p-5 text-center text-sm text-muted">
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
        <iframe
          title="Delivery destination on Google Maps"
          className="h-64 w-full rounded-card border-0"
          src={`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(destination)}`}
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : (
        <div className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-card border border-border bg-surface p-5 text-center">
          <MapPin size={28} />
          <p className="text-sm">{location.address ?? destination}</p>
          <p className="text-xs text-muted">
            {online
              ? 'Open Google Maps for directions.'
              : 'Saved destination · map requires connectivity.'}
          </p>
        </div>
      )}
      <a
        className="flex min-h-12 items-center justify-center gap-2 rounded-control border border-border bg-white px-4 text-sm font-medium"
        href={directions}
        target="_blank"
        rel="noreferrer"
      >
        <Navigation size={18} />
        Open directions
      </a>
    </div>
  );
}
