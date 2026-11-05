export function calculateIntegerPercentages<T extends { id: string }>(
  items: T[],
  getAmount: (item: T) => number
): Record<string, number> {
  const result: Record<string, number> = {};
  const total = items.reduce((sum, item) => sum + Math.max(0, getAmount(item)), 0);

  if (total <= 0) {
    items.forEach(item => { result[item.id] = 0; });
    return result;
  }

  const rawPcts = items.map(item => {
    const amt = Math.max(0, getAmount(item));
    const raw = (amt / total) * 100;
    const floor = Math.floor(raw);
    const remainder = raw - floor;
    return { id: item.id, amt, floor, remainder };
  });

  const currentSum = rawPcts.reduce((sum, x) => sum + x.floor, 0);
  let diff = 100 - currentSum;

  const sorted = [...rawPcts]
    .filter(x => x.amt > 0)
    .sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; i < sorted.length && diff > 0; i++) {
    sorted[i].floor += 1;
    diff -= 1;
  }

  rawPcts.forEach(x => {
    result[x.id] = x.floor;
  });

  return result;
}

/**
 * Split an integer total as evenly as possible among `count` recipients
 * using the largest-remainder (Hamilton-Hare) method.
 *
 * Guarantees:
 * - sum(result) === Math.round(total)
 * - max(result) - min(result) <= 1
 * - deterministic order (lower indices receive larger remainder first)
 */
export function splitEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const roundedTotal = Math.round(total);
  if (count === 1) return [roundedTotal];
  if (roundedTotal === 0) return new Array(count).fill(0);

  const isNegative = roundedTotal < 0;
  const absTotal = Math.abs(roundedTotal);
  const base = Math.floor(absTotal / count);
  const remainder = absTotal % count;

  const result = new Array(count);
  for (let i = 0; i < count; i++) {
    const val = i < remainder ? base + 1 : base;
    result[i] = isNegative ? -val : val;
  }
  return result;
}

/**
 * Split an integer total among recipients according to non-negative weights
 * using the largest-remainder (Hamilton-Hare) method.
 *
 * Guarantees:
 * - sum(result) === Math.round(total)
 * - each element is within 1 of its ideal fair share
 * - larger remainder receives the extra rupee
 * - deterministic order (tie-break by index ascending)
 */
export function splitByWeights(total: number, weights: number[]): number[] {
  const count = weights.length;
  if (count === 0) return [];
  const roundedTotal = Math.round(total);
  if (count === 1) return [roundedTotal];
  if (roundedTotal === 0) return new Array(count).fill(0);

  const totalWeight = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (totalWeight <= 0) {
    return splitEvenly(roundedTotal, count);
  }

  const isNegative = roundedTotal < 0;
  const absTotal = Math.abs(roundedTotal);

  const rawShares = weights.map((w, idx) => {
    const clampedWeight = Math.max(0, w);
    const raw = (clampedWeight / totalWeight) * absTotal;
    const floor = Math.floor(raw);
    const remainder = raw - floor;
    return { idx, floor, remainder };
  });

  const sumFloors = rawShares.reduce((acc, curr) => acc + curr.floor, 0);
  let diff = absTotal - sumFloors;

  // Sort descending by remainder, tie-break by index ascending
  const sorted = [...rawShares].sort((a, b) => {
    if (Math.abs(b.remainder - a.remainder) > 1e-9) {
      return b.remainder - a.remainder;
    }
    return a.idx - b.idx;
  });

  for (let i = 0; i < sorted.length && diff > 0; i++) {
    sorted[i].floor += 1;
    diff -= 1;
  }

  const result = new Array(count);
  for (let i = 0; i < count; i++) {
    const item = rawShares[i];
    result[i] = isNegative ? -item.floor : item.floor;
  }
  return result;
}
