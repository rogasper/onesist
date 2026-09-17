/**
 * Cost estimation (Fase 5.5).
 *
 * Deliberately arithmetic over a price the USER supplied, with no built-in price
 * table. Model prices differ per provider, change without notice, and a stale
 * table would produce a confident wrong number — the worst possible output for a
 * cost feature. When no price is configured the estimate is `null`, and the UI
 * shows tokens alone rather than a made-up amount.
 *
 * Kept as a pure function so the arithmetic (per MILLION tokens, and the
 * input/output asymmetry) is testable without a database or a model call.
 */
export interface CostInput {
  inputTokens: number | null;
  outputTokens: number | null;
  inputPricePerMTok: number | null;
  outputPricePerMTok: number | null;
}

export interface CostEstimate {
  /** Total in the provider's currency (the unit the user typed the price in). */
  amount: number;
  currency: "usd";
  /** True when only ONE of the two prices was set, so the missing side was not
   *  charged. Surfaced so the UI can say the number is partial. */
  partial: boolean;
}

export function estimateCost(input: CostInput): CostEstimate | null {
  const inTok = Number.isFinite(input.inputTokens) ? Math.max(0, input.inputTokens ?? 0) : 0;
  const outTok = Number.isFinite(input.outputTokens) ? Math.max(0, input.outputTokens ?? 0) : 0;
  if (inTok === 0 && outTok === 0) return null;

  const inPrice = input.inputPricePerMTok;
  const outPrice = input.outputPricePerMTok;
  const hasIn = typeof inPrice === "number" && Number.isFinite(inPrice) && inPrice >= 0;
  const hasOut = typeof outPrice === "number" && Number.isFinite(outPrice) && outPrice >= 0;
  if (!hasIn && !hasOut) return null;

  // An estimate is only honest if every side that HAS tokens also has a price.
  // Charging the known side and calling the rest zero looks like a real number:
  // 1M output tokens with no output price would render as "$0 (partial)", which a
  // reader takes as "cheap", not as "unknown".
  if (inTok > 0 && !hasIn) return null;
  if (outTok > 0 && !hasOut) return null;

  const amount = (hasIn ? (inTok / 1_000_000) * (inPrice as number) : 0) + (hasOut ? (outTok / 1_000_000) * (outPrice as number) : 0);
  // `partial` now only means "one side is priced and had no traffic" — the total is
  // complete for what actually ran.
  return { amount, currency: "usd", partial: hasIn !== hasOut };
}

/** Formats for display. Small amounts keep enough precision to be useful
 *  (a $0.0004 turn must not render as "$0.00"), larger ones drop to cents. */
export function formatCost(estimate: CostEstimate | null): string | null {
  if (!estimate) return null;
  const { amount, partial } = estimate;
  if (amount === 0) return partial ? "sebagian (harga tidak lengkap)" : "$0";
  const digits = amount < 0.01 ? 4 : 2;
  const text = `$${amount.toFixed(digits)}`;
  return partial ? `±${text} (sebagian)` : text;
}
