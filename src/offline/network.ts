import { create } from 'zustand';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { AppState, AppStateStatus } from 'react-native';

export interface NetworkState {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  isOnline: boolean;
  pendingCount: number;
  failedCount: number;
  syncing: boolean;
  lastSyncedAt: number | null;

  setConnection: (isConnected: boolean | null, isInternetReachable: boolean | null) => void;
  setSyncCounts: (counts: { pendingCount?: number; failedCount?: number; syncing?: boolean; lastSyncedAt?: number }) => void;
  initNetworkMonitoring: () => () => void;
}

export const useNetworkStore = create<NetworkState>((set, get) => ({
  isConnected: true,
  isInternetReachable: true,
  isOnline: true,
  pendingCount: 0,
  failedCount: 0,
  syncing: false,
  lastSyncedAt: null,

  setConnection: (isConnected, isInternetReachable) => {
    // isOnline = isConnected && isInternetReachable !== false
    // (null is treated as potentially reachable until proven false)
    const isOnline = Boolean(isConnected && isInternetReachable !== false);
    set({
      isConnected,
      isInternetReachable,
      isOnline,
    });
  },

  setSyncCounts: (counts) => {
    set(state => ({
      pendingCount: counts.pendingCount !== undefined ? counts.pendingCount : state.pendingCount,
      failedCount: counts.failedCount !== undefined ? counts.failedCount : state.failedCount,
      syncing: counts.syncing !== undefined ? counts.syncing : state.syncing,
      lastSyncedAt: counts.lastSyncedAt !== undefined ? counts.lastSyncedAt : state.lastSyncedAt,
    }));
  },

  initNetworkMonitoring: () => {
    const handleNetInfo = (state: NetInfoState) => {
      get().setConnection(state.isConnected, state.isInternetReachable);
    };

    // 1. Initial fetch
    NetInfo.fetch().then(handleNetInfo).catch(err => {
      console.warn('[NetworkStore] Initial NetInfo.fetch failed:', err);
    });

    // 2. Event listener for network changes
    const unsubscribeNetInfo = NetInfo.addEventListener(handleNetInfo);

    // 3. AppState listener: re-check network when app returns to foreground
    const handleAppState = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        NetInfo.fetch().then(handleNetInfo).catch(() => {});
      }
    };
    const appStateSubscription = AppState.addEventListener('change', handleAppState);

    return () => {
      unsubscribeNetInfo();
      appStateSubscription.remove();
    };
  },
}));
