import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as fbSignOut, 
  sendPasswordResetEmail as fbResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updateEmail,
  GoogleAuthProvider,
  signInWithCredential
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  limit, 
  onSnapshot,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from './firebase';
import { AppUser, Team, UserRole } from '../models/types';

export const authService = {
  // Get Auth State Changes Callback
  onAuthStateChanged: (callback: (user: any) => void) => {
    return auth.onAuthStateChanged(callback);
  },

  getCurrentUser: () => auth.currentUser,

  signInWithGoogle: async (email: string, displayName: string, idToken?: string): Promise<{ user: AppUser | null; isNew: boolean }> => {
    let cred;
    let isNew = false;

    if (idToken) {
      const credential = GoogleAuthProvider.credential(idToken);
      cred = await signInWithCredential(auth, credential);
    } else {
      const mockPassword = `GoogleAuthStub_${email.split('@')[0]}_SuperSecretPass!`;
      try {
        cred = await signInWithEmailAndPassword(auth, email, mockPassword);
      } catch (e: any) {
        if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential' || e.code === 'auth/invalid-email') {
          try {
            cred = await createUserWithEmailAndPassword(auth, email, mockPassword);
            isNew = true;
          } catch (createErr: any) {
            if (createErr.code === 'auth/email-already-in-use') {
              throw new Error('This Gmail is already registered in Firebase with a different password. Please delete the user from Firebase Auth Console to register it via Gmail login.');
            }
            throw createErr;
          }
        } else {
          throw e;
        }
      }
    }

    const uid = cred.user.uid;
    const q = query(collection(db, 'users'), where('email', '==', email), limit(1));
    const snap = await getDocs(q);

    if (snap.empty) {
      const newUser: AppUser = {
        id: uid,
        name: displayName || email.split('@')[0],
        email: email,
        phone: '',
        role: 'user',
        teamId: '',
        walletBalance: 0.0,
        currency: 'Rs.',
        createdAt: new Date()
      };
      await setDoc(doc(db, 'users', uid), newUser);
      return { user: newUser, isNew: true };
    } else {
      const d = snap.docs[0];
      const appUser = { id: d.id, ...d.data() } as unknown as AppUser;
      return { user: appUser, isNew: false };
    }
  },

  joinTeam: async (teamId: string): Promise<AppUser> => {
    const user = auth.currentUser;
    if (!user) throw new Error('Not logged in');
    const uid = user.uid;
    const email = user.email!;

    const teamSnap = await getDoc(doc(db, 'teams', teamId));
    if (!teamSnap.exists()) throw new Error('Team not found.');

    const userDocId = `${uid}_${teamId}`;
    const userDocSnap = await getDoc(doc(db, 'users', userDocId));
    if (userDocSnap.exists()) {
      return { id: userDocId, ...userDocSnap.data() } as unknown as AppUser;
    }

    const q = query(collection(db, 'users'), where('email', '==', email), limit(1));
    const existingSnap = await getDocs(q);
    const name = !existingSnap.empty ? (existingSnap.docs[0].data().name || 'Member') : email.split('@')[0];

    const newUser: AppUser = {
      id: userDocId,
      name,
      email,
      phone: '',
      role: 'user',
      teamId,
      walletBalance: 0.0,
      currency: 'Rs.',
      createdAt: new Date()
    };

    await setDoc(doc(db, 'users', userDocId), newUser);
    await updateDoc(doc(db, 'teams', teamId), {
      memberIds: arrayUnion(userDocId)
    });

    return newUser;
  },

  signUpAdmin: async (params: { name: string; email: string; phone: string; password: string; teamName: string }): Promise<AppUser> => {
    let cred;
    try {
      cred = await createUserWithEmailAndPassword(auth, params.email, params.password);
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') {
        cred = await signInWithEmailAndPassword(auth, params.email, params.password);
      } else {
        throw e;
      }
    }
    const uid = cred.user.uid;
    // Generate a random 8 char uppercase teamId
    const teamId = Math.random().toString(36).substring(2, 10).toUpperCase();

    const teamData: Team = {
      id: teamId,
      name: params.teamName,
      adminId: uid,
      memberIds: [uid],
      createdAt: new Date()
    };

    await setDoc(doc(db, 'teams', teamId), teamData);

    const userDocId = `${uid}_${teamId}`;
    const user: AppUser = {
      id: userDocId,
      name: params.name,
      email: params.email,
      phone: params.phone,
      role: 'admin',
      teamId: teamId,
      walletBalance: 0.0,
      currency: 'Rs.',
      createdAt: new Date()
    };

    await setDoc(doc(db, 'users', userDocId), user);
    return user;
  },

  signUpMember: async (params: { name: string; email: string; phone: string; password: string; teamId: string }): Promise<AppUser> => {
    const teamSnap = await getDoc(doc(db, 'teams', params.teamId));
    if (!teamSnap.exists()) throw new Error('Team not found.');

    let cred;
    try {
      cred = await createUserWithEmailAndPassword(auth, params.email, params.password);
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') {
        cred = await signInWithEmailAndPassword(auth, params.email, params.password);
      } else {
        throw e;
      }
    }
    const uid = cred.user.uid;
    const userDocId = `${uid}_${params.teamId}`;

    const user: AppUser = {
      id: userDocId,
      name: params.name,
      email: params.email,
      phone: params.phone,
      role: 'user',
      teamId: params.teamId,
      walletBalance: 0.0,
      currency: 'Rs.',
      createdAt: new Date()
    };

    await setDoc(doc(db, 'users', userDocId), user);
    await updateDoc(doc(db, 'teams', params.teamId), {
      memberIds: arrayUnion(userDocId)
    });
    return user;
  },

  sendPasswordResetEmail: (email: string) => fbResetEmail(auth, email),

  changePassword: async (current: string, newPass: string) => {
    const user = auth.currentUser;
    if (!user || !user.email) throw new Error('Not signed in');
    const credential = EmailAuthProvider.credential(user.email, current);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPass);
  },

  verifyAndChangeEmail: async (newEmail: string, password: string) => {
    const user = auth.currentUser;
    if (!user || !user.email) throw new Error('Not signed in');
    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);
    await updateEmail(user, newEmail);
  },

  getAppUser: async (uid: string): Promise<AppUser | null> => {
    const email = auth.currentUser?.email;
    if (!email) return null;
    const q = query(collection(db, 'users'), where('email', '==', email));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const withTeam = snap.docs.find(d => {
      const data = d.data();
      return data && data.teamId;
    });
    const d = withTeam || snap.docs[0];
    return { id: d.id, ...d.data() } as unknown as AppUser;
  },

  getUserTeams: async (email: string): Promise<any[]> => {
    const q = query(collection(db, 'users'), where('email', '==', email));
    const snap = await getDocs(q);
    const teams: any[] = [];
    for (const uDoc of snap.docs) {
      const u = uDoc.data() as AppUser;
      if (!u.teamId) continue;
      const tSnap = await getDoc(doc(db, 'teams', u.teamId));
      teams.push({
        teamId: u.teamId,
        teamName: tSnap.exists() ? (tSnap.data()?.name || 'Unknown') : 'Unknown',
        role: u.role === 'admin' ? 'Admin' : 'Member',
        userDocId: uDoc.id
      });
    }
    return teams;
  },

  createTeam: async (teamName: string): Promise<string> => {
    const user = auth.currentUser;
    if (!user) throw new Error('Not logged in');
    const uid = user.uid;
    const email = user.email!;
    const teamId = Math.random().toString(36).substring(2, 10).toUpperCase();

    await setDoc(doc(db, 'teams', teamId), {
      id: teamId,
      name: teamName,
      adminId: uid,
      memberIds: [uid],
      createdAt: new Date()
    });

    const q = query(collection(db, 'users'), where('email', '==', email), limit(1));
    const existingSnap = await getDocs(q);
    const name = !existingSnap.empty ? (existingSnap.docs[0].data().name || 'Admin') : 'Admin';

    await setDoc(doc(db, 'users', `${uid}_${teamId}`), {
      id: `${uid}_${teamId}`,
      name,
      email,
      phone: '',
      role: 'admin',
      teamId,
      walletBalance: 0,
      currency: 'Rs.',
      createdAt: new Date()
    });

    return teamId;
  },

  addMemberByEmail: async (params: { email: string; name: string; teamId: string }) => {
    const docId = `${Math.abs(params.email.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0))}_${params.teamId}`;
    const user: AppUser = {
      id: docId,
      name: params.name,
      email: params.email,
      phone: '',
      role: 'user',
      teamId: params.teamId,
      walletBalance: 0.0,
      currency: 'Rs.',
      createdAt: new Date()
    };
    await setDoc(doc(db, 'users', docId), user);
    await updateDoc(doc(db, 'teams', params.teamId), {
      memberIds: arrayUnion(docId)
    });
  },

  removeMember: async (userDocId: string, teamId: string) => {
    await updateDoc(doc(db, 'teams', teamId), {
      memberIds: arrayRemove(userDocId)
    });
    await deleteDoc(doc(db, 'users', userDocId));
  },

  getTeamMembers: (teamId: string, callback: (users: AppUser[]) => void) => {
    const q = query(collection(db, 'users'), where('teamId', '==', teamId));
    return onSnapshot(q, (snap) => {
      const users = snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as AppUser));
      callback(users);
    });
  },

  uploadProfileImage: async (userId: string, imageUri: string): Promise<string> => {
    const response = await fetch(imageUri);
    const blob = await response.blob();
    const storageRef = ref(storage, `profiles/${userId}.jpg`);
    await uploadBytes(storageRef, blob);
    const url = await getDownloadURL(storageRef);
    await updateDoc(doc(db, 'users', userId), { profileImageUrl: url });
    return url;
  },

  updateProfile: async (userId: string, data: Partial<AppUser>) => {
    await updateDoc(doc(db, 'users', userId), data);
  },

  switchActiveTeam: async (userDocId: string): Promise<AppUser> => {
    const snap = await getDoc(doc(db, 'users', userDocId));
    if (!snap.exists()) throw new Error('User record not found.');
    return { id: snap.id, ...snap.data() } as unknown as AppUser;
  },

  signOut: () => fbSignOut(auth)
};
