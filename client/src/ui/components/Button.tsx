import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  icon?: ReactNode;
  variant?: 'primary' | 'secondary';
};

export function Button({ children, icon, variant = 'primary', ...props }: ButtonProps) {
  return (
    <button className="button" data-variant={variant} {...props}>
      <span>{children}</span>
      {icon}
    </button>
  );
}
