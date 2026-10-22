# Authentication, Offline Operation, and Synchronization Architecture

> **Audit Scope:** Startup authentication lifecycle, splash screen timing, race condition investigation, session persistence, offline caching, and real-time database synchronization.  
> **Source Files:** [App.tsx](file:///d:/App/Antigravity/Share%20Expense/App.tsx), [firebase.ts](file:///d:/App/Antigravity/Share%20Expense/src/services/firebase.ts), [authService.ts](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts), [useStore.ts](file:///d:/App/Antigravity/Share%20Expense/src/store/useStore.ts)

---

## 1. Startup Authentication Initialization Sequence

The application boot sequence follows a defensive multi-stage hydration pattern designed to prevent UI flicker and eliminate authentication race conditions.

```
App.tsx Mounted
  │
  ├── 1. Call SplashScreen.preventAutoHideAsync()
  │
  ├── 2. Mount Root Animated Splash Overlay (zIndex: 99999, opacity: 1)
  │
  ├── 3. Listen to authService.onAuthStateChanged
  │       │
  │       ├── User Detected:
  │       │     a. Immediately restore @cached_app_user_${email} from AsyncStorage -> setCurrentAppUser()
  │       │     b. Fetch fresh Firestore profile -> getAppUser(uid, email)
  │       │     c. If user marked as deactivated/deleted -> auto-reactivate & notify group
  │       │     d. Register for push notifications -> notificationService.registerForPushNotificationsAsync()
  │       │     e. Fetch user teams -> authService.getUserTeams(email) -> setUserTeams()
  │       │
  │       └── User Null:
  │             a. Reset currentAppUser = null, userTeams = [], expenses = [], members = []
  │
  ├── 4. setInitializing(false)
  │
  ├── 5. Mount NavigationContainer (gated by !initializing)
  │
  └── 6. Trigger Animated.timing(splashOpacity, { toValue: 0, duration: 280ms })
          └── On completion: setSplashMounted(false) (unmount overlay)
```

---

## 2. Investigation: Can the Login Screen Render Before Session Restores?

### The Question
*Does a race condition exist where the `LoginScreen` renders momentarily on startup before a saved session has finished restoring from local storage?*

### Source Code Evidence & Analysis
1. **Navigation Gating in [App.tsx:L277-L312](file:///d:/App/Antigravity/Share%20Expense/App.tsx#L277-L312):**
   ```tsx
   {!initializing && (
     <NavigationContainer theme={navigationTheme}>
       <Stack.Navigator ...>
         {currentAppUser ? (
           <>
             <Stack.Screen name="MainTabs" component={TabNavigator} />
             ...
           </>
         ) : (
           <Stack.Screen name="Login" component={LoginScreen} />
         )}
       </Stack.Navigator>
     </NavigationContainer>
   )}
   ```
   - Notice that the entire `NavigationContainer` is conditionally rendered **only when `!initializing` is true**.
   - While `initializing === true`, neither `LoginScreen` nor `MainTabs` is mounted in the React component tree.
2. **Persistent Visual Shield Overlay in [App.tsx:L315-L358](file:///d:/App/Antigravity/Share%20Expense/App.tsx#L315-L358):**
   ```tsx
   {(initializing || splashMounted) && (
     <Animated.View 
       style={[
         styles.loadingContainer, 
         StyleSheet.absoluteFill,
         { 
           zIndex: 99999,
           elevation: 99999,
           opacity: splashOpacity,
           backgroundColor: darkMode ? '#121212' : '#FFFFFF' 
         }
       ]}
       pointerEvents={initializing ? 'auto' : 'none'}
     >
       <Image source={require('./assets/icon.png')} ... />
       <Text>Share Expense</Text>
     </Animated.View>
   )}
   ```
   - The animated splash overlay sits at `zIndex: 99999` and `elevation: 99999` with `StyleSheet.absoluteFill`.
   - Even during the 280ms fade transition (`splashMounted === true`), the user sees the smooth transition of the splash screen rather than an abrupt screen pop.
3. **Optimistic Local Cache Hydration in [App.tsx:L149-L152](file:///d:/App/Antigravity/Share%20Expense/App.tsx#L149-L152):**
   - Before awaiting remote network round-trips to Firestore, `authService.getCachedAppUser(user.email)` is executed first.
   - If a cached profile exists in AsyncStorage, `setCurrentAppUser(cachedUser)` is called **synchronously before `setInitializing(false)` fires**.
   - Therefore, when `initializing` becomes `false`, `currentAppUser` is already populated.
4. **Audit Conclusion:**
   - **Static Verification:** The codebase has explicitly mitigated this race condition. The `LoginScreen` is structurally prevented from mounting or displaying before the initial Firebase authentication token and cached profile resolution complete.

---

## 3. Supported Authentication Methods & Credentials Handling

### 3.1 Google Sign-In
- **Implementation:** [LoginScreen.tsx:L177-L218](file:///d:/App/Antigravity/Share%20Expense/src/screens/auth/LoginScreen.tsx#L177-L218) & [authService.ts:L64-L117](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L64-L117).
- **Configuration:** Initialized via `@react-native-google-signin/google-signin` with `webClientId: "20947220033-fvnaobstfc3aktvur0kf6e1cquioq6qb.apps.googleusercontent.com"`.
- **Credential Path:** Native Google Sign-In retrieves ID token $\rightarrow$ `GoogleAuthProvider.credential(idToken)` $\rightarrow$ `signInWithCredential(auth, credential)`.
- **Development Fallback Stub:** If no `idToken` is provided (e.g. running in Expo Go client where native Google Play Services modules cannot be loaded), the code falls back to `signInWithEmailAndPassword` or `createUserWithEmailAndPassword` using a deterministic password format: `GoogleAuthStub_${email.split('@')[0]}_SuperSecretPass!` ([authService.ts:L72-L89](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L72-L89)).

### 3.2 Email & Password Authentication
- **Implementation:** [LoginScreen.tsx:L99-L125](file:///d:/App/Antigravity/Share%20Expense/src/screens/auth/LoginScreen.tsx#L99-L125) & [authService.ts:L307-L314](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L307-L314).
- **Functions:** `signInWithEmailAndPassword(auth, email, password)`.
- **Error Mapping:** [authService.ts:L16-L32](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L16-L32) translates raw Firebase error codes (e.g., `'auth/wrong-password'`, `'auth/invalid-credential'`, `'auth/user-not-found'`) into user-friendly feedback strings.

### 3.3 Password Management & Reset
- **Forgot Password:** Calls `fbResetEmail(auth, email)` via `authService.sendPasswordReset` ([authService.ts:L717-L723](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L717-L723)).
- **Change Password:** Requires re-authentication with current password using `EmailAuthProvider.credential(user.email, currentPass)`, followed by `updatePassword(user, newPass)` and `updateDoc(doc(db, 'users', userId), { hasPasswordSet: true })` ([authService.ts:L725-L738](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L725-L738)).
- **Set Password (for Google users adding a password):** Direct `updatePassword(user, newPass)` and sends verification email ([authService.ts:L740-L751](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L740-L751)).

---

## 4. Session Persistence & Sign-Out Cleanup

### 4.1 Persistence Mechanism
In [src/services/firebase.ts:L24-L27](file:///d:/App/Antigravity/Share%20Expense/src/services/firebase.ts#L24-L27), Firebase Auth is initialized with explicit React Native persistence:
```typescript
auth = initializeAuth(app, {
  persistence: getReactNativePersistence(appStorage)
});
```
`appStorage` references `@react-native-async-storage/async-storage`. Tokens and session credentials are securely retained across app restarts and operating system process terminations.

### 4.2 Sign-Out Cleanup Sequence
When the user taps "Sign Out" in Settings ([SettingsScreen.tsx:L444](file:///d:/App/Antigravity/Share%20Expense/src/screens/settings/SettingsScreen.tsx#L444) $\rightarrow$ [authService.ts:L699-L715](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L699-L715)):
1. Clears `@cached_app_user_${email}` from AsyncStorage.
2. Clears `@cached_user_teams_${email}` from AsyncStorage.
3. Clears `@last_active_user_cache` from AsyncStorage.
4. Calls native `GoogleSignin.signOut()` to clear Google Play Services cached credentials.
5. Calls Firebase `fbSignOut(auth)`.
6. Triggers `onAuthStateChanged` callback in `App.tsx`, which clears Zustand store:
   - `setCurrentAppUser(null)`
   - `setUserTeams([])`
   - `setExpenses([])`
   - `setMembers([])`
7. Root Stack Navigator replaces `MainTabs` with `LoginScreen`.

---

## 5. Offline Support & Database Synchronization

### 5.1 Firestore Offline Persistence Configuration
In [src/services/firebase.ts:L32-L36](file:///d:/App/Antigravity/Share%20Expense/src/services/firebase.ts#L32-L36), Firestore is initialized with modern client persistence:
```typescript
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
```
- **Capability:** All Firestore queries and document snapshots are mirrored to disk.
- **Offline Reads:** When offline, `onSnapshot` queries for `expenses`, `users`, and `attendance` read from local disk cache and deliver data to callbacks immediately.
- **Offline Writes:** Writes (`addDoc`, `setDoc`, `updateDoc`, `deleteDoc`, `writeBatch`) succeed locally and append to Firestore's local pending write queue. Once network connectivity is restored, Firestore's background engine automatically syncs pending mutations to the remote cloud.

### 5.2 Application-Level Offline Fallbacks
Beyond Firestore's internal engine, the app maintains explicit application-level caches in AsyncStorage:
1. **User Profile Cache:** If `getDocs` fails during startup due to network error, `authService.getAppUser` catches the error and falls back to `authService.getCachedAppUser(email)` ([authService.ts:L401-L404](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L401-L404)).
2. **Teams Cache:** If `authService.getUserTeams` fails offline, it reads `@cached_user_teams_${email}` ([authService.ts:L429-L434](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L429-L434)).
3. **Personal Loans Cache:** `loanService.getLoans` maintains `@personal_loans_cache`. If remote queries fail offline, it returns the locally cached array filtered strictly by the current user's ID ([loanService.ts:L60-L75](file:///d:/App/Antigravity/Share%20Expense/src/services/loanService.ts#L60-L75)).
4. **Optimistic UI Writes:** Toggling meal attendance in [DashboardTab.tsx:L1061-L1094](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L1061-L1094) modifies the in-memory attendance state immediately, ensuring responsive checkboxes regardless of network speed.

### 5.3 Offline Limitations & Gaps
1. **Push Notifications Require Connectivity:** When an expense or loan is recorded offline, the Firestore document is queued, but the direct HTTP push call to `https://exp.host/--/api/v2/push/send` ([notificationService.ts:L252](file:///d:/App/Antigravity/Share%20Expense/src/services/notificationService.ts#L252)) fails immediately and is not retried.
2. **Receipt Storage Upload Timeout:** If a user adds an expense while offline, receipt upload times out after 2500ms, and the app saves the local file path (`file://...`) into Firestore ([authService.ts:L608](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L608)). Other group members will not be able to view this image.
3. **No Visual Offline Indicator:** The UI does not display an offline banner or queue-pending indicator when disconnected.
