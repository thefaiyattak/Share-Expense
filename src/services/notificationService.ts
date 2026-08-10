import { collection, setDoc, doc, getDoc, getDocs, query, where, updateDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from './firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const appStorage = (AsyncStorage as any)?.default || AsyncStorage;

export type NotificationType = 'newExpense' | 'editExpense' | 'newMember' | 'walletUpdates' | 'adjustments' | 'transfers' | 'monthlyReports';

let Notifications: typeof import('expo-notifications') | null = null;

try {
  Notifications = require('expo-notifications');
  Notifications?.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch (e) {
  console.log('Native push notification module load skipped:', e);
}

export const notificationService = {
  initPushNotifications: async () => {
    if (!Notifications) return;
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#2E7D32',
        });
      }
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log('Push notification permissions not granted');
      }
    } catch (e) {
      console.log('Failed to initialize push notifications:', e);
    }
  },

  registerForPushNotificationsAsync: async (userId: string) => {
    if (!Notifications) {
      console.log('expo-notifications module is not loaded');
      return null;
    }
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#2E7D32',
        });
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Push notification permission denied by user. Status:', finalStatus);
        throw new Error(`Notification permission is '${finalStatus}'. Please allow Notification permission in Phone Settings -> Apps -> Share Expense -> Notifications.`);
      }

      const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId || '089e5718-fd93-4df9-b0ae-24f1435de169';
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId
      });
      const token = tokenData.data;

      if (token) {
        const savedSettingsStr = await appStorage.getItem('notif_settings');
        let notifSettings = null;
        if (savedSettingsStr) {
          try { notifSettings = JSON.parse(savedSettingsStr); } catch (e) {}
        }
        
        const updatePayload: any = { pushToken: token };
        if (notifSettings) {
          updatePayload.notifSettings = notifSettings;
        }

        // Save to primary userId doc
        if (userId) {
          const userRef = doc(db, 'users', userId);
          await updateDoc(userRef, updatePayload).catch(async () => {
            await setDoc(userRef, updatePayload, { merge: true });
          });
        }

        // Save to Firebase auth.currentUser.uid if distinct
        const authUid = auth.currentUser?.uid;
        if (authUid && authUid !== userId) {
          const authUserRef = doc(db, 'users', authUid);
          await updateDoc(authUserRef, updatePayload).catch(async () => {
            await setDoc(authUserRef, updatePayload, { merge: true });
          });
        }

        console.log('Expo push token registered successfully:', token);
      }
      return token;
    } catch (e: any) {
      console.log('Error registering for push notifications:', e);
      throw e;
    }
  },

  notify: async (teamId: string, title: string, desc: string, notifType?: NotificationType) => {
    if (!teamId) return;

    const typeKey = notifType || 'newExpense';

    // 1. ALWAYS write to Firestore (ensures in-app menu and unread notification count badge work for all members)
    try {
      const notifRef = doc(collection(db, 'notifications'));
      await setDoc(notifRef, {
        teamId,
        title,
        desc,
        notifType: typeKey,
        createdAt: Timestamp.now()
      });
    } catch (e) {
      console.error('Failed to save notification to database:', e);
    }

    // 2. REMOTE CROSS-DEVICE PUSH NOTIFICATION (Sends to all other team members' devices)
    try {
      const currentUserId = auth.currentUser?.uid;
      const teamSnap = await getDoc(doc(db, 'teams', teamId));

      let memberIds: string[] = [];
      if (teamSnap.exists()) {
        memberIds = teamSnap.data()?.memberIds || [];
      }

      // Also query users table by teamId to catch any members not listed directly in team.memberIds
      const usersQuery = query(collection(db, 'users'), where('teamId', '==', teamId));
      const usersSnap = await getDocs(usersQuery).catch(() => null);

      const recipientTokensSet = new Set<string>();

      const isSelfUser = (id: string): boolean => {
        if (!currentUserId || !id) return false;
        return id === currentUserId || id.startsWith(`${currentUserId}_`);
      };

      // Helper to check if recipient accepts this notification type
      const isNotificationAllowedForUser = (uData: any): boolean => {
        const notifSettings = uData?.notifSettings;
        if (notifSettings) {
          if (notifSettings.masterEnabled === false) return false;
          if (notifSettings[typeKey] === false) return false;
        }
        return true;
      };

      // A. Check members from memberIds
      if (memberIds.length > 0) {
        for (const recipientId of memberIds) {
          if (isSelfUser(recipientId)) continue;
          try {
            let uData: any = null;
            const uSnap = await getDoc(doc(db, 'users', recipientId));
            if (uSnap.exists()) uData = uSnap.data();

            // Fallback: If no pushToken on full recipientId, check base uid (before '_')
            if (!uData?.pushToken && recipientId.includes('_')) {
              const baseUid = recipientId.split('_')[0];
              const baseSnap = await getDoc(doc(db, 'users', baseUid));
              if (baseSnap.exists()) uData = baseSnap.data();
            }

            if (uData && isNotificationAllowedForUser(uData) && uData?.pushToken && typeof uData.pushToken === 'string' && uData.pushToken.trim().length > 0) {
              recipientTokensSet.add(uData.pushToken);
            }
          } catch (err) {
            console.error(`Failed to fetch push token for user ${recipientId}:`, err);
          }
        }
      }

      // B. Check users from team query
      if (usersSnap && !usersSnap.empty) {
        usersSnap.docs.forEach(uDoc => {
          if (!isSelfUser(uDoc.id)) {
            const uData = uDoc.data();
            if (isNotificationAllowedForUser(uData) && uData?.pushToken && typeof uData.pushToken === 'string' && uData.pushToken.trim().length > 0) {
              recipientTokensSet.add(uData.pushToken);
            }
          }
        });
      }

      const recipientTokens = Array.from(recipientTokensSet);

      // Send to Expo Push Server API
      if (recipientTokens.length > 0) {
        const pushPayloads = recipientTokens.map(token => ({
          to: token,
          sound: 'default',
          title,
          body: desc,
          data: { teamId, notifType: typeKey },
          priority: 'high',
          badge: 1,
        }));

        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(pushPayloads),
        });
        console.log(`Pushed notification to ${recipientTokens.length} recipient tokens`);
      }
    } catch (e) {
      console.error('Failed to send remote push notification:', e);
    }
  },

  sendTestPushNotification: async (userId: string) => {
    try {
      const token = await notificationService.registerForPushNotificationsAsync(userId);
      if (!token) {
        return { success: false, message: 'Push notification permission was denied or token generation failed.' };
      }

      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{
          to: token,
          sound: 'default',
          title: 'Test Notification',
          body: 'Push notification service is working properly!',
          data: { test: true },
          priority: 'high',
          badge: 1
        }]),
      });

      const resData = await res.json();
      return { success: true, token, resData };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to send test push notification.' };
    }
  }
};
