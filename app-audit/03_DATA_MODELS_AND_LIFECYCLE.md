# Data Models, Data Dictionary, and Entity Lifecycle

> **Audit Scope:** Inspection of TypeScript interfaces, Firestore collections, document structures, AsyncStorage keys, relationships, cascading deletion rules, and schema variances.  
> **Source Files:** [src/models/types.ts](file:///d:/App/Antigravity/Share%20Expense/src/models/types.ts), [authService.ts](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts), [expenseService.ts](file:///d:/App/Antigravity/Share%20Expense/src/services/expenseService.ts), [loanService.ts](file:///d:/App/Antigravity/Share%20Expense/src/services/loanService.ts), [notificationService.ts](file:///d:/App/Antigravity/Share%20Expense/src/services/notificationService.ts)

---

## 1. Remote Data Dictionary (Firestore Collections)

### Collection: `users`
- **Purpose:** Stores user profile, group membership affiliation, wallet balance, and monthly deposit maps.
- **Document ID Strategy:**
  - Team membership: `${firebaseAuthUid}_${teamId}` (e.g., `abc123_XYZ890AB`).
  - Personal workspace: `${firebaseAuthUid}` (e.g., `abc123`).
  - Invited member placeholder: `${hash(email)}_${teamId}`.

| Field Name | Type | Required | Default | Description / Valid Values |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `string` | Yes | Generated | Matches document ID (`${uid}_${teamId}` or `${uid}`) |
| `name` | `string` | Yes | Display Name / Email prefix | Member full name or nickname |
| `email` | `string` | Yes | Auth email | User email address |
| `phone` | `string` | No | `""` | Optional phone number |
| `role` | `string` | Yes | `'user'` | `'admin'` or `'user'` |
| `teamId` | `string` | Yes | `""` | Team ID (empty string if in personal workspace) |
| `walletBalance` | `number` | Yes | `0.0` | Legacy flat wallet balance |
| `monthlyWallets` | `map<string, number>` | No | `{}` | Keyed by month `YYYY-MM` -> deposited amount (e.g. `{"2026-10": 15000}`) |
| `monthlyTarget` | `number` | No | `undefined` | Optional monthly budget/spending target |
| `currency` | `string` | Yes | `'PKR'` or `'Rs.'` | User preferred currency symbol |
| `profileImageUrl`| `string` | No | `undefined` | Remote Firebase Storage URL or local fallback URI |
| `bio` | `string` | No | `""` | User biography description |
| `avatarColor` | `string` | No | `undefined` | Hex color code for initials avatar |
| `pushToken` | `string` | No | `undefined` | Expo push notification token (`ExponentPushToken[...]`) |
| `notifSettings` | `map` | No | `undefined` | Push notification category toggle preferences |
| `hasPasswordSet` | `boolean` | No | `false` | Indicates whether account has an email password configured |
| `deactivated` | `boolean` | No | `false` | Flag indicating user account is temporarily deactivated |
| `deleted` | `boolean` | No | `false` | Flag indicating account is pending permanent deletion |
| `deleteAt` | `Timestamp` | No | `null` | Timestamp 30 days in future when account is purged |
| `createdAt` | `Timestamp` | Yes | `now()` | Account creation date |

---

### Collection: `teams`
- **Purpose:** Represents shared group workspaces.
- **Document ID Strategy:** 8-character uppercase alphanumeric code (e.g., `K9X2M4LQ`).

| Field Name | Type | Required | Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `string` | Yes | Generated | 8-character uppercase code matching document ID |
| `name` | `string` | Yes | User input | Group name (e.g. "Flat 204") |
| `adminId` | `string` | Yes | Auth UID | Firebase Auth UID of the group creator / primary admin |
| `memberIds` | `string[]` | Yes | `[adminId]` | Array of user document IDs (`${uid}_${teamId}`) |
| `groupImageUrl` | `string` | No | `""` | Remote Firebase Storage URL or local fallback URI for group avatar |
| `createdAt` | `Timestamp` | Yes | `now()` | Group creation date |

---

### Collection: `expenses`
- **Purpose:** Individual purchase records logged by members within a workspace.
- **Document ID Strategy:** Auto-generated Firestore document ID.

| Field Name | Type | Required | Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `string` | Yes | Auto ID | Matches document ID |
| `userId` | `string` | Yes | User doc ID | Member ID who paid for the expense |
| `userName` | `string` | Yes | User Name | Payer display name |
| `itemName` | `string` | Yes | User input | Name of purchase (e.g. "Milk & Eggs") |
| `quantity` | `string` | Yes | `'1'` | Quantity string (e.g. `"2 kg"`, `"1"`, `"3 boxes"`) |
| `price` | `number` | Yes | `0.0` | Item price unit or line total |
| `category` | `string` | Yes | `'none'` | `'breakfast'` \| `'lunch'` \| `'dinner'` \| `'utility'` \| `'none'` |
| `date` | `Timestamp` | Yes | Target date | Calendar date to which the expense is attributed |
| `teamId` | `string` | Yes | Active Team | Associated team ID |
| `receiptImageUrl`| `string \| null` | No | `null` | Storage URL or local URI of attached receipt image |
| `splitUserIds` | `string[]` | No | `undefined` | Custom subset of member IDs who share this expense |
| `isEdited` | `boolean` | Yes | `false` | True if modified after creation |
| `lastEditedBy` | `string` | No | `undefined` | Name of user who performed the last edit |
| `lastEditedAt` | `Timestamp` | No | `undefined` | Timestamp of last edit |
| `createdAt` | `Timestamp` | Yes | `now()` | Record creation timestamp |

---

### Collection: `attendance`
- **Purpose:** Daily meal attendance records per user used to dynamically split categorized food expenses.
- **Document ID Strategy:** Deterministic compound key: `${userId}_${YYYY-MM-DD}` (e.g., `abc123_team1_2026-10-21`).

| Field Name | Type | Required | Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `userId` | `string` | Yes | User doc ID | Member ID |
| `teamId` | `string` | Yes | Team ID | Associated team ID |
| `date` | `Timestamp` | Yes | Target day | Midnight timestamp of attendance date |
| `isPresent` | `boolean` | Yes | `false` | True if attended any meal or generally present |
| `attendedBreakfast` | `boolean` | Yes | `false` | Attended breakfast on this day |
| `attendedLunch` | `boolean` | Yes | `false` | Attended lunch on this day |
| `attendedDinner` | `boolean` | Yes | `false` | Attended dinner on this day |

---

### Collection: `personal_loans`
- **Purpose:** "Money Circle" private one-to-one lending and borrowing transactions.
- **Document ID Strategy:** `'loan_' + Date.now() + '_' + rand`.

| Field Name | Type | Required | Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `string` | Yes | Generated | Matches document ID |
| `teamId` | `string` | Yes | Team ID | Workspace context |
| `lenderId` | `string` | Yes | User ID | Member who gave/lent the money |
| `lenderName` | `string` | Yes | Name | Lender display name |
| `borrowerId` | `string` | Yes | User ID | Member who received/borrowed the money |
| `borrowerName` | `string` | Yes | Name | Borrower display name |
| `amount` | `number` | Yes | Input | Loan amount in integer currency |
| `date` | `string` | Yes | ISO string | Transaction date |
| `note` | `string` | No | `""` | Optional description or purpose |
| `status` | `string` | Yes | `'PENDING'` | `'PENDING'` or `'SETTLED'` |
| `createdAt` | `string` | Yes | ISO string | Timestamp of record creation |

---

### Collection: `editHistory`
- **Purpose:** Immutable audit trail for tracking creations, modifications, deletions, and balance adjustments.
- **Document ID Strategy:** Auto-generated Firestore document ID.

| Field Name | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `entityId` | `string` | Yes | ID of affected entity (expense ID, attendance doc ID, user ID) |
| `entityType` | `string` | Yes | `'expense'` \| `'attendance'` \| `'wallet'` \| `'wallet_adjustment'` \| `'month_end_transfer'` |
| `action` | `string` | Yes | `'created'` \| `'updated'` \| `'deleted'` |
| `itemName` | `string` | No | Title of affected record |
| `userId` | `string` | Yes | ID of user who executed the modification |
| `userName` | `string` | Yes | Display name of user who executed the modification |
| `previousData` | `map` | Yes | Snapshot of fields before the modification |
| `newData` | `map` | Yes | Snapshot of fields after the modification |
| `teamId` | `string` | No | Associated team ID |
| `timestamp` | `Timestamp` | Yes | Exact time of edit |

---

### Collection: `notifications`
- **Purpose:** In-app notification center items and push notification reference logs.
- **Document ID Strategy:** Auto-generated Firestore document ID.

| Field Name | Type | Required | Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `teamId` | `string` | Yes | Team ID | Target group workspace |
| `title` | `string` | Yes | String | Alert title (e.g. "New Expense Added") |
| `desc` | `string` | Yes | String | Alert description |
| `notifType` | `string` | Yes | `'newExpense'` | `'newExpense'` \| `'editExpense'` \| `'newMember'` \| `'walletUpdates'` \| `'adjustments'` \| `'transfers'` \| `'monthlyReports'` \| `'moneyCircle'` |
| `targetUserIds` | `string[]` | No | `undefined` | If present, targeted to specific members only |
| `createdAt` | `Timestamp` | Yes | `now()` | Timestamp (auto-purged after 7 days) |

---

## 2. Local Storage Key Inventory (`AsyncStorage`)

| Storage Key | Format / Type | Purpose | Lifecycle & Scope |
| :--- | :--- | :--- | :--- |
| `@cached_app_user_${email}` | JSON (`AppUser`) | Local cache of user profile for instant offline startup hydration | Retained until sign-out |
| `@last_active_user_cache` | JSON (`AppUser`) | Fallback cache if active email cannot be determined | Retained until sign-out |
| `@last_active_user_doc_id_${email}`| `string` (Doc ID) | Tracks which `${uid}_${teamId}` was active during last session | Retained across sessions |
| `@cached_user_teams_${email}` | JSON (`Team[]`) | Cached list of teams user belongs to | Updated on team fetch |
| `@personal_loans_cache` | JSON (`PersonalLoan[]`)| Offline mirror of Money Circle lending records | Updated on loan sync |
| `@onboarding_seen_${userId}` | `'true'` \| `null` | Prevents welcome onboarding modal from reappearing | Permanent per user |
| `@last_read_notif_ts` | `number` (Timestamp) | High-water mark timestamp for computing unread badge counter | Updated when opening alerts |
| `notif_settings` | JSON (`NotifSettings`) | Push notification category preference switches | Persisted per device |

---

## 3. Entity Relationships Diagram

```
 [Team] (teams/{teamId})
   │  1
   ├─── has many ───> [AppUser] (users/{uid}_{teamId})
   │                   │  1
   │                   ├─── pays for ───> [Expense] (expenses/{id})
   │                   │                    │
   │                   │                    └─── split among ───> [AppUser*] (splitUserIds)
   │                   │
   │                   ├─── records ────> [Attendance] (attendance/{uid}_{date})
   │                   │
   │                   └─── party in ───> [PersonalLoan] (personal_loans/{loanId})
   │                                        (lenderId or borrowerId)
   │
   └─── logs ───────> [EditHistory] (editHistory/{id})
   └─── dispatches ─> [Notification] (notifications/{id})
```

---

## 4. Data Lifecycle and Deletion Cascades

1. **Expense Deletion:**
   - [expenseService.ts:L212-L242](file:///d:/App/Antigravity/Share%20Expense/src/services/expenseService.ts#L212-L242) commits a batch operation: deletes document `expenses/${id}` and adds an audit record in `editHistory` with `action: 'deleted'`.
   - **Linked Receipt Image:** The image file in Firebase Storage is **NOT deleted**. The storage path remains orphaned in Cloud Storage.
2. **Member Leaving a Group:**
   - [SettingsScreen.tsx:L735-L755](file:///d:/App/Antigravity/Share%20Expense/src/screens/settings/SettingsScreen.tsx#L735-L755) updates `teams/${teamId}` by calling `arrayRemove(`${uid}_${teamId}`)`.
   - The user document `users/${uid}_${teamId}` is deleted from Firestore.
   - **Historical Records Preserved:** Any expenses previously logged by this user retain the user's `userId` and `userName` strings. The expense documents are not deleted.
3. **Deleting an Entire Group:**
   - [SettingsScreen.tsx:L770-L792](file:///d:/App/Antigravity/Share%20Expense/src/screens/settings/SettingsScreen.tsx#L770-L792) allows an admin to delete a team.
   - `deleteDoc(doc(db, 'teams', teamId))` deletes the team document.
   - **Orphan Analysis:** Expenses, attendance records, and notifications matching `teamId` remain in their respective collections unless manually cleaned up.
4. **Account Deletion (30-Day Soft Delete):**
   - [authService.ts:L673-L697](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L673-L697) sets `deactivated: true, deleted: true, deleteAt: now() + 30 days`.
   - In `authService.getTeamMembers` ([L510-L527](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L510-L527)), members pending deletion remain visible to group teammates until the 30-day window expires.
   - If the user signs in before expiration, the account is automatically reactivated.
5. **Notification Auto-Purge:**
   - In [DashboardTab.tsx:L230-L234](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L230-L234), whenever the notification snapshot listener triggers, any notification with `createdAt < now() - 7 days` is automatically deleted from Firestore via `deleteDoc`.
