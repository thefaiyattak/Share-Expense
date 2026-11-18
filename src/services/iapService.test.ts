import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Platform } from 'react-native';

const mockInitConnection = vi.fn().mockResolvedValue(true);
const mockEndConnection = vi.fn().mockResolvedValue(undefined);
const mockPurchaseUpdatedListener = vi.fn().mockReturnValue({ remove: vi.fn() });
const mockPurchaseErrorListener = vi.fn().mockReturnValue({ remove: vi.fn() });
const mockRequestPurchase = vi.fn().mockResolvedValue(undefined);
const mockFinishTransaction = vi.fn().mockResolvedValue(undefined);
const mockGetAvailablePurchases = vi.fn().mockResolvedValue([]);
const mockFetchProducts = vi.fn().mockResolvedValue([
  { productId: 'lifetime_ad_free', displayPrice: 'PKR 999' },
]);

vi.mock('react-native-iap', () => ({
  initConnection: () => mockInitConnection(),
  endConnection: () => mockEndConnection(),
  purchaseUpdatedListener: (...args: any[]) => mockPurchaseUpdatedListener(...args),
  purchaseErrorListener: (...args: any[]) => mockPurchaseErrorListener(...args),
  requestPurchase: (...args: any[]) => mockRequestPurchase(...args),
  finishTransaction: (...args: any[]) => mockFinishTransaction(...args),
  getAvailablePurchases: () => mockGetAvailablePurchases(),
  fetchProducts: (...args: any[]) => mockFetchProducts(...args),
}));

const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, coll, id) => ({ path: `${coll}/${id}`, id })),
  updateDoc: (...args: any[]) => mockUpdateDoc(...args),
}));

vi.mock('./firebase', () => ({
  db: {},
}));

const mockAsyncStorage: Record<string, string> = {};
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => mockAsyncStorage[key] || null),
    setItem: vi.fn(async (key: string, val: string) => {
      mockAsyncStorage[key] = val;
    }),
  },
}));

vi.mock('../store/useStore', () => ({
  useStore: {
    getState: () => ({
      currentAppUser: { id: 'test_user_123', name: 'Test User' },
      setCurrentAppUser: vi.fn(),
    }),
  },
}));

import { iapService, useIapStore, LIFETIME_AD_FREE_PRODUCT_ID } from './iapService';

describe('iapService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (Platform as any).OS = 'android';
    useIapStore.setState({
      isAdFree: false,
      isConnecting: false,
      isPurchasing: false,
      isRestoring: false,
      productPrice: 'PKR 999',
      error: null,
    });
  });

  it('initializes connection and registers listeners on Android', async () => {
    await iapService.init('test_user_123');
    expect(mockInitConnection).toHaveBeenCalled();
    expect(mockPurchaseUpdatedListener).toHaveBeenCalled();
    expect(mockPurchaseErrorListener).toHaveBeenCalled();
    expect(mockFetchProducts).toHaveBeenCalledWith({
      skus: [LIFETIME_AD_FREE_PRODUCT_ID],
      type: 'in-app',
    });
  });

  it('triggers Google Play purchase flow for lifetime ad-free', async () => {
    const res = await iapService.purchaseLifetimeAdFree('test_user_123');
    expect(res.success).toBe(true);
    expect(mockRequestPurchase).toHaveBeenCalledWith({
      request: {
        google: {
          skus: [LIFETIME_AD_FREE_PRODUCT_ID],
        },
      },
      type: 'in-app',
    });
  });

  it('grants lifetime ad-free and updates Firestore and AsyncStorage', async () => {
    await iapService.grantLifetimeAdFree();
    expect(useIapStore.getState().isAdFree).toBe(true);
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/test_user_123' }),
      { hasAdFreeLifetime: true }
    );
  });

  it('restores prior purchases when found on Google Play', async () => {
    mockGetAvailablePurchases.mockResolvedValueOnce([
      { productId: LIFETIME_AD_FREE_PRODUCT_ID },
    ]);

    const res = await iapService.restorePurchases('test_user_123');
    expect(res.success).toBe(true);
    expect(useIapStore.getState().isAdFree).toBe(true);
  });
});
