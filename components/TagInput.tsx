'use client';

import { useMemo, useRef, useState } from 'react';

type Props = {
  value: string[];                               // current tags
  onChange: (tags: string[]) => void;            // notify parent
  placeholder?: string;
  disabled?: boolean;
};

export default function TagInput({ value, onChange, placeholder, disabled }: Props) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const tags = value ?? [];

  function addTag(raw: string) {
    const t = raw.trim().replace(/\s+/g, ' ');
    if (!t) return;
    // avoid duplicates (case insensitive)
    const exists = tags.some((x) => x.toLowerCase() === t.toLowerCase());
    if (exists) return;
    onChange([...tags, t]);
    setInput('');
  }

  function removeTag(idx: number) {
    const next = [...tags];
    next.splice(idx, 1);
    onChange(next);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;

    // Add on Enter or comma
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (input) addTag(input);
    }

    // Backspace with empty input removes last tag
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      e.preventDefault();
      removeTag(tags.length - 1);
    }
  }

  function handleBlur() {
    // Add whatever is typed when the field loses focus
    if (input) addTag(input);
  }

  // Render
  return (
    <div
      className={`min-h-[42px] w-full rounded-md border bg-white px-2 py-1 flex flex-wrap items-center gap-2 ${
        disabled ? 'opacity-60 pointer-events-none' : 'focus-within:ring-2 ring-indigo-500'
      }`}
    >
      {tags.map((t, i) => (
        <span
          key={`${t}-${i}`}
          className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-xs text-indigo-700"
        >
          {t}
          <button
            type="button"
            onClick={() => removeTag(i)}
            className="rounded-full px-1 hover:bg-indigo-100"
            aria-label={`Remove ${t}`}
          >
            ×
          </button>
        </span>
      ))}

      <input
        ref={inputRef}
        className="flex-1 min-w-[140px] outline-none text-sm py-1"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder ?? 'Type and press comma'}
      />
    </div>
  );
}