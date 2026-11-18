import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ExpoInAppUpdates from 'expo-in-app-updates';
import { Platform } from 'react-native';

vi.mock('expo-in-app-updates', () => ({
  checkForUpdate: vi.fn(),
  startUpdate: vi.fn(),
  addUpdateListener: vi.fn(() => vi.fn()),
}));

vi.mock('react-native', () => ({
  Platform: {
    OS: 'android',
  },
  Linking: {
    canOpenURL: vi.fn().mockResolvedValue(true),
    openURL: vi.fn().mockResolvedValue(undefined),
  },
}));

import { inAppUpdateService } from './inAppUpdateService';

describe('inAppUpdateService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (inAppUpdateService as any).hasCheckedThisSession = false;
    (inAppUpdateService as any).listenerCleanup = null;
    (Platform as any).OS = 'android';
  });

  it('skips auto-check in non-Android or DEV environment', async () => {
    (Platform as any).OS = 'ios';
    await inAppUpdateService.checkOnAppLaunch();
    expect(ExpoInAppUpdates.checkForUpdate).not.toHaveBeenCalled();
  });

  it('handles manual check when no update is available', async () => {
    vi.mocked(ExpoInAppUpdates.checkForUpdate).mockResolvedValueOnce({
      updateAvailable: false,
    });

    const res = await inAppUpdateService.checkManually();
    expect(res.available).toBe(false);
    expect(res.started).toBe(false);
    expect(ExpoInAppUpdates.startUpdate).not.toHaveBeenCalled();
  });

  it('handles manual check when an update is available and starts it', async () => {
    vi.mocked(ExpoInAppUpdates.checkForUpdate).mockResolvedValueOnce({
      updateAvailable: true,
      storeVersion: '21',
      serverUpdateType: 'FLEXIBLE',
    });
    vi.mocked(ExpoInAppUpdates.startUpdate).mockResolvedValueOnce(true);

    const res = await inAppUpdateService.checkManually();
    expect(res.available).toBe(true);
    expect(res.started).toBe(true);
    expect(res.storeVersion).toBe('21');
    expect(ExpoInAppUpdates.startUpdate).toHaveBeenCalledWith(false);
  });

  it('gracefully handles and reports errors during manual check', async () => {
    vi.mocked(ExpoInAppUpdates.checkForUpdate).mockRejectedValueOnce(
      new Error('Google Play API unavailable')
    );

    const res = await inAppUpdateService.checkManually();
    expect(res.available).toBe(false);
    expect(res.started).toBe(false);
    expect(res.error).toBe('Google Play API unavailable');
  });
});
