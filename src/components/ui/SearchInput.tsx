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
    <div className={`relative ${className}`}>
      <MagnifyingGlass
        size={pill ? 12 : 11}
        className={`absolute top-1/2 -translate-y-1/2 text-kumo-subtle pointer-events-none ${pill ? "left-2.5" : "left-3.5"}`}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={pill
          ? "app-input w-full h-7 pl-7 pr-6 text-xs text-kumo-default placeholder:text-kumo-subtle"
          : "w-full bg-kumo-elevated/60 border border-kumo-line rounded pl-6 pr-6 py-1 text-xs text-kumo-default placeholder:text-kumo-subtle focus:border-kumo-brand focus:outline-none"}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className={`absolute top-1/2 -translate-y-1/2 text-kumo-subtle hover:text-kumo-default ${pill ? "right-2" : "right-2.5"}`}
        >
          <X size={pill ? 12 : 10} />
        </button>
      )}
    </div>
  );
}
