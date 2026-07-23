import { collection, setDoc, doc } from 'firebase/firestore';
import { db } from './firebase';

export const notificationService = {
  notify: async (teamId: string, title: string, desc: string) => {
    if (!teamId) return;
    try {
      const notifRef = doc(collection(db, 'notifications'));
      await setDoc(notifRef, {
        teamId,
        title,
        desc,
        createdAt: new Date()
      });
    } catch (e) {
      console.error('Failed to push notification:', e);
    }
  }
};
