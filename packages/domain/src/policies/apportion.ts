/**
 * Splits a non-negative integer centime `totalMad` into one share per weight,
 * proportional to `weights`, using the **largest-remainder method** so the shares
 * sum back to `totalMad` exactly — no centime is created or lost. This is the one
 * rounding rule the money-splitting policies share (teacher-fee attribution,
 * subject-revenue attribution, collected-fee proration), so a change to how the
 * residual centimes fall lands in exactly one place (SOU-298).
 *
 * Each share gets `floor(totalMad * weight / totalWeight)`; the leftover centimes
 * (always fewer than the number of weights) go one each to the shares with the
 * largest fractional remainder, ties broken by original order — deterministic for
 * a given input, which is what lets two devices compute identical splits.
 *
 * When `totalWeight` is zero — every weight is `0`, the legacy/unpriced-formula
 * case (SOU-298) — the split degrades to an **equal** one: `floor(totalMad / n)`
 * each, the leftover to the first shares in order. That reproduces the pre-weighted
 * equal split byte-for-byte, so an un-priced formula's attribution never changes.
 *
 * Callers guarantee `totalMad` is a non-negative integer and `weights` are
 * non-negative integers; the policies that call this validate their own inputs.
 */
export function apportionByWeight(totalMad: number, weights: readonly number[]): number[] {
  const count = weights.length;
  if (count === 0) return [];

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) {
    return equalApportion(totalMad, count);
  }

  const shares = weights.map((weight, index) => {
    const raw = (totalMad * weight) / totalWeight;
    const base = Math.floor(raw);
    return { index, base, remainder: raw - base };
  });

  let leftover = totalMad - shares.reduce((sum, share) => sum + share.base, 0);
  for (const share of [...shares].sort((a, b) => b.remainder - a.remainder)) {
    if (leftover <= 0) break;
    share.base += 1;
    leftover -= 1;
  }

  return shares.map((share) => share.base);
}

function equalApportion(totalMad: number, count: number): number[] {
  const base = Math.floor(totalMad / count);
  const remainder = totalMad - base * count;
  return Array.from({ length: count }, (_unused, index) => base + (index < remainder ? 1 : 0));
}
