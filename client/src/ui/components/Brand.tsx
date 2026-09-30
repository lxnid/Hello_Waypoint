type BrandProps = {
  context?: string;
  inverse?: boolean;
};

export function Brand({ context = 'OPERATIONS', inverse = false }: BrandProps) {
  return (
    <div className="brand" data-inverse={inverse || undefined} aria-label={`Waypoint ${context}`}>
      <span className="brand-word">WAYPOINT</span>
      <span className="brand-context">{context}</span>
    </div>
  );
}
