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
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        onChange={onChange}
      />
    </div>
  );
}
