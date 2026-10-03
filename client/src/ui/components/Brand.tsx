type BrandProps = {
  context?: string;
  inverse?: boolean;
  className?: string;
  wordClassName?: string;
  contextClassName?: string;
};

export function Brand({
  context = 'OPERATIONS',
  inverse = false,
  className = '',
  wordClassName = '',
  contextClassName = '',
}: BrandProps) {
  return (
    <div
      className={`inline-flex items-baseline gap-[5px] w-fit whitespace-nowrap ${
        inverse ? 'text-white' : 'text-primary'
      } ${className}`}
      data-inverse={inverse || undefined}
      aria-label={`Waypoint ${context}`}
    >
      <span className={`text-[22px] font-extrabold leading-none ${wordClassName}`}>WAYPOINT</span>
      <span
        className={`text-[15px] font-normal leading-none ${contextClassName}`}
      >
        {context}
      </span>
    </div>
  );
}
