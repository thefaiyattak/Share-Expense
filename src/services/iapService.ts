import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  initConnection,
  endConnection,
  purchaseUpdatedListener,
  purchaseErrorListener,
  requestPurchase,
  finishTransaction,
  getAvailablePurchases,
  fetchProducts,
  Purchase,
  PurchaseError,
} from 'react-native-iap';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useStore } from '../store/useStore';
import { create } from 'zustand';

export const LIFETIME_AD_FREE_PRODUCT_ID = 'lifetime_ad_free';
export const DEFAULT_LIFETIME_PRICE = 'PKR 999';

interface IapState {
  isAdFree: boolean;
  isConnecting: boolean;
  isPurchasing: boolean;
  isRestoring: boolean;
  productPrice: string;
  error: string | null;
  setIsAdFree: (val: boolean) => void;
  setIsPurchasing: (val: boolean) => void;
  setIsRestoring: (val: boolean) => void;
  setProductPrice: (price: string) => void;
  setError: (err: string | null) => void;
}

export const useIapStore = create<IapState>((set) => ({
  isAdFree: false,
  isConnecting: false,
  isPurchasing: false,
  isRestoring: false,
  productPrice: DEFAULT_LIFETIME_PRICE,
  error: null,
  setIsAdFree: (val) => set({ isAdFree: val }),
  setIsPurchasing: (val) => set({ isPurchasing: val }),
  setIsRestoring: (val) => set({ isRestoring: val }),
  setProductPrice: (productPrice) => set({ productPrice }),
  setError: (error) => set({ error }),
}));

class IapService {
  private isInitialized = false;
  private purchaseUpdateSub: any = null;
  private purchaseErrorSub: any = null;
  private currentUserId: string | null = null;

  /**
   * Initializes the IAP connection, syncs local ad-free cache, and fetches localized product price.
   */
  async init(userId?: string): Promise<void> {
    if (userId) {
      this.currentUserId = userId;
    }

    // 1. Check local storage cache for instant offline ad-free state
    if (this.currentUserId) {
      try {
        const cached = await AsyncStorage.getItem(`ad_free_lifetime_${this.currentUserId}`);
        if (cached === 'true') {
          useIapStore.getState().setIsAdFree(true);
        }
      } catch {}
    }

    // 2. Check currentAppUser from Firestore/Zustand store
    const currentUser = useStore.getState().currentAppUser;
    if (currentUser?.hasAdFreeLifetime) {
      useIapStore.getState().setIsAdFree(true);
      if (currentUser.id) {
        AsyncStorage.setItem(`ad_free_lifetime_${currentUser.id}`, 'true').catch(() => {});
      }
    }

    if (Platform.OS !== 'android') {
      return;
    }

    if (this.isInitialized) {
      return;
    }

    try {
      useIapStore.setState({ isConnecting: true });
      const connected = await initConnection();
      if (!connected) {
        useIapStore.setState({ isConnecting: false });
        return;
      }
      this.isInitialized = true;
      useIapStore.setState({ isConnecting: false });

      // Listen for purchase completions
      this.purchaseUpdateSub = purchaseUpdatedListener(async (purchase: Purchase) => {
        try {
          if (purchase.productId === LIFETIME_AD_FREE_PRODUCT_ID) {
            await finishTransaction({ purchase, isConsumable: false });
            await this.grantLifetimeAdFree();
          }
        } catch (err: any) {
          console.warn('[IAP] Error processing purchase update:', err?.message || err);
        } finally {
          useIapStore.getState().setIsPurchasing(false);
        }
      });

      // Listen for purchase errors
      this.purchaseErrorSub = purchaseErrorListener((error: PurchaseError) => {
        useIapStore.getState().setIsPurchasing(false);
        const code = String(error?.code || '');
        if (!code.includes('cancelled') && !code.includes('canceled')) {
          const errDetail = error.message || 'Payment was cancelled or failed.';
          useIapStore.getState().setError(errDetail);
          // If product query failed on emulator / unconfigured Play Console SKU
          if (code === 'query-product') {
            console.warn('[IAP] Product not yet activated in Google Play Console:', error);
          }
        }
      });

      // Fetch localized product details from Play Store
      try {
        const products = await fetchProducts({
          skus: [LIFETIME_AD_FREE_PRODUCT_ID],
          type: 'in-app',
        });
        if (products && products.length > 0) {
          const item = products.find((p: any) => p?.productId === LIFETIME_AD_FREE_PRODUCT_ID) as any;
          if (item?.displayPrice || item?.price) {
            useIapStore.getState().setProductPrice(item.displayPrice || item.price);
          }
        }
      } catch (e) {
        // Fallback remains DEFAULT_LIFETIME_PRICE
      }
    } catch (e: any) {
      useIapStore.setState({ isConnecting: false });
      console.warn('[IAP] Failed to initialize connection:', e?.message || e);
    }
  }

  /**
   * Prompts Google Play In-App Billing sheet to buy lifetime ad-free experience.
   */
  async purchaseLifetimeAdFree(userId?: string): Promise<{ success: boolean; message?: string }> {
    if (userId) {
      this.currentUserId = userId;
    }

    if (useIapStore.getState().isAdFree) {
      return { success: true, message: 'You already own Lifetime Ad-Free!' };
    }

    if (Platform.OS !== 'android') {
      return { success: false, message: 'In-app purchases are only available on Android.' };
    }

    try {
      useIapStore.getState().setError(null);
      useIapStore.getState().setIsPurchasing(true);

      if (!this.isInitialized) {
        await this.init(this.currentUserId || undefined);
      }

      await requestPurchase({
        request: {
          google: {
            skus: [LIFETIME_AD_FREE_PRODUCT_ID],
          },
        },
        type: 'in-app',
      });

      return { success: true };
    } catch (err: any) {
      useIapStore.getState().setIsPurchasing(false);
      const msg = err?.message || 'Could not initiate Google Play purchase.';
      useIapStore.getState().setError(msg);

      // In development / emulator where product is not configured in Play Console yet
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[IAP Dev Simulator] Play Billing request failed on emulator:', msg);
      }

      return { success: false, message: msg };
    }
  }

  /**
   * Restores prior Google Play purchases on the device.
   */
  async restorePurchases(userId?: string): Promise<{ success: boolean; message: string }> {
    if (userId) {
      this.currentUserId = userId;
    }

    if (Platform.OS !== 'android') {
      return { success: false, message: 'Purchase restoration is only supported on Android.' };
    }

    try {
      useIapStore.getState().setIsRestoring(true);
      useIapStore.getState().setError(null);

      if (!this.isInitialized) {
        await this.init(this.currentUserId || undefined);
      }

      const purchases = await getAvailablePurchases();
      const hasPurchasedLifetime = purchases?.some(
        (p: Purchase) => p.productId === LIFETIME_AD_FREE_PRODUCT_ID
      );

      if (hasPurchasedLifetime) {
        await this.grantLifetimeAdFree();
        useIapStore.getState().setIsRestoring(false);
        return { success: true, message: 'Lifetime Ad-Free access has been restored!' };
      } else {
        useIapStore.getState().setIsRestoring(false);
        return { success: false, message: 'No lifetime ad-free purchase found on this Google Play account.' };
      }
    } catch (err: any) {
      useIapStore.getState().setIsRestoring(false);
      const msg = err?.message || 'Failed to check Google Play purchases.';
      return { success: false, message: msg };
    }
  }

  /**
   * Grants lifetime ad-free status to the user in store, cache, and Firestore.
   */
  async grantLifetimeAdFree(): Promise<void> {
    useIapStore.getState().setIsAdFree(true);

    const currentUser = useStore.getState().currentAppUser;
    const uid = this.currentUserId || currentUser?.id;

    if (currentUser) {
      useStore.getState().setCurrentAppUser({
        ...currentUser,
        hasAdFreeLifetime: true,
      });
    }

    if (uid) {
      try {
        await AsyncStorage.setItem(`ad_free_lifetime_${uid}`, 'true');
      } catch {}

      try {
        await updateDoc(doc(db, 'users', uid), {
          hasAdFreeLifetime: true,
        });
      } catch (err) {
        console.warn('[IAP] Failed to update Firestore user doc:', err);
      }
    }
  }

  destroy(): void {
    if (this.purchaseUpdateSub?.remove) {
      this.purchaseUpdateSub.remove();
    }
    if (this.purchaseErrorSub?.remove) {
      this.purchaseErrorSub.remove();
    }
    if (this.isInitialized) {
      endConnection().catch(() => {});
      this.isInitialized = false;
    }
  }
}

export const iapService = new IapService();
