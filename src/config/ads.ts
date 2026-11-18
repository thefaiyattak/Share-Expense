import { TestIds } from 'react-native-google-mobile-ads';

/**
 * Real production Android Banner Ad Unit ID.
 * Replace YOUR_BANNER_AD_UNIT_ID with your banner unit ID created in AdMob Console.
 */
export const ANDROID_BANNER_UNIT_ID = 'ca-app-pub-4120962530183364/YOUR_BANNER_AD_UNIT_ID';

/**
 * Returns the banner ad unit ID.
 * In development (__DEV__ === true), ALWAYS returns Google's standard TestIds.BANNER.
 * In production release builds, returns ANDROID_BANNER_UNIT_ID.
 */
export function getBannerUnitId(): string {
  const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
  if (isDev) {
    return TestIds.BANNER;
  }
  return ANDROID_BANNER_UNIT_ID;
}
