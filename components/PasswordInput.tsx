'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minLength?: number;
  required?: boolean;
  name?: string;
};

export default function PasswordInput({
  label,
  value,
  onChange,
  placeholder = '',
  minLength,
  required,
  name,
}: Props) {
  const [show, setShow] = useState(false);

  return (
    <div className="space-y-1">
      <label className="text-sm">{label}</label>
      <div className="relative">
        <input
          name={name}
          type={show ? 'text' : 'password'}
          className="w-full border rounded p-2 pr-10"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          minLength={minLength}
          required={required}
          autoComplete="new-password"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100"
          aria-label={show ? 'Hide password' : 'Show password'}
          title={show ? 'Hide' : 'Show'}
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}