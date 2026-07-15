import { initializeApp, getApps } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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

let auth;
if (isNewApp) {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} else {
  auth = getAuth(app);
}

const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db, storage };
