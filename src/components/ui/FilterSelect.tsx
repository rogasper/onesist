import type { SelectHTMLAttributes, ReactNode } from "react";
import { CaretDown } from "@phosphor-icons/react";

export interface FilterSelectOption {
  value: string;
  label: string;
}

interface FilterSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  options?: FilterSelectOption[];
  onChange?: (value: string) => void;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
  containerClassName?: string;
}

export function FilterSelect({
  value,
  onChange,
  options,
  icon,
  children,
  className = "",
  containerClassName = "",
  disabled,
  ...props
}: FilterSelectProps) {
  return (
    <div className={`relative inline-flex items-center group shrink-0 ${containerClassName}`}>
      {icon && (
        <span className="absolute left-2.5 pointer-events-none text-kumo-subtle flex items-center z-10">
          {icon}
        </span>
      )}
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        className={`appearance-none h-7 text-xs font-medium rounded-full border border-kumo-line/80 bg-kumo-elevated text-kumo-default outline-none focus:border-kumo-brand/80 focus:ring-1 focus:ring-kumo-brand/30 ${
          icon ? "pl-7" : "pl-3"
        } pr-6 cursor-pointer hover:border-kumo-brand/50 hover:bg-kumo-elevated/80 transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        {...props}
      >
        {options
          ? options.map((opt) => (
              <option
                key={opt.value}
                value={opt.value}
                className="bg-neutral-900 text-neutral-200 py-1"
              >
                {opt.label}
              </option>
            ))
          : children}
      </select>
      <span className="absolute right-2 pointer-events-none text-kumo-subtle group-hover:text-kumo-default flex items-center transition-colors">
        <CaretDown size={11} weight="bold" />
      </span>
    </div>
  );
}

