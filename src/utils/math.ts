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
