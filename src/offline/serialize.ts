import { Timestamp } from 'firebase/firestore';

/**
 * Custom JSON replacer that serializes Date objects and Firestore Timestamps
 * into tagged strings for lossless persistence.
 */
export function jsonReplacer(this: any, key: string, value: any): any {
  const orig = this ? this[key] : value;
  if (orig instanceof Date) {
    return `__DATE__:${orig.toISOString()}`;
  }
  if (
    orig &&
    typeof orig === 'object' &&
    typeof orig.seconds === 'number' &&
    typeof orig.nanoseconds === 'number' &&
    typeof orig.toDate === 'function'
  ) {
    return `__TIMESTAMP__:${orig.seconds}:${orig.nanoseconds}`;
  }
  return value;
}

/**
 * Custom JSON reviver that restores tagged Date and Firestore Timestamp strings.
 */
export function jsonReviver(key: string, value: any): any {
  if (typeof value === 'string') {
    if (value.startsWith('__DATE__:')) {
      return new Date(value.slice(9));
    }
    if (value.startsWith('__TIMESTAMP__:')) {
      const parts = value.slice(14).split(':');
      const seconds = Number(parts[0]);
      const nanoseconds = Number(parts[1] || 0);
      return new Timestamp(seconds, nanoseconds);
    }
  }
  return value;
}

/**
 * Serializes an object or array to a JSON string preserving Dates and Firestore Timestamps.
 */
export function serialize(value: any): string {
  return JSON.stringify(value, jsonReplacer);
}

/**
 * Deserializes a JSON string restoring Dates and Firestore Timestamps.
 */
export function deserialize<T = any>(json: string): T {
  return JSON.parse(json, jsonReviver);
}
