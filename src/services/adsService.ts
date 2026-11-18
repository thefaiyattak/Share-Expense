import { Platform } from 'react-native';
import { create } from 'zustand';
import mobileAds, {
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
  MaxAdContentRating,
} from 'react-native-google-mobile-ads';

export interface AdsState {
  canRequestAds: boolean;
  isInitialized: boolean;
  isPrivacyOptionsRequired: boolean;
  nonPersonalizedOnly: boolean;
  setCanRequestAds: (canRequestAds: boolean) => void;
  setInitialized: (isInitialized: boolean) => void;
  setPrivacyOptionsRequired: (required: boolean) => void;
  setNonPersonalizedOnly: (nonPersonalized: boolean) => void;
}

export const useAdsStore = create<AdsState>((set) => ({
  canRequestAds: false,
  isInitialized: false,
  isPrivacyOptionsRequired: false,
  nonPersonalizedOnly: false,
  setCanRequestAds: (canRequestAds) => set({ canRequestAds }),
  setInitialized: (isInitialized) => set({ isInitialized }),
  setPrivacyOptionsRequired: (isPrivacyOptionsRequired) => set({ isPrivacyOptionsRequired }),
  setNonPersonalizedOnly: (nonPersonalizedOnly) => set({ nonPersonalizedOnly }),
}));

let initPromise: Promise<void> | null = null;

export const adsService = {
  /**
   * Initializes Google Mobile Ads SDK and resolves UMP Consent.
   * Safe to call anywhere; executes only once, only on Android, and never throws.
   */
  initAds: async (): Promise<void> => {
    if (Platform.OS !== 'android') {
      return;
    }

    if (initPromise) {
      return initPromise;
    }

    initPromise = (async () => {
      try {
        // 1. Request UMP Consent info and show form if required
        await AdsConsent.requestInfoUpdate().catch((e) => {
          console.warn('[AdsService] requestInfoUpdate failed:', e);
        });

        await AdsConsent.loadAndShowConsentFormIfRequired().catch((e) => {
          console.warn('[AdsService] loadAndShowConsentFormIfRequired failed:', e);
        });

        // 2. Inspect consent status
        const consentInfo = await AdsConsent.getConsentInfo();
        const canRequest = Boolean(consentInfo?.canRequestAds);
        const isPrivacyRequired =
          consentInfo?.privacyOptionsRequirementStatus ===
          AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;

        useAdsStore.getState().setCanRequestAds(canRequest);
        useAdsStore.getState().setPrivacyOptionsRequired(isPrivacyRequired);

        try {
          const choices = await AdsConsent.getUserChoices();
          if (choices && choices.selectPersonalisedAds === false) {
            useAdsStore.getState().setNonPersonalizedOnly(true);
          } else {
            useAdsStore.getState().setNonPersonalizedOnly(false);
          }
        } catch {
          // Non-EEA or no custom user choices available
          useAdsStore.getState().setNonPersonalizedOnly(false);
        }

        // 3. Set global request configuration (family-friendly, PG rating)
        await mobileAds().setRequestConfiguration({
          tagForChildDirectedTreatment: false,
          tagForUnderAgeOfConsent: false,
          maxAdContentRating: MaxAdContentRating.PG,
        });

        // 4. Initialize Mobile Ads SDK only if consent allows ad requests
        if (canRequest) {
          await mobileAds().initialize();
          useAdsStore.getState().setInitialized(true);
        }
      } catch (error) {
        console.warn('[AdsService] Unexpected error during ads initialization:', error);
      }
    })();

    return initPromise;
  },

  /**
   * Shows the UMP privacy options form so users can review or change their consent.
   */
  showPrivacyOptionsForm: async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return false;
    }

    try {
      await AdsConsent.showPrivacyOptionsForm();
      const consentInfo = await AdsConsent.getConsentInfo();
      const canRequest = Boolean(consentInfo?.canRequestAds);
      const isPrivacyRequired =
        consentInfo?.privacyOptionsRequirementStatus ===
        AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;

      useAdsStore.getState().setCanRequestAds(canRequest);
      useAdsStore.getState().setPrivacyOptionsRequired(isPrivacyRequired);

      try {
        const choices = await AdsConsent.getUserChoices();
        if (choices && choices.selectPersonalisedAds === false) {
          useAdsStore.getState().setNonPersonalizedOnly(true);
        } else {
          useAdsStore.getState().setNonPersonalizedOnly(false);
        }
      } catch {
        useAdsStore.getState().setNonPersonalizedOnly(false);
      }

      if (canRequest && !useAdsStore.getState().isInitialized) {
        await mobileAds().initialize();
        useAdsStore.getState().setInitialized(true);
      }

      return true;
    } catch (error) {
      console.warn('[AdsService] Failed to show privacy options form:', error);
      return false;
    }
  },
};
