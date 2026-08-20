import { MagnifyingGlass, X } from "@phosphor-icons/react";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** "pill" = rounded-full app-input (route headers); "compact" = FileTree-style box. */
  variant?: "pill" | "compact";
  /** Width class applied to the wrapper (e.g. w-72). */
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  variant = "pill",
  className = "",
}: SearchInputProps) {
  const pill = variant === "pill";
  return (
    <div className={`relative inline-flex items-center group shrink-0 ${className}`}>
      <MagnifyingGlass
        size={pill ? 13 : 11}
        className={`absolute top-1/2 -translate-y-1/2 text-kumo-subtle group-hover:text-kumo-default pointer-events-none transition-colors ${
          pill ? "left-2.5" : "left-2.5"
        }`}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={
          pill
            ? "w-full h-7 pl-7.5 pr-7 text-xs font-medium text-kumo-default placeholder:text-kumo-subtle rounded-full border border-kumo-line/80 bg-kumo-elevated hover:bg-kumo-elevated/80 hover:border-kumo-brand/50 focus:border-kumo-brand/80 focus:ring-1 focus:ring-kumo-brand/30 outline-none transition-all shadow-xs"
            : "w-full bg-kumo-elevated border border-kumo-line/80 rounded-md pl-6.5 pr-6 py-1 text-xs font-medium text-kumo-default placeholder:text-kumo-subtle hover:border-kumo-brand/50 focus:border-kumo-brand/80 focus:ring-1 focus:ring-kumo-brand/30 outline-none transition-all shadow-xs"
        }
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className={`absolute top-1/2 -translate-y-1/2 text-kumo-subtle hover:text-kumo-default p-0.5 rounded transition-colors ${
            pill ? "right-2" : "right-1.5"
          }`}
          title="Clear search"
        >
          <X size={pill ? 11 : 10} weight="bold" />
        </button>
      )}
    </div>
  );
}
