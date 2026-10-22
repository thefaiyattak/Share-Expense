# Confirmed Issues, Implementation Anomalies, and Open Questions

> **Audit Scope:** Prioritized technical findings, architectural risks, edge-case limitations, and unverified server-side behaviors discovered during source code inspection.

---

## 1. Confirmed Issues & Implementation Anomalies

### Issue 1: Deterministic Password Stub for Google Sign-In Fallback
- **Severity:** High (Security / Identity Risk)
- **Status:** **Confirmed in Code**
- **File Reference:** [src/services/authService.ts:L72-L89](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L72-L89)
- **Finding:** In `authService.signInWithGoogle`, if an `idToken` is not present (or when executed in Expo Go without native Play Services), the implementation executes:
  ```typescript
  const mockPassword = `GoogleAuthStub_${email.split('@')[0]}_SuperSecretPass!`;
  cred = await signInWithEmailAndPassword(auth, email, mockPassword);
  ```
- **Impact:** Anyone who knows this pattern could authenticate as any Google user in Firebase Auth using the email/password endpoint unless native Google ID token authentication is enforced strictly on the server.

---

### Issue 2: Empty Attendance Passed to Share Calculation in Expenses Screen & Settlement Modal
- **Severity:** High (Financial Allocation Discrepancy)
- **Status:** **Confirmed in Code**
- **File References:**
  - [ExpensesScreen.tsx:L153](file:///d:/App/Antigravity/Share%20Expense/src/screens/expenses/ExpensesScreen.tsx#L153): `attendance: []`
  - [SettlementModal.tsx:L154](file:///d:/App/Antigravity/Share%20Expense/src/components/SettlementModal.tsx#L154): `attendance: []`
  - [DashboardTab.tsx:L997](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L997): `attendance: attendance` (Live array)
- **Finding:** In `DashboardTab`, `calculateShares` receives the live attendance list, correctly distributing meal costs only among members who attended that meal. However, in `ExpensesScreen` and `SettlementModal`, `calculateShares` is called with `attendance: []`.
- **Impact:** In `expenseService.calculateShares` ([L508-L521](file:///d:/App/Antigravity/Share%20Expense/src/services/expenseService.ts#L508-L521)), when `attendance` is empty, meal expenses (Breakfast, Lunch, Dinner) find 0 payers. The algorithm triggers the fallback `shares[exp.userId] += price`, assigning 100% of the cost to the purchaser! Consequently, the member balances shown on the Expenses screen and in the Settlement Modal will differ from the daily breakdown on the Dashboard unless all expenses are either tagged as `utility` or have explicit `splitUserIds`.

---

### Issue 3: Local URI Fallback Breaks Cross-Device Receipt Display
- **Severity:** Medium (Usability / Data Accessibility)
- **Status:** **Confirmed in Code**
- **File Reference:** [src/services/authService.ts:L564-L572](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L564-L572), [L608-L612](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L608-L612)
- **Finding:** If Firebase Storage upload times out (after 2500ms) or encounters a permission/network failure, the code falls back to saving the device's local file URI (e.g. `file:///var/mobile/...` or `content://...`) into Firestore.
- **Impact:** The user who uploaded the receipt will see it render normally on their phone from their local filesystem cache. However, all other teammates on different physical devices will see a broken or blank image.

---

### Issue 4: Global Monkeypatching of `Alert.alert`
- **Severity:** Low (Architectural Side Effect)
- **Status:** **Confirmed in Code**
- **File Reference:** [App.tsx:L96-L125](file:///d:/App/Antigravity/Share%20Expense/App.tsx#L96-L125)
- **Finding:** `Alert.alert` is overridden globally at app startup. If an alert has $\le 1$ button, it renders as a non-blocking floating `CustomToast`.
- **Impact:** Any standard modal alert intended to block execution until the user taps "OK" will instead dismiss automatically after 3 seconds, potentially leaving the user unaware of an error if they are not looking at the screen.

---

### Issue 5: Hardcoded Legacy Month Key `'2026-08'`
- **Severity:** Low (Technical Debt)
- **Status:** **Confirmed in Code**
- **File References:**
  - [settlementService.ts:L53](file:///d:/App/Antigravity/Share%20Expense/src/services/settlementService.ts#L53)
  - [pdfService.ts:L39](file:///d:/App/Antigravity/Share%20Expense/src/services/pdfService.ts#L39)
  - [DashboardTab.tsx:L1013](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L1013)
  - [ExpensesScreen.tsx:L119](file:///d:/App/Antigravity/Share%20Expense/src/screens/expenses/ExpensesScreen.tsx#L119)
- **Finding:** The fallback condition `else if (currentKey === '2026-08' && (!m?.monthlyWallets || Object.keys(m.monthlyWallets).length === 0))` is hardcoded in four separate files to accommodate historical records from August 2026.

---

### Issue 6: Orphaned Storage Files and Group Documents
- **Severity:** Medium (Storage Leak & Orphaned Data)
- **Status:** **Confirmed in Code**
- **Finding:**
  1. Deleting an expense ([expenseService.ts:L212-L242](file:///d:/App/Antigravity/Share%20Expense/src/services/expenseService.ts#L212-L242)) deletes the Firestore document but does not call `deleteObject` on Firebase Storage. The receipt image remains permanently in Cloud Storage.
  2. Deleting a group ([SettingsScreen.tsx:L770-L792](file:///d:/App/Antigravity/Share%20Expense/src/screens/settings/SettingsScreen.tsx#L770-L792)) deletes the team document, but does not cascade to delete associated expenses, attendance records, or audit histories in Firestore.

---

## 2. Potential Risks

1. **Unverified Server-Side Security Rules:**
   - **Risk:** No `firestore.rules` or `storage.rules` files are stored in the git repository. If the remote Firebase project security rules are set to `allow read, write: if true` or `if request.auth != null`, any authenticated client can perform unauthorized balance modifications or member deletions directly via the Firestore REST or JS SDK.
2. **Floating-Point Division Rounding Discrepancies:**
   - **Risk:** Multi-way splits produce infinite decimal fractions ($100 / 3 = 33.333...$). Rounding each member's share independently to an integer can result in the sum of all shares being $\pm 1$ or $\pm 2$ units off from the total expense price.
3. **Push Notifications Failure When Offline:**
   - **Risk:** While Firestore operations are queued offline, the push notification HTTP POST request to `https://exp.host/--/api/v2/push/send` is fire-and-forget. Offline expense entries will never send push notifications once the device reconnects.

---

## 3. Unverified External Areas & Open Questions

| Area / Question | Evidence Limitation | Reason for Limitation |
| :--- | :--- | :--- |
| **Remote Firestore Security Rules** | No `.rules` file in repository | Managed remotely in Firebase Console; read-only local audit cannot inspect remote console settings. |
| **Remote Storage Security Rules** | No `storage.rules` in repository | Managed remotely in Firebase Console. |
| **Push Notification Delivery Rates** | Code dispatches to Expo Push API | Actual push delivery depends on remote Expo push servers, APNs, and FCM device tokens. |
| **Account Deletion Backend Cron Job**| `deleteAt` timestamp set to $+30$ days | Code marks document with `deleteAt`, but no Cloud Function or cron script was found in repo to hard-delete expired documents. Permanent purging may be handled by an uninspected remote Cloud Function or manual cleanup. |
