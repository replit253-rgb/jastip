export type ShippingMinimumConfig = {
  enabled: boolean;
  minimumAmount: number;
};

/**
 * Applies a configured minimum to one aggregate shipping amount.
 * A missing/disabled configuration deliberately preserves the old amount.
 */
export function applyShippingMinimum(
  normalAmount: number,
  config: ShippingMinimumConfig | null,
): number {
  const normalizedAmount = Math.max(0, Math.round(normalAmount));
  if (!config?.enabled) return normalizedAmount;
  return Math.max(normalizedAmount, Math.max(0, Math.round(config.minimumAmount)));
}

/**
 * Distributes an aggregate amount across package rows while keeping the sum
 * exact. The minimum is a customer/service total, not a per-row floor.
 */
export function distributeShippingTotal(
  totalAmount: number,
  weights: number[],
): number[] {
  const target = Math.max(0, Math.round(totalAmount));
  const normalizedWeights = weights.map((weight) => Math.max(0, Number(weight) || 0));
  const weightTotal = normalizedWeights.reduce((sum, weight) => sum + weight, 0);
  const shares =
    weightTotal > 0
      ? normalizedWeights.map((weight) => (weight / weightTotal) * target)
      : normalizedWeights.map(() => target / Math.max(1, normalizedWeights.length));
  const result = shares.map((share) => Math.floor(share));
  let remainder = target - result.reduce((sum, amount) => sum + amount, 0);
  for (let index = 0; remainder > 0 && index < result.length; index += 1) {
    result[index] += 1;
    remainder -= 1;
  }
  return result;
}