import { describe, it, expect } from 'vitest';
import { splitEvenly, splitByWeights, calculateIntegerPercentages } from './math';

describe('splitEvenly', () => {
  it('splits 100 evenly among 3 members as [34, 33, 33]', () => {
    const res = splitEvenly(100, 3);
    expect(res).toEqual([34, 33, 33]);
    expect(res.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('splits 1001 evenly among 7 members with zero remainder', () => {
    const res = splitEvenly(1001, 7);
    expect(res).toEqual([143, 143, 143, 143, 143, 143, 143]);
    expect(res.reduce((a, b) => a + b, 0)).toBe(1001);
  });

  it('handles zero total correctly', () => {
    const res = splitEvenly(0, 5);
    expect(res).toEqual([0, 0, 0, 0, 0]);
    expect(res.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('handles zero or negative count', () => {
    expect(splitEvenly(100, 0)).toEqual([]);
    expect(splitEvenly(100, -2)).toEqual([]);
  });

  it('handles 1 member', () => {
    expect(splitEvenly(555, 1)).toEqual([555]);
  });

  it('property test: 200 random (total, count) pairs guarantee exact sum and difference <= 1', () => {
    for (let i = 0; i < 200; i++) {
      const total = Math.floor(Math.random() * 50000); // 0 to 50,000
      const count = Math.floor(Math.random() * 50) + 1; // 1 to 50
      const split = splitEvenly(total, count);

      expect(split.length).toBe(count);
      const sum = split.reduce((a, b) => a + b, 0);
      expect(sum).toBe(total);

      const max = Math.max(...split);
      const min = Math.min(...split);
      expect(max - min).toBeLessThanOrEqual(1);
    }
  });
});

describe('splitByWeights', () => {
  it('splits 100 among 3 equal weights as [34, 33, 33]', () => {
    const res = splitByWeights(100, [1, 1, 1]);
    expect(res).toEqual([34, 33, 33]);
    expect(res.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('splits exact proportions without remainder', () => {
    const res = splitByWeights(60, [10, 20, 30]);
    expect(res).toEqual([10, 20, 30]);
    expect(res.reduce((a, b) => a + b, 0)).toBe(60);
  });

  it('handles zero total with non-zero weights', () => {
    const res = splitByWeights(0, [10, 20, 30]);
    expect(res).toEqual([0, 0, 0]);
  });

  it('handles all-zero weights by falling back to splitEvenly', () => {
    const res = splitByWeights(100, [0, 0, 0]);
    expect(res).toEqual([34, 33, 33]);
  });

  it('allocates extra rupee to larger remainder deterministically', () => {
    // total = 10, weights = [2.6, 2.4, 2.4, 2.6] -> total weight = 10
    // raw = [2.6, 2.4, 2.4, 2.6], floors = [2, 2, 2, 2] (sum = 8, diff = 2)
    // remainders = [0.6, 0.4, 0.4, 0.6]
    // 0.6 at idx 0 and idx 3 get +1
    const res = splitByWeights(10, [2.6, 2.4, 2.4, 2.6]);
    expect(res).toEqual([3, 2, 2, 3]);
    expect(res.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('property test: 100 random weight sets always sum to exact total', () => {
    for (let i = 0; i < 100; i++) {
      const total = Math.floor(Math.random() * 20000);
      const count = Math.floor(Math.random() * 15) + 1;
      const weights = Array.from({ length: count }, () => Math.random() * 100);
      const res = splitByWeights(total, weights);

      expect(res.length).toBe(count);
      const sum = res.reduce((a, b) => a + b, 0);
      expect(sum).toBe(total);
    }
  });
});
