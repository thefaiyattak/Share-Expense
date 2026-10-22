# User Workflows, Permissions, and Authorization Matrix

> **Audit Scope:** End-to-end user journey tracing, state transitions, client vs. server authorization enforcement, and security policies.  
> **Source Evidence:** [authService.ts](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts), [expenseService.ts](file:///d:/App/Antigravity/Share%20Expense/src/services/expenseService.ts), [DashboardTab.tsx](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx), [SettingsScreen.tsx](file:///d:/App/Antigravity/Share%20Expense/src/screens/settings/SettingsScreen.tsx), [UserDetailScreen.tsx](file:///d:/App/Antigravity/Share%20Expense/src/screens/expenses/UserDetailScreen.tsx)

---

## 1. End-to-End User Workflows

### Workflow 1: First Installation & First Launch
1. **Preconditions:** Fresh application installation; no prior authentication or AsyncStorage state.
2. **Launch Sequence:**
   - [App.tsx:L18-L20](file:///d:/App/Antigravity/Share%20Expense/App.tsx#L18-L20) calls `SplashScreen.preventAutoHideAsync()`.
   - Root component renders animated splash overlay ([App.tsx:L315-L358](file:///d:/App/Antigravity/Share%20Expense/App.tsx#L315-L358)).
   - `authService.onAuthStateChanged` fires with `user = null`.
   - `initializing` state switches from `true` to `false`.
   - Splash overlay animates opacity from `1` to `0` over 280ms and unmounts ([App.tsx:L235-L242](file:///d:/App/Antigravity/Share%20Expense/App.tsx#L235-L242)).
3. **Result:** Navigation renders `LoginScreen`.

---

### Workflow 2: Account Creation & Sign-In (Google Sign-In)
1. **Preconditions:** User on `LoginScreen`.
2. **User Actions:** Taps "Sign in with Google".
3. **Execution Path:**
   - [LoginScreen.tsx:L177-L218](file:///d:/App/Antigravity/Share%20Expense/src/screens/auth/LoginScreen.tsx#L177-L218) checks Play Services and triggers native Google account picker dialog.
   - User chooses Google account -> returns `userInfo` containing email, name, and ID token.
   - Calls `authService.signInWithGoogle(email, name)` ([authService.ts:L64-L117](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L64-L117)).
   - If user document does not exist in `users` collection:
     - New `AppUser` document written to Firestore `users/${uid}` with role `'user'`, `walletBalance: 0.0`, `currency: 'PKR'`.
     - Saved `@last_active_user_doc_id_${email}` to AsyncStorage.
   - Fetches associated user teams via `authService.getUserTeams(email)` ([authService.ts:L407-L436](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L407-L436)).
   - Updates Zustand store (`setCurrentAppUser`, `setUserTeams`).
   - Registers for push notifications ([App.tsx:L175](file:///d:/App/Antigravity/Share%20Expense/App.tsx#L175)).
4. **Result:** User transitions directly into `DashboardTab`. If first login on device, onboarding modal popup appears ([DashboardTab.tsx:L95](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L95)).

---

### Workflow 3: Returning User Launch & Session Restoration
1. **Preconditions:** User previously signed in; valid Firebase Auth session persisted in AsyncStorage.
2. **Execution Path:**
   - [App.tsx:L145-L227](file:///d:/App/Antigravity/Share%20Expense/App.tsx#L145-L227) receives authenticated `user` from `onAuthStateChanged`.
   - **Step 1 (Instant Local Hydration):** Reads cached profile from AsyncStorage key `@cached_app_user_${user.email}` ([authService.ts:L316-L327](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L316-L327)) and immediately populates `currentAppUser` in Zustand.
   - **Step 2 (Remote Re-validation):** Calls `authService.getAppUser(user.uid)`. Queries Firestore `users` by email. If deactivated/pending deletion flag was set, automatically reactivates the account ([authService.ts:L366-L393](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L366-L393)).
   - Reads `@last_active_user_doc_id_${email}` to determine which team document to load.
   - Attaches real-time Firestore listeners for expenses (`expenseService.getTeamExpenses`) and team members (`authService.getTeamMembers`) ([App.tsx:L252-L265](file:///d:/App/Antigravity/Share%20Expense/App.tsx#L252-L265)).
   - `initializing` set to `false`; splash screen smoothly fades out.
3. **Failure Handling:** If network is unavailable, the cached user in step 1 preserves the session completely offline without crashing.

---

### Workflow 4: Group Creation
1. **Preconditions:** Authenticated user; in personal workspace or groups menu.
2. **User Actions:** Taps "Create Group", enters group name (e.g., "Apartment 4B"), taps "Create".
3. **Execution Path:**
   - Triggers `authService.createTeam(teamName)` ([authService.ts:L438-L473](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L438-L473)).
   - Generates random 8-character uppercase Team ID: `Math.random().toString(36).substring(2, 10).toUpperCase()`.
   - Writes `teams/${teamId}` with `{ id, name, adminId: uid, memberIds: [uid], createdAt }`.
   - Creates a team-scoped user profile at `users/${uid}_${teamId}` with `role: 'admin'`.
   - Saves `@last_active_user_doc_id_${email}` with `${uid}_${teamId}`.
   - Refreshes user teams list and switches active context to the new team.
4. **Result:** Dashboard re-renders with group workspace header, collective wallet cards, and displays the new 8-character invite code.

---

### Workflow 5: Joining a Group
1. **Preconditions:** Authenticated user; has received an 8-character invite code from a group admin.
2. **User Actions:** Taps "Join Group", pastes or types code, taps "Join Group".
3. **Execution Path:**
   - Triggers `authService.joinTeam(rawTeamId)` ([authService.ts:L137-L186](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L137-L186)).
   - Parses code via `authService.extractInviteCode`: extracts isolated 8-character alphanumeric string or strips labels.
   - Reads `teams/${teamId}` from Firestore. If not found, throws "Team not found."
   - Creates `users/${uid}_${teamId}` with `role: 'user'`.
   - Updates `teams/${teamId}` by calling `arrayUnion(`${uid}_${teamId}`)` on `memberIds`.
   - Dispatches a group notification: `"${name} (${email}) joined the group."` ([authService.ts:L179-L183](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L179-L183)).
4. **Result:** User is enrolled as member, active workspace switches, and real-time listeners bind to the group's expenses and members.

---

### Workflow 6: Switching Workspaces / Groups
1. **Preconditions:** User belongs to multiple teams or has both personal and team accounts.
2. **User Actions:** Taps team title in Dashboard header -> opens Group Switcher Modal ([DashboardTab.tsx:L1790](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L1790)). Taps desired group or "Personal Workspace".
3. **Execution Path:**
   - If selecting an existing group: calls `authService.switchActiveTeam(userDocId)` ([authService.ts:L618-L628](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L618-L628)).
     - Reads `users/${userDocId}`.
     - Saves `@last_active_user_doc_id_${email}` to AsyncStorage.
     - Sets `currentAppUser` and `activeTeamId` in Zustand.
   - If selecting Personal Workspace: calls `authService.switchToPersonalWorkspace(uid, email, name)` ([authService.ts:L630-L666](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L630-L666)).
     - Finds or creates personal user doc with empty `teamId`.
     - Sets active team to null.
4. **Result:** Dashboard real-time listeners detach from previous group and re-attach to the selected workspace.

---

### Workflow 7: Recording / Updating a Wallet Deposit
1. **Preconditions:** User viewing current or past month in Dashboard.
2. **User Actions:** Taps "My Wallet" card -> opens `Update Wallet Modal` ([DashboardTab.tsx:L1948](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L1948)). Selects "+ Add Funds" or "- Subtract Funds", enters amount (e.g. `5000`), optionally enters monthly target, taps "Save".
3. **Execution Path:**
   - Handled in `handleAddWalletMoney` ([DashboardTab.tsx:L893-L966](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L893-L966)).
   - Computes target month key: `YYYY-MM` (e.g., `"2026-10"`).
   - Reads existing `monthlyWallets[monthKey]`.
   - Computes new deposit: `existingDeposit + amount` (for Add) or `Math.max(0, existingDeposit - amount)` (for Subtract).
   - Updates Firestore `users/${currentAppUser.id}` with `monthlyWallets: { [monthKey]: newDeposit }`.
   - Emits an audit log entry in `editHistory` with entity type `'wallet'` ([expenseService.ts:L244-L283](file:///d:/App/Antigravity/Share%20Expense/src/services/expenseService.ts#L244-L283)).
   - Dispatches a group notification to other members: `"${name} updated wallet"`.
4. **Result:** My Wallet and Collective Wallet cards immediately recalculate remaining funds.

---

### Workflow 8: Adding an Expense (Batch Multi-Item Entry)
1. **Preconditions:** User on Dashboard; taps category "+" icon (e.g. Breakfast) or floating add button.
2. **User Actions:**
   - Navigates to `AddExpenseScreen` with target category and target date pre-populated.
   - Enters item rows (Name, Quantity, Price). Taps "Add item" for additional rows.
   - Optionally captures/attaches receipts per item.
   - Selects which group members share this expense (defaults to all group members).
   - Taps "Save expenses".
3. **Execution Path:**
   - Validates that each item has a non-empty name and a positive numeric price ([AddExpenseScreen.tsx:L154-L169](file:///d:/App/Antigravity/Share%20Expense/src/screens/data_entry/AddExpenseScreen.tsx#L154-L169)).
   - For each item with a local image URI, attempts upload via `authService.uploadReceiptImage(uri)` (timeout 2500ms; falls back to local URI on failure) ([authService.ts:L575-L612](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L575-L612)).
   - Calls `expenseService.addExpenses(list)` ([expenseService.ts:L80-L137](file:///d:/App/Antigravity/Share%20Expense/src/services/expenseService.ts#L80-L137)).
   - Uses Firestore `writeBatch` to commit all expense documents and corresponding `editHistory` audit documents atomically.
   - Sends Expo push notification to all group members: `"${userName} added ${N} item(s): ..."` ([notificationService.ts:L120-L266](file:///d:/App/Antigravity/Share%20Expense/src/services/notificationService.ts#L120-L266)).
4. **Result:** Navigates back to Dashboard; new items appear under the categorized list.

---

### Workflow 9: Marking Daily Meal Attendance
1. **Preconditions:** User viewing a specific date on Dashboard.
2. **User Actions:** Taps meal checkbox chips: "Breakfast", "Lunch", or "Dinner".
3. **Execution Path:**
   - Handled by `handleToggleMealAttendance` ([DashboardTab.tsx:L1041-L1108](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L1041-L1108)).
   - **Optimistic Update:** Instantly clones local `attendance` array in Zustand store and updates UI with 0ms latency.
   - **Background Firestore Write:** Calls `expenseService.markAttendance` ([expenseService.ts:L384-L429](file:///d:/App/Antigravity/Share%20Expense/src/services/expenseService.ts#L384-L429)).
   - Saves document at `attendance/${userId}_${YYYY-MM-DD}` with `{ attendedBreakfast, attendedLunch, attendedDinner, isPresent }`.
   - Records change in `editHistory` collection.
4. **Result:** Meal chips reflect new attendance; automatic meal-based share allocations update.

---

### Workflow 10: Recording a Private Money Circle Entry (Peer Loan)
1. **Preconditions:** User opens `MoneyCircleScreen` or taps Lent/Borrow on Dashboard.
2. **User Actions:** Selects "Lent (Give)" or "Borrow (Take)", picks member, enters amount, date, and note, taps "Save".
3. **Execution Path:**
   - Handled in `LoanModal` ([src/components/LoanModal.tsx:L94-L135](file:///d:/App/Antigravity/Share%20Expense/src/components/LoanModal.tsx#L94-L135)) and `loanService.addLoan` ([src/services/loanService.ts:L82-L119](file:///d:/App/Antigravity/Share%20Expense/src/services/loanService.ts#L82-L119)).
   - If Lent: `lenderId = currentUserId`, `borrowerId = selectedMemberId`.
   - If Borrowed: `lenderId = selectedMemberId`, `borrowerId = currentUserId`.
   - Writes document to `personal_loans/${loanId}` with `status: 'PENDING'`.
   - Updates local cache in AsyncStorage key `@personal_loans_cache`.
   - Dispatches a targeted notification exclusively to the two involved members (bypassing other group members) ([loanService.ts:L107-L116](file:///d:/App/Antigravity/Share%20Expense/src/services/loanService.ts#L107-L116)).
4. **Result:** Money Circle net position and To Collect/To Pay counters update immediately.

---

### Workflow 11: Generating and Sharing a Settlement Plan
1. **Preconditions:** User in `ExpensesScreen` or `DashboardTab`; taps "Settlement Plan".
2. **User Actions:**
   - Opens `SettlementModal` ([src/components/SettlementModal.tsx](file:///d:/App/Antigravity/Share%20Expense/src/components/SettlementModal.tsx)).
   - Selects calculation period: "This Month", "Custom Range", or "All-Time".
   - Selects settlement mode tab:
     - **Option 1: Wallet Pool Refund** (Group pool payout breakdown).
     - **Option 2: Direct Peer-to-Peer** (Optimized debtor-to-creditor transfers).
   - Toggles "Include Money Circle" switch to factor in private personal loans.
   - Taps "Share Summary via WhatsApp" or "Share Statement".
3. **Execution Path:**
   - Dynamic math executed in `SettlementModal.tsx:L138-L236` and `settlementService.ts`.
   - Generates formatted WhatsApp text using markdown formatting (`*bold*`, `_italic_`, emojis) ([settlementService.ts:L142-L188](file:///d:/App/Antigravity/Share%20Expense/src/services/settlementService.ts#L142-L188)).
   - Invokes React Native native `Share.share({ message, title })`.
4. **Result:** Native device sharing sheet opens; user can share directly to WhatsApp, Telegram, Email, or copy to clipboard.

---

### Workflow 12: Account Deletion (30-Day Grace Period)
1. **Preconditions:** User on `SettingsScreen` -> "Security & Privacy".
2. **User Actions:** Taps "Delete Account", confirms warning alert.
3. **Execution Path:**
   - Handled in `authService.deleteAccount(userId)` ([authService.ts:L673-L697](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L673-L697)).
   - Sets `deleteAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)` (30 days in future).
   - Updates user document with `{ deactivated: true, deleted: true, deleteAt }`.
   - Sends a team notification: `"${userName} has scheduled their account for permanent deletion. Their data will remain visible for 30 days."`
   - Signs user out from Firebase Auth.
4. **Reversal / Restoration:** If the user logs back in within 30 days, [authService.ts:L366-L393](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L366-L393) automatically clears the flags (`deactivated: false, deleted: false, deleteAt: null`), sends an "Account Restored" team notification, and restores full access.

---

## 2. Role-Based Permission Matrix

The application defines two user roles in [src/models/types.ts:L1](file:///d:/App/Antigravity/Share%20Expense/src/models/types.ts#L1):
`export type UserRole = 'admin' | 'user';`

| Action / Capability | Signed-Out | Member (`user`) | Admin (`admin`) | Client UI Check | Backend Firestore Rule Enforcement |
| :--- | :---: | :---: | :---: | :--- | :--- |
| **Sign In / Create Account** | Allowed | N/A | N/A | [LoginScreen.tsx](file:///d:/App/Antigravity/Share%20Expense/src/screens/auth/LoginScreen.tsx) | Enforced by Firebase Auth |
| **Create Group / Workspace** | Denied | Allowed | Allowed | Button visible | **Unverified** (No repo rules file) |
| **Join Group via Invite Code** | Denied | Allowed | Allowed | Modal input | **Unverified** |
| **Switch Workspace** | Denied | Allowed | Allowed | Dropdown | **Unverified** |
| **View Group Expenses & Members** | Denied | Allowed | Allowed | Route gated | **Unverified** |
| **Add Expense / Upload Receipt** | Denied | Allowed | Allowed | Form enabled | **Unverified** |
| **Edit / Delete Own Expense** | Denied | Allowed | Allowed | Modal enabled | **Unverified** |
| **Edit / Delete Other's Expense** | Denied | Allowed | Allowed | **Allowed in UI!** | **Unverified** (Any member can edit) |
| **Add New Member to Group** | Denied | Allowed | Allowed | Button visible | **Unverified** |
| **Remove Member from Group** | Denied | Hidden | Allowed | `isAdmin` check | **Unverified** (Client only) |
| **Change Member Role (Admin/User)**| Denied | Hidden | Allowed | `isAdmin` check | **Unverified** (Client only) |
| **Admin Wallet Balance Adjustment**| Denied | Hidden | Allowed | `isAdmin` check | **Unverified** (Client only) |
| **Edit Group Name / Group Avatar** | Denied | Hidden | Allowed | `isAdmin` check | **Unverified** (Client only) |
| **Leave Group** | Denied | Allowed | Denied* | `!isAdmin` check | *Admin must transfer or delete group |
| **Delete Entire Group** | Denied | Hidden | Allowed | `isAdmin` check | **Unverified** (Client only) |
| **Record Money Circle Loan** | Denied | Allowed | Allowed | Strictly 2-party | Local cache + Firestore write |
| **View Money Circle Records** | Denied | 2-party only | 2-party only | Filtered by UID | Firestore query limits to involved |
| **Mark Daily Attendance** | Denied | Own user | Own user | User bound | **Unverified** |
| **Export Statement (PDF/CSV)** | Denied | Allowed | Allowed | Action row | Client-side generation |
| **Delete Own Account** | Denied | Allowed | Allowed | Settings modal | 30-day soft delete in Firestore |

---

## 3. Client vs. Server Authorization Analysis

1. **Client-Side Authorization:**
   - In `UserDetailScreen.tsx` ([L755](file:///d:/App/Antigravity/Share%20Expense/src/screens/expenses/UserDetailScreen.tsx#L755)), the "Admin Balance Adjustment" button is wrapped in `if (currentAppUser?.role === 'admin')`.
   - In `SettingsScreen.tsx` ([L688-L768](file:///d:/App/Antigravity/Share%20Expense/src/screens/settings/SettingsScreen.tsx#L688-L768)), group editing, role toggling, member removal, and group deletion controls are visible only when `role === 'admin'`.
2. **Backend Server Enforcement:**
   - **Status: UNVERIFIED.** No `firestore.rules` file is included in the local project repository. If Firestore security rules in the Firebase console are set to permissive mode (e.g. `allow read, write: if request.auth != null`), any authenticated client could technically issue direct Firestore updates to adjust balances or delete members, bypassing client UI checks.
3. **Collaborative Expense Trust Model:**
   - Any member of a team can edit or delete any expense logged by any other member in that team. This is not restricted to admins or the original author. To provide accountability, every edit, deletion, or creation generates an immutable record in the `editHistory` collection showing who performed the modification, the exact timestamp, and a before/after diff of all changed fields.
