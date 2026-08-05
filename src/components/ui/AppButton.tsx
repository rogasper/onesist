import { Button, type ButtonProps } from "@cloudflare/kumo";
import type { CSSProperties } from "react";

export type AppButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "outline"
  | "destructive"
  | "secondary-destructive"
  | "success"
  | "warning"
  | "chip";

export type AppButtonActiveColor = "brand" | "success" | "warning";

/**
 * Replicate Kumo's liquid emphasis vars (see Button source: emphasis-bg/ring/gradient
 * are computed from the base color). Custom color variants inject the same vars via
 * inline style so they get the identical liquid gradient effect as variant="primary".
 */
const EMPHASIS_COLORS: Partial<Record<AppButtonVariant, string>> = {
  success: "var(--color-kumo-success)",
  warning: "var(--color-kumo-warning)",
};

function makeEmphasisVars(base: string): CSSProperties {
  return {
    "--kumo-button-emphasis-ring": `color-mix(in oklch, ${base}, black 10%)`,
    "--kumo-button-emphasis-bg": `color-mix(in oklch, ${base}, white 30%)`,
    "--kumo-button-emphasis-gradient-start": `color-mix(in oklch, ${base}, white 15%)`,
    "--kumo-button-emphasis-gradient-end": base,
  } as CSSProperties;
}

export interface AppButtonProps extends Omit<ButtonProps, "variant" | "shape"> {
  variant?: AppButtonVariant;
  /** Toggle state for chip-style buttons (file selectors, view switches). */
  active?: boolean;
  /** Emphasis color for the chip active state — renders like a mini variant="primary". */
  activeColor?: AppButtonActiveColor;
  /** Liquid accent override (brand | success | warning). */
  "data-accent"?: string;
}

const CHIP_BASE =
  "rounded-full bg-kumo-elevated ring-1 ring-kumo-line/50 text-kumo-subtle not-disabled:hover:bg-kumo-tint not-disabled:hover:text-kumo-default";
const CHIP_ACTIVE = "liquid-wash font-medium";

export function AppButton({
  variant = "secondary",
  active,
  activeColor = "brand",
  className,
  style,
  "data-accent": dataAccent,
  ...props
}: AppButtonProps) {
  const isChip = variant === "chip";
  const base = variant ? EMPHASIS_COLORS[variant] : undefined;
  const kumoVariant = base
    ? "primary"
    : isChip
      ? "ghost"
      : variant;
  return (
    <Button
      variant={kumoVariant as ButtonProps["variant"]}
      shape="base"
      data-accent={isChip && active ? dataAccent ?? activeColor : undefined}
      className={
        isChip
          ? `${CHIP_BASE} ${active ? CHIP_ACTIVE : ""}${className ? ` ${className}` : ""}`
          : className
      }
      style={
        base && kumoVariant === "primary"
          ? { ...style, ...makeEmphasisVars(base) }
          : style
      }
      {...props}
    />
  );
}
