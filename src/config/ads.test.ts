import { describe, it, expect, vi } from 'vitest';

vi.mock('react-native-google-mobile-ads', () => ({
  TestIds: {
    BANNER: 'ca-app-pub-3940256099942544/6300978111',
  },
}));

import { getBannerUnitId, ANDROID_BANNER_UNIT_ID } from './ads';
import { TestIds } from 'react-native-google-mobile-ads';

describe('Ads Configuration', () => {
  it('returns TestIds.BANNER in development mode (__DEV__ === true)', () => {
    // Vitest runs in dev environment by default (__DEV__ = true)
    expect(getBannerUnitId()).toBe(TestIds.BANNER);
  });

  it('exports real banner unit ID matching AdMob publisher pub-4120962530183364', () => {
    expect(ANDROID_BANNER_UNIT_ID).toContain('ca-app-pub-4120962530183364');
  });

  it('returns production ID when __DEV__ is false', () => {
    const originalDev = (globalThis as any).__DEV__;
    try {
      (globalThis as any).__DEV__ = false;
      expect(getBannerUnitId()).toBe(ANDROID_BANNER_UNIT_ID);
    } finally {
      (globalThis as any).__DEV__ = originalDev;
    }
  });
});
