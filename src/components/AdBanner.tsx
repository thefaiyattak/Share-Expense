import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { getBannerUnitId } from '../config/ads';
import { useAdsStore } from '../services/adsService';
import { useNetworkStore } from '../offline/network';
import { useIapStore } from '../services/iapService';
import { useStore } from '../store/useStore';

interface AdBannerProps {
  style?: any;
}

export const AdBanner: React.FC<AdBannerProps> = ({ style }) => {
  const isOnline = useNetworkStore((state) => state.isOnline);
  const canRequestAds = useAdsStore((state) => state.canRequestAds);
  const nonPersonalizedOnly = useAdsStore((state) => state.nonPersonalizedOnly);
  const isAdFree = useIapStore((state) => state.isAdFree);
  const hasAdFreeLifetime = useStore((state) => state.currentAppUser?.hasAdFreeLifetime);

  const [adFailed, setAdFailed] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // When connection drops or restores, reset the failure state without a tight retry loop
  useEffect(() => {
    if (isOnline) {
      setAdFailed(false);
    }
  }, [isOnline]);

  const requestOptions = useMemo(
    () => ({
      requestNonPersonalizedAdsOnly: nonPersonalizedOnly,
    }),
    [nonPersonalizedOnly]
  );

  // Never request or render ads on non-Android, offline, consent denied, failed to load, or lifetime ad-free
  if (Platform.OS !== 'android' || !canRequestAds || !isOnline || adFailed || isAdFree || hasAdFreeLifetime) {
    return null;
  }

  const unitId = getBannerUnitId();

  return (
    <View
      style={[
        styles.container,
        !isLoaded && styles.hidden,
        style,
      ]}
      pointerEvents={isLoaded ? 'auto' : 'none'}
    >
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.BANNER}
        requestOptions={requestOptions}
        onAdLoaded={() => {
          setIsLoaded(true);
          setAdFailed(false);
        }}
        onAdFailedToLoad={(error) => {
          if (__DEV__) {
            console.log('[AdBanner] Ad failed to load:', error?.message || error);
          }
          setIsLoaded(false);
          setAdFailed(true);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  hidden: {
    height: 0,
    overflow: 'hidden',
    opacity: 0,
  },
});

export default AdBanner;
