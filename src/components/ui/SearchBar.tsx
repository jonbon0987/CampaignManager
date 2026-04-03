import { X } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChange, placeholder = 'Search…' }: SearchBarProps) {
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-1.5 rounded text-sm outline-none pr-8"
        style={{
          backgroundColor: '#1a1828',
          color: '#e8d5b0',
          border: '1px solid #3a3660',
          fontFamily: 'Georgia, Cambria, serif',
        }}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors"
          style={{ color: '#6a6490', backgroundColor: 'transparent', border: 'none' }}
          aria-label="Clear search"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
