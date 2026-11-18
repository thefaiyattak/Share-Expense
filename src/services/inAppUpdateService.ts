import { Platform, Linking } from 'react-native';
import * as ExpoInAppUpdates from 'expo-in-app-updates';
import { logger } from '../utils/logger';

export const PLAY_STORE_URL = 'market://details?id=com.fyntech.expensetracker';
export const PLAY_STORE_WEB_URL = 'https://play.google.com/store/apps/details?id=com.fyntech.expensetracker';

class InAppUpdateService {
  private listenerCleanup: (() => void) | null = null;
  private hasCheckedThisSession = false;

  /**
   * Opens the Google Play Store page for Share Expense.
   */
  async openPlayStore(): Promise<void> {
    try {
      const canOpen = await Linking.canOpenURL(PLAY_STORE_URL);
      if (canOpen) {
        await Linking.openURL(PLAY_STORE_URL);
      } else {
        await Linking.openURL(PLAY_STORE_WEB_URL);
      }
    } catch {
      await Linking.openURL(PLAY_STORE_WEB_URL).catch(() => {});
    }
  }

  /**
   * Checks if an update is available on app launch.
   * Returns update details if available, or null.
   */
  async checkOnAppLaunch(): Promise<{
    available: boolean;
    storeVersion?: string | null;
    isImmediate?: boolean;
  } | null> {
    const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
    if (isDev || Platform.OS !== 'android') {
      return null;
    }

    if (this.hasCheckedThisSession) {
      return null;
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

        const isImmediate = updateInfo.serverUpdateType === 'IMMEDIATE';
        return {
          available: true,
          storeVersion: updateInfo.storeVersion,
          isImmediate,
        };
      }
      return { available: false };
    } catch (err: any) {
      logger.debug('InAppUpdate', 'In-app update check skipped or failed', { message: err?.message });
      return null;
    }
  }

  /**
   * Starts the Google Play in-app update flow, with a fallback to opening Google Play Store directly.
   */
  async performUpdate(isImmediate = false): Promise<boolean> {
    try {
      this.setupListeners();
      const started = await ExpoInAppUpdates.startUpdate(isImmediate);
      if (!started) {
        await this.openPlayStore();
      }
      return started;
    } catch (err: any) {
      logger.warn('InAppUpdate', 'startUpdate failed, falling back to Play Store link', { message: err?.message });
      await this.openPlayStore();
      return false;
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
      const rawMessage = String(err?.message || '');
      let friendlyError = 'Unable to check for updates from Google Play.';

      if (rawMessage.includes('ERROR_APP_NOT_OWNED') || rawMessage.includes('-10')) {
        friendlyError = 'App was not installed directly from Google Play Store (e.g. sideloaded or development build). In-app updates will work for users downloading from Play Store.';
      } else if (rawMessage) {
        friendlyError = rawMessage;
      }

      return {
        available: false,
        started: false,
        error: friendlyError,
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
