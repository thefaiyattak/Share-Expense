import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
const mockSetDoc = vi.fn().mockResolvedValue(undefined);
const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);
const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({ id: 'notifications' })),
  doc: vi.fn((_db, coll, id) => ({ id: id || 'generated_doc_id', path: `${coll}/${id || 'generated'}` })),
  setDoc: (...args: any[]) => mockSetDoc(...args),
  updateDoc: (...args: any[]) => mockUpdateDoc(...args),
  getDoc: (...args: any[]) => mockGetDoc(...args),
  getDocs: (...args: any[]) => mockGetDocs(...args),
  query: vi.fn(),
  where: vi.fn(),
  Timestamp: {
    now: vi.fn(() => ({ toDate: () => new Date(), seconds: 1234567890 })),
  },
}));

vi.mock('./firebase', () => ({
  db: {},
  auth: {
    currentUser: { uid: 'user_sender' },
  },
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {
        eas: { projectId: '089e5718-fd93-4df9-b0ae-24f1435de169' },
      },
    },
  },
}));

// Mock global fetch for Expo Push API
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ data: [{ status: 'ok' }] }),
});
global.fetch = mockFetch;

// Mock expo-notifications with hoisted variables
const {
  mockSetNotificationHandler,
  mockSetNotificationChannelAsync,
  mockRequestPermissionsAsync,
  mockGetPermissionsAsync,
  mockGetExpoPushTokenAsync,
} = vi.hoisted(() => ({
  mockSetNotificationHandler: vi.fn(),
  mockSetNotificationChannelAsync: vi.fn().mockResolvedValue(undefined),
  mockRequestPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
  mockGetPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
  mockGetExpoPushTokenAsync: vi.fn().mockResolvedValue({ data: 'ExponentPushToken[test_token_123]' }),
}));

vi.mock('expo-notifications', () => ({
  setNotificationHandler: (...args: any[]) => mockSetNotificationHandler(...args),
  setNotificationChannelAsync: (...args: any[]) => mockSetNotificationChannelAsync(...args),
  requestPermissionsAsync: (...args: any[]) => mockRequestPermissionsAsync(...args),
  getPermissionsAsync: (...args: any[]) => mockGetPermissionsAsync(...args),
  getExpoPushTokenAsync: (...args: any[]) => mockGetExpoPushTokenAsync(...args),
  AndroidImportance: { MAX: 5 },
}));

import { notificationService } from './notificationService';

describe('notificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Registration & Channel Setup', () => {
    it('initializes android notification channel and requests permission', async () => {
      await notificationService.initPushNotifications();
      expect(mockSetNotificationChannelAsync).toHaveBeenCalledWith('default', expect.objectContaining({
        name: 'default',
        importance: 5,
      }));
    });

    it('registers push token and saves to Firestore user doc', async () => {
      const token = await notificationService.registerForPushNotificationsAsync('user_1');
      expect(token).toBe('ExponentPushToken[test_token_123]');
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'users/user_1' }),
        expect.objectContaining({ pushToken: 'ExponentPushToken[test_token_123]' })
      );
    });
  });

  describe('In-App & Push Notifications (notify)', () => {
    it('always writes in-app notification document to Firestore', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ memberIds: ['user_sender', 'user_recipient_1'] }),
      });
      mockGetDocs.mockResolvedValue({ empty: true, docs: [] });

      await notificationService.notify('team_alpha', 'Lunch Added', 'John added Pizza', 'newExpense');

      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          teamId: 'team_alpha',
          title: 'Lunch Added',
          desc: 'John added Pizza',
          notifType: 'newExpense',
        })
      );
    });

    it('sends push notification to other team members, excluding sender', async () => {
      mockGetDoc.mockImplementation((docRef: any) => {
        if (docRef.path === 'teams/team_alpha') {
          return {
            exists: () => true,
            data: () => ({ memberIds: ['user_sender', 'user_recipient_1'] }),
          };
        }
        if (docRef.path === 'users/user_recipient_1') {
          return {
            exists: () => true,
            data: () => ({
              pushToken: 'ExponentPushToken[recipient_token]',
              notifSettings: { masterEnabled: true, newExpense: true },
            }),
          };
        }
        return { exists: () => false };
      });
      mockGetDocs.mockResolvedValue({ empty: true, docs: [] });

      await notificationService.notify('team_alpha', 'New Expense', 'Pizza bought', 'newExpense');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://exp.host/--/api/v2/push/send',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('ExponentPushToken[recipient_token]'),
        })
      );
      // Ensure sender token is not targeted
      expect(mockFetch.mock.calls[0][1].body).not.toContain('user_sender');
    });

    it('respects user notification preferences and suppresses disabled categories', async () => {
      mockGetDoc.mockImplementation((docRef: any) => {
        if (docRef.path === 'teams/team_alpha') {
          return {
            exists: () => true,
            data: () => ({ memberIds: ['user_quiet'] }),
          };
        }
        if (docRef.path === 'users/user_quiet') {
          return {
            exists: () => true,
            data: () => ({
              pushToken: 'ExponentPushToken[quiet_user]',
              notifSettings: { masterEnabled: false }, // Master disabled!
            }),
          };
        }
        return { exists: () => false };
      });
      mockGetDocs.mockResolvedValue({ empty: true, docs: [] });

      await notificationService.notify('team_alpha', 'New Expense', 'Pizza bought', 'newExpense');

      // Fetch should NOT have been called because quiet_user disabled notifications
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sends targeted push notifications only to targetUserIds (Money Circle)', async () => {
      mockGetDoc.mockImplementation((docRef: any) => {
        if (docRef.path === 'users/user_target_1') {
          return {
            exists: () => true,
            data: () => ({
              pushToken: 'ExponentPushToken[target_token]',
              notifSettings: { masterEnabled: true, moneyCircle: true },
            }),
          };
        }
        return { exists: () => false };
      });

      await notificationService.notify(
        'team_alpha',
        'Money Circle Loan',
        'Lent PKR 500',
        'moneyCircle',
        ['user_target_1', 'user_sender']
      );

      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          targetUserIds: ['user_target_1', 'user_sender'],
        })
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'https://exp.host/--/api/v2/push/send',
        expect.objectContaining({
          body: expect.stringContaining('ExponentPushToken[target_token]'),
        })
      );
    });

    it('never disrupts app if remote push API throws or fails', async () => {
      mockGetDoc.mockRejectedValue(new Error('Network offline'));

      // Should complete gracefully without throwing
      await expect(
        notificationService.notify('team_alpha', 'Fail Safe', 'No throw', 'newExpense')
      ).resolves.not.toThrow();
    });
  });

  describe('Test Push Notification', () => {
    it('sends test push notification successfully', async () => {
      const result = await notificationService.sendTestPushNotification('user_test');
      expect(result.success).toBe(true);
      expect(result.token).toBe('ExponentPushToken[test_token_123]');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://exp.host/--/api/v2/push/send',
        expect.objectContaining({
          body: expect.stringContaining('Push notification service is working properly!'),
        })
      );
    });
  });
});
