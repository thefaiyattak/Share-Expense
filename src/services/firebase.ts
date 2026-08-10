import { initializeApp, getApps } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
// @ts-ignore
import { getReactNativePersistence } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyCsrP3Q7b_Xp0j2uNgGgyzzKVImcOQpZK8",
  authDomain: "share-expense-ab56b.firebaseapp.com",
  projectId: "share-expense-ab56b",
  storageBucket: "share-expense-ab56b.firebasestorage.app",
  messagingSenderId: "20947220033",
  appId: "1:20947220033:web:6578de0c15899221c878c0"
};

const isNewApp = getApps().length === 0;
const app = isNewApp ? initializeApp(firebaseConfig) : getApps()[0];

const appStorage = (AsyncStorage as any)?.default || AsyncStorage;

let auth: any;
if (isNewApp) {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(appStorage)
  });
} else {
  auth = getAuth(app);
}

const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

const storage = getStorage(app);

export { auth, db, storage };
