import type { ChangeEventHandler } from 'react';

type FormFieldProps = {
  id: string;
  label: string;
  type: 'email' | 'password';
  value: string;
  placeholder: string;
  autoComplete: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
};

export function FormField({
  id,
  label,
  type,
  value,
  placeholder,
  autoComplete,
  onChange,
}: FormFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[#555555] text-xs leading-[1.4]">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        onChange={onChange}
        className="w-full min-h-[56px] px-[18px] text-primary bg-surface border border-border rounded-control outline-none placeholder:text-[#999999] focus-visible:bg-white focus-visible:border-primary focus-visible:outline-3 focus-visible:outline-chilled focus-visible:outline-offset-3"
      />
    </div>
  );
}
