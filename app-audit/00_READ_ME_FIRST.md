# Share Expense (React Native / Expo) — Comprehensive Architecture & Implementation Audit

> **Audit Date:** October 2026  
> **Scope:** Static Source Code & Architecture Inspection (Read-Only)  
> **Project Version:** `1.9.0` (Build VersionCode: `19`)  
> **Target Package:** `com.fyntech.expensetracker`  
> **Repository Reference:** [https://github.com/thefaiyattak/Share-Expense](https://github.com/thefaiyattak/Share-Expense)  
> **Execution Constraint Notice:** **STRICT READ-ONLY AUDIT.** No runtime commands, tests, builds, package managers, development servers, or remote production mutations were executed. All observations are based strictly on static source code inspection, dependency lockfile analysis, native configuration files, and state machine tracing.

---

## 1. Executive Summary

**Share Expense** is a cross-platform mobile application built with **React Native 0.86.0** and **Expo SDK 57.0.4** utilizing the **React Native New Architecture** (`RCTNewArchEnabled: true`). The app is engineered for roommates, flatmates, families, and travel groups to manage collective household funds, record multi-category meal and utility expenses, track daily attendance per meal, manage private peer-to-peer personal loans ("Money Circle"), track wallet deposits across calendar months, and generate mathematically balanced settlement plans via two settlement philosophies (Wallet Pool Refund vs. Direct Peer-to-Peer).

The application uses **Firebase JS SDK (v12.16.0)** for authentication, Firestore database, and Cloud Storage, backed by offline persistence via `@react-native-async-storage/async-storage` and Firestore's `persistentLocalCache`. In addition, native Google Sign-In is integrated via `@react-native-google-signin/google-signin` alongside Expo Push Notifications via Expo's hosted push service.

---

## 2. Actual Technology Stack & Architecture Inventory

| Layer | Technologies / Packages | Source Evidence |
| :--- | :--- | :--- |
| **Framework & Engine** | React 19.2.3, React Native 0.86.0 (New Architecture enabled), Expo SDK ~57.0.4 | [package.json](file:///d:/App/Antigravity/Share%20Expense/package.json#L22-L23), [Info.plist](file:///d:/App/Antigravity/Share%20Expense/ios/ShareExpense/Info.plist#L53) |
| **Language** | TypeScript ~6.0.3 | [package.json](file:///d:/App/Antigravity/Share%20Expense/package.json#L32), [tsconfig.json](file:///d:/App/Antigravity/Share%20Expense/tsconfig.json) |
| **Navigation** | `@react-navigation/native` v7.3.8, `@react-navigation/stack` v7.10.11, `@react-navigation/bottom-tabs` v7.18.8 | [package.json](file:///d:/App/Antigravity/Share%20Expense/package.json#L10-L12), [App.tsx](file:///d:/App/Antigravity/Share%20Expense/App.tsx#L8-L10) |
| **State Management** | Zustand ^5.0.14 | [package.json](file:///d:/App/Antigravity/Share%20Expense/package.json#L28), [useStore.ts](file:///d:/App/Antigravity/Share%20Expense/src/store/useStore.ts#L1-L80) |
| **Local Persistence** | `@react-native-async-storage/async-storage` 2.2.0 | [package.json](file:///d:/App/Antigravity/Share%20Expense/package.json#L7), [firebase.ts](file:///d:/App/Antigravity/Share%20Expense/src/services/firebase.ts#L7) |
| **Backend & Database** | Firebase JS SDK ^12.16.0 (`firebase/auth`, `firebase/firestore`, `firebase/storage`) | [package.json](file:///d:/App/Antigravity/Share%20Expense/package.json#L21), [firebase.ts](file:///d:/App/Antigravity/Share%20Expense/src/services/firebase.ts#L1-L40) |
| **Authentication** | Firebase Auth + Google Sign In (`@react-native-google-signin/google-signin` ^16.1.2) | [authService.ts](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L1-L13), [LoginScreen.tsx](file:///d:/App/Antigravity/Share%20Expense/src/screens/auth/LoginScreen.tsx#L20-L28) |
| **Notifications** | `expo-notifications` ~57.0.8, Expo Push Server API (`https://exp.host/--/api/v2/push/send`) | [notificationService.ts](file:///d:/App/Antigravity/Share%20Expense/src/services/notificationService.ts#L11-L260) |
| **Document Generation** | `expo-print` ^57.0.0, `expo-file-system/legacy` ^57.0.0, `expo-sharing` ^57.0.3 | [pdfService.ts](file:///d:/App/Antigravity/Share%20Expense/src/services/pdfService.ts#L1-L395) |
| **Media Handling** | `expo-image-picker` ^57.0.2 | [AddExpenseScreen.tsx](file:///d:/App/Antigravity/Share%20Expense/src/screens/data_entry/AddExpenseScreen.tsx#L18) |
| **Vector Graphics & Icons** | `@expo/vector-icons` ^15.1.1 (Ionicons), `react-native-svg` 15.15.4 | [package.json](file:///d:/App/Antigravity/Share%20Expense/package.json#L6-L27) |

---

## 3. High-Priority Architectural Findings & Audit Discoveries

During comprehensive static code analysis across all services, screens, components, and native configuration files, the following key architectural behaviors and implementation realities were identified:

1. **Dual-Document Firestore User Model:**
   - When a user joins or creates a team, their user document in Firestore is not saved under their Firebase Auth `uid`. Instead, it is keyed as `${uid}_${teamId}` (e.g., `doc(db, 'users', `${uid}_${teamId}`)`) ([authService.ts:L149-L171](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L149-L171), [L213-L227](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L213-L227)).
   - In personal workspace mode, the document is keyed by `uid`.
   - The app stores `@last_active_user_doc_id_${email}` in `AsyncStorage` to track which team identity is currently active.

2. **Global Alert Monkeypatching:**
   - In [App.tsx:L96-L125](file:///d:/App/Antigravity/Share%20Expense/App.tsx#L96-L125), `Alert.alert` is overridden at runtime.
   - If an alert call has 0 or 1 button, it is intercepted and converted into a non-blocking 3-second floating toast notification ([CustomToast.tsx](file:///d:/App/Antigravity/Share%20Expense/src/components/CustomToast.tsx)).
   - If an alert call has 2 or more buttons, it opens a custom modal popup (`globalAlertVisible`).

3. **Fallback Authentication Stub for Google Sign-In:**
   - In [authService.ts:L72-L89](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L72-L89), if Google Sign-In is invoked without an `idToken` (such as in Expo Go or non-native environments), the code falls back to creating/authenticating a Firebase Email/Password user using a deterministic mock password:
     `GoogleAuthStub_${email.split('@')[0]}_SuperSecretPass!`
   - This allows mock testing in managed Expo without native credentials, but represents a deterministic credential pattern if deployed without native Google Sign-In credentials.

4. **Split Calculation Price vs. Quantity Rule:**
   - Across `expenseService.ts` ([L491](file:///d:/App/Antigravity/Share%20Expense/src/services/expenseService.ts#L491)), `pdfService.ts` ([L29](file:///d:/App/Antigravity/Share%20Expense/src/services/pdfService.ts#L29), [L79](file:///d:/App/Antigravity/Share%20Expense/src/services/pdfService.ts#L79)), `DashboardTab.tsx` ([L982](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L982)), and `ExpensesScreen.tsx` ([L138](file:///d:/App/Antigravity/Share%20Expense/src/screens/expenses/ExpensesScreen.tsx#L138)), total price is computed as:
     `totalItemCost = (Number(price) || 0) * (parseFloat(quantity) || 1)`
   - Any string quantity starting with a number (e.g. `"2 kg"`) parses via `parseFloat` as `2`.

5. **Attendance Parameter Passing Discrepancy:**
   - In `DashboardTab.tsx` ([L997](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L997)), `calculateShares` receives live meal attendance data from Firestore (`attendance: attendance`).
   - In `ExpensesScreen.tsx` ([L153](file:///d:/App/Antigravity/Share%20Expense/src/screens/expenses/ExpensesScreen.tsx#L153)) and `SettlementModal.tsx` ([L154](file:///d:/App/Antigravity/Share%20Expense/src/components/SettlementModal.tsx#L154)), `calculateShares` is called with `attendance: []` (empty array).
   - In `expenseService.calculateShares` ([L519-L521](file:///d:/App/Antigravity/Share%20Expense/src/services/expenseService.ts#L519-L521)), when `attendance` is empty and an expense lacks custom `splitUserIds` and is not utility, `payers.length === 0`, causing the expense to fall back to being 100% assigned to the purchaser!

6. **Hardcoded Legacy Month Key Fallback:**
   - In `settlementService.ts` ([L53](file:///d:/App/Antigravity/Share%20Expense/src/services/settlementService.ts#L53)), `pdfService.ts` ([L39](file:///d:/App/Antigravity/Share%20Expense/src/services/pdfService.ts#L39)), `DashboardTab.tsx` ([L1013](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L1013)), and `ExpensesScreen.tsx` ([L119](file:///d:/App/Antigravity/Share%20Expense/src/screens/expenses/ExpensesScreen.tsx#L119)), the code contains a specific hardcoded check:
     `else if (currentKey === '2026-08' && (!m?.monthlyWallets || Object.keys(m.monthlyWallets).length === 0))`
     `  deposit = m.walletBalance || 0;`
   - This provides backwards compatibility for August 2026 when monthly wallets were transitioned from a flat balance.

7. **Storage Upload Local URI Fallback:**
   - In `authService.ts` ([L564-L572](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L564-L572), [L608-L611](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L608-L611)), if Firebase Storage upload fails (or times out after 2500ms), the app falls back to saving the local device image URI (`file://...`) into Firestore.
   - On the uploading device this displays normally, but on teammates' devices the receipt or avatar will be broken because the local device path does not exist on remote phones.

8. **Server-Side Security Rules:**
   - No `firestore.rules` or `storage.rules` files exist within the local repository workspace.
   - All role restrictions (admin vs. member), balance edits, and deletions are enforced in client code. Server-side rule enforcement remains unverified statically.

---

## 4. Documentation Directory Sitemap

The complete technical reference is organized into modular documents inside the `app-audit` folder:

| Document | Focus & Content |
| :--- | :--- |
| **[00_READ_ME_FIRST.md](file:///d:/App/Antigravity/Share%20Expense/app-audit/00_READ_ME_FIRST.md)** | Executive summary, tech stack, audit boundaries, key findings index. |
| **[01_SCREENS_AND_FEATURES.md](file:///d:/App/Antigravity/Share%20Expense/app-audit/01_SCREENS_AND_FEATURES.md)** | Complete screen catalog, route parameters, modals, interactive buttons, handler mapping. |
| **[02_WORKFLOWS_AND_PERMISSIONS.md](file:///d:/App/Antigravity/Share%20Expense/app-audit/02_WORKFLOWS_AND_PERMISSIONS.md)** | Step-by-step user workflows, role-based permission matrix, client vs server authorization. |
| **[03_DATA_MODELS_AND_LIFECYCLE.md](file:///d:/App/Antigravity/Share%20Expense/app-audit/03_DATA_MODELS_AND_LIFECYCLE.md)** | Data dictionary, Firestore collections, AsyncStorage keys, data lifecycle, cascading deletes. |
| **[04_FINANCIAL_RULES.md](file:///d:/App/Antigravity/Share%20Expense/app-audit/04_FINANCIAL_RULES.md)** | Formulas, meal allocation algorithms, P2P greedy settlement, Money Circle balance rules, worked examples. |
| **[05_AUTH_OFFLINE_AND_SYNC.md](file:///d:/App/Antigravity/Share%20Expense/app-audit/05_AUTH_OFFLINE_AND_SYNC.md)** | Startup sequence, splash screen behavior, session restoration, offline cache & sync limitations. |
| **[06_INTEGRATIONS_AND_REPORTS.md](file:///d:/App/Antigravity/Share%20Expense/app-audit/06_INTEGRATIONS_AND_REPORTS.md)** | Firebase services, push notifications, image picker, PDF/CSV generation, WhatsApp text export. |
| **[07_UI_REDESIGN_HANDOFF.md](file:///d:/App/Antigravity/Share%20Expense/app-audit/07_UI_REDESIGN_HANDOFF.md)** | Design tokens, color system, UI-coupled business logic, "Preserve During Redesign" checklist. |
| **[08_FINDINGS_AND_OPEN_QUESTIONS.md](file:///d:/App/Antigravity/Share%20Expense/app-audit/08_FINDINGS_AND_OPEN_QUESTIONS.md)** | Confirmed bugs/anomalies, partial implementations, potential risks, unverified external dependencies. |
| **[09_MASTER_APP_REFERENCE.md](file:///d:/App/Antigravity/Share%20Expense/app-audit/09_MASTER_APP_REFERENCE.md)** | Consolidated standalone developer blueprint for independent redesign or recreation. |

---

## 5. Audit Scope & Verification Declarations

- **Inspection Type:** Static analysis of JavaScript/TypeScript sources, JSON manifests, iOS and Android native configurations, and project assets.
- **Runtime Execution:** **NONE.** No emulators, simulators, hardware devices, unit tests, or network test runners were executed.
- **Secrets & Personal Data:** Redacted. In accordance with security instructions, API keys and sensitive tokens are not reproduced in audit reports.
