import { Platform } from 'react-native';
import * as ExpoInAppUpdates from 'expo-in-app-updates';
import { logger } from '../utils/logger';

class InAppUpdateService {
  private listenerCleanup: (() => void) | null = null;
  private hasCheckedThisSession = false;

  /**
   * Initializes automatic check for updates on app startup.
   * Safe to call anywhere; handles errors gracefully and skips in DEV or non-Android environments.
   */
  async checkOnAppLaunch(): Promise<void> {
    const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
    if (isDev || Platform.OS !== 'android') {
      return;
    }

    if (this.hasCheckedThisSession) {
      return;
    }
    this.hasCheckedThisSession = true;

    try {
      this.setupListeners();
      const updateInfo = await ExpoInAppUpdates.checkForUpdate();

      if (updateInfo?.updateAvailable) {
        logger.info('InAppUpdate', 'New update found on Play Store', {
          storeVersion: updateInfo.storeVersion,
          serverPriority: updateInfo.serverPriority,
          serverUpdateType: updateInfo.serverUpdateType,
        });

        // If priority is 4 or 5, run immediate; otherwise flexible (non-intrusive)
        const isImmediate = updateInfo.serverUpdateType === 'IMMEDIATE';
        await ExpoInAppUpdates.startUpdate(isImmediate);
      }
    } catch (err: any) {
      // Common & expected when app is not installed from Google Play (e.g. sideloaded, dev build)
      logger.debug('InAppUpdate', 'In-app update check skipped or failed', { message: err?.message });
    }
  }

  /**
   * Manual check triggered by user (e.g. from Settings > Check for Updates).
   * Returns a status object indicating whether an update is available, started, or already latest.
   */
  async checkManually(): Promise<{
    available: boolean;
    storeVersion?: string | null;
    started: boolean;
    error?: string;
  }> {
    if (Platform.OS !== 'android') {
      return { available: false, started: false, error: 'In-app updates are only supported on Android Play Store.' };
    }

    try {
      this.setupListeners();
      const updateInfo = await ExpoInAppUpdates.checkForUpdate();

      if (updateInfo?.updateAvailable) {
        const isImmediate = updateInfo.serverUpdateType === 'IMMEDIATE';
        const started = await ExpoInAppUpdates.startUpdate(isImmediate);
        return {
          available: true,
          storeVersion: updateInfo.storeVersion,
          started,
        };
      }

      return {
        available: false,
        storeVersion: updateInfo?.storeVersion,
        started: false,
      };
    } catch (err: any) {
      logger.warn('InAppUpdate', 'Manual update check failed', { message: err?.message });
      return {
        available: false,
        started: false,
        error: err?.message || 'Unable to check for updates from Google Play.',
      };
    }
  }

  private setupListeners() {
    if (this.listenerCleanup) return;

    try {
      const unsubDownloaded = ExpoInAppUpdates.addUpdateListener('updateDownloaded', (event) => {
        logger.info('InAppUpdate', 'Flexible update downloaded and ready to install', event);
      });

      const unsubCancelled = ExpoInAppUpdates.addUpdateListener('updateCancelled', (event) => {
        logger.info('InAppUpdate', 'User cancelled update flow', event);
      });

      this.listenerCleanup = () => {
        unsubDownloaded();
        unsubCancelled();
      };
    } catch (err) {
      // Event listeners not supported in this runtime
    }
  }

  cleanup() {
    if (this.listenerCleanup) {
      this.listenerCleanup();
      this.listenerCleanup = null;
    }
  }
}

export const inAppUpdateService = new InAppUpdateService();
