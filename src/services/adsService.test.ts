import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Platform } from 'react-native';

const mockRequestInfoUpdate = vi.fn().mockResolvedValue(undefined);
const mockLoadAndShowConsentFormIfRequired = vi.fn().mockResolvedValue(undefined);
const mockGetConsentInfo = vi.fn().mockResolvedValue({
  canRequestAds: true,
  privacyOptionsRequirementStatus: 'REQUIRED',
});
const mockGetUserChoices = vi.fn().mockResolvedValue({
  selectPersonalisedAds: true,
});
const mockShowPrivacyOptionsForm = vi.fn().mockResolvedValue(undefined);
const mockSetRequestConfiguration = vi.fn().mockResolvedValue(undefined);
const mockInitialize = vi.fn().mockResolvedValue(undefined);

vi.mock('react-native-google-mobile-ads', () => ({
  default: () => ({
    setRequestConfiguration: (...args: any[]) => mockSetRequestConfiguration(...args),
    initialize: (...args: any[]) => mockInitialize(...args),
  }),
  AdsConsent: {
    requestInfoUpdate: () => mockRequestInfoUpdate(),
    loadAndShowConsentFormIfRequired: () => mockLoadAndShowConsentFormIfRequired(),
    getConsentInfo: () => mockGetConsentInfo(),
    getUserChoices: () => mockGetUserChoices(),
    showPrivacyOptionsForm: () => mockShowPrivacyOptionsForm(),
  },
  AdsConsentPrivacyOptionsRequirementStatus: {
    REQUIRED: 'REQUIRED',
    NOT_REQUIRED: 'NOT_REQUIRED',
    UNKNOWN: 'UNKNOWN',
  },
  MaxAdContentRating: {
    PG: 'PG',
  },
  TestIds: {
    BANNER: 'ca-app-pub-3940256099942544/6300978111',
  },
}));

import { adsService, useAdsStore } from './adsService';

describe('adsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAdsStore.setState({
      canRequestAds: false,
      isInitialized: false,
      isPrivacyOptionsRequired: false,
      nonPersonalizedOnly: false,
    });
    (Platform as any).OS = 'android';
  });

  it('skips initialization on non-Android platforms', async () => {
    (Platform as any).OS = 'ios';
    await adsService.initAds();
    expect(mockRequestInfoUpdate).not.toHaveBeenCalled();
    expect(mockInitialize).not.toHaveBeenCalled();
  });

  it('initializes UMP consent and Mobile Ads when consent allows', async () => {
    (Platform as any).OS = 'android';
    await adsService.initAds();

    expect(mockRequestInfoUpdate).toHaveBeenCalled();
    expect(mockLoadAndShowConsentFormIfRequired).toHaveBeenCalled();
    expect(mockSetRequestConfiguration).toHaveBeenCalledWith({
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
      maxAdContentRating: 'PG',
    });
    expect(mockInitialize).toHaveBeenCalled();

    const state = useAdsStore.getState();
    expect(state.canRequestAds).toBe(true);
    expect(state.isInitialized).toBe(true);
    expect(state.isPrivacyOptionsRequired).toBe(true);
  });

  it('never throws even if consent or network calls reject', async () => {
    mockRequestInfoUpdate.mockRejectedValueOnce(new Error('Network error'));
    await expect(adsService.initAds()).resolves.not.toThrow();
  });
});
