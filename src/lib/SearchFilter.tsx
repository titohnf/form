"use client";

// Satu tampilan cari-dan-saring untuk seluruh dashboard: kolom telanjang di atas
// latar halaman, tanpa kotak pembungkus, tiap kolomnya putih sendiri.

const FIELD =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900";

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  autoFocus,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative min-w-0 flex-1 ${className}`}>
      <svg
        className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
        />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        autoFocus={autoFocus}
        className={`${FIELD} w-full py-2 pr-3 pl-9`}
      />
    </div>
  );
}

export function FilterSelect<T extends string>({
  value,
  onChange,
  label,
  children,
}: {
  value: T;
  onChange: (v: T) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      aria-label={label}
      className={FIELD}
    >
      {children}
    </select>
  );
}
