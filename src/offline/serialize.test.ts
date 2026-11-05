import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { serialize, deserialize } from './serialize';

describe('serialize and deserialize', () => {
  it('round-trips Date objects cleanly', () => {
    const orig = {
      createdAt: new Date('2026-11-05T10:30:00.000Z'),
      dueDate: new Date('2026-12-01T00:00:00.000Z'),
    };

    const json = serialize(orig);
    const restored = deserialize(json);

    expect(restored.createdAt).toBeInstanceOf(Date);
    expect(restored.dueDate).toBeInstanceOf(Date);
    expect(restored.createdAt.toISOString()).toBe('2026-11-05T10:30:00.000Z');
    expect(restored.dueDate.toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('round-trips Firestore Timestamp objects cleanly', () => {
    const orig = {
      serverTime: new Timestamp(1762330000, 456000000),
    };

    const json = serialize(orig);
    const restored = deserialize(json);

    expect(restored.serverTime).toBeInstanceOf(Timestamp);
    expect(restored.serverTime.seconds).toBe(1762330000);
    expect(restored.serverTime.nanoseconds).toBe(456000000);
    expect(restored.serverTime.toDate().toISOString()).toBe(orig.serverTime.toDate().toISOString());
  });

  it('round-trips nested arrays and mixed primitive structures', () => {
    const orig = {
      id: 'exp_123',
      name: 'Team Dinner',
      amount: 4500,
      tags: ['food', 'team'],
      meta: {
        verified: true,
        nestedDate: new Date('2026-05-10T12:00:00.000Z'),
        stamp: new Timestamp(1750000000, 0),
      },
      history: [
        { time: new Date('2026-05-10T12:05:00.000Z'), action: 'created' },
        { time: new Date('2026-05-10T12:10:00.000Z'), action: 'updated' },
      ],
    };

    const json = serialize(orig);
    const restored = deserialize(json);

    expect(restored.id).toBe('exp_123');
    expect(restored.amount).toBe(4500);
    expect(restored.meta.nestedDate).toBeInstanceOf(Date);
    expect(restored.meta.stamp).toBeInstanceOf(Timestamp);
    expect(restored.history[0].time).toBeInstanceOf(Date);
    expect(restored.history[1].time).toBeInstanceOf(Date);
  });

  it('handles null, undefined, and primitives safely', () => {
    expect(deserialize(serialize(null))).toBeNull();
    expect(deserialize(serialize(123))).toBe(123);
    expect(deserialize(serialize('abc'))).toBe('abc');
    expect(deserialize(serialize([1, 2, 3]))).toEqual([1, 2, 3]);
  });
});
