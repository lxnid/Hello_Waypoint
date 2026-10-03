import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  icon?: ReactNode;
  variant?: 'primary' | 'secondary';
};

export function Button({
  children,
  icon,
  variant = 'primary',
  className = '',
  ...props
}: ButtonProps) {
  const variantStyles =
    variant === 'primary'
      ? 'text-white bg-primary border-primary disabled:text-[#6b6b6b] disabled:bg-disabled disabled:border-disabled'
      : 'text-primary bg-transparent border-border disabled:text-[#6b6b6b] disabled:bg-disabled disabled:border-disabled';

  return (
    <button
      className={`inline-flex items-center justify-center gap-2.5 min-h-[52px] px-5 border rounded-control text-sm font-semibold cursor-pointer transition-opacity hover:enabled:opacity-[0.82] disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-chilled focus-visible:outline-offset-3 ${variantStyles} ${className}`}
      data-variant={variant}
      {...props}
    >
      <span>{children}</span>
      {icon}
    </button>
  );
}
