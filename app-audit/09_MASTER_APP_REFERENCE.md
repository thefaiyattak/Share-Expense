# Share Expense — Master Application Architecture & Implementation Reference

> **Audience:** Senior Software Engineers, Product Architects, and AI Agents tasked with maintaining, redesigning, or building a separate client for Share Expense.  
> **Source Repository:** [https://github.com/thefaiyattak/Share-Expense](https://github.com/thefaiyattak/Share-Expense)  
> **Target Package:** `com.fyntech.expensetracker` (`1.9.0`, Build `19`)  
> **Framework:** React Native 0.86.0 / Expo SDK 57.0.4 (New Architecture Enabled)

---

## 1. System Architecture & Component Hierarchy

Share Expense is a serverless, cross-platform mobile application utilizing Google Firebase JS SDK (v12.16.0) as its cloud persistence layer and Expo native modules for device capabilities.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             REACT NATIVE CLIENT                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  PRESENTATION LAYER (Screens & Modals)                                      │
│  - LoginScreen (Auth & Onboarding)                                          │
│  - MainTabs (DashboardTab, ExpensesScreen, StatisticsScreen, SettingsScreen) │
│  - AddExpenseScreen, UserDetailScreen, MoneyCircleScreen                    │
│  - Reusable Modals (SettlementModal, LoanModal, ChangeHistoryModal, etc.)   │
├─────────────────────────────────────────────────────────────────────────────┤
│  STATE MANAGEMENT (Zustand: src/store/useStore.ts)                          │
│  - currentAppUser, activeTeamId, userTeams, expenses, members, attendance    │
│  - Real-time Firestore snapshot synchronization                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  DOMAIN SERVICES & LOGIC                                                    │
│  - authService.ts: Authentication, team creation/joining, profile management│
│  - expenseService.ts: Expenses, attendance, share allocation calculations    │
│  - loanService.ts: Money Circle 2-party private ledger                      │
│  - settlementService.ts: Wallet pool refund & greedy P2P debt minimization │
│  - notificationService.ts: In-app notifications & Expo Push Gateway         │
│  - pdfService.ts: HTML print templates, CSV formatters, Android SAF export  │
├─────────────────────────────────────────────────────────────────────────────┤
│  PERSISTENCE & INFRASTRUCTURE                                               │
│  - Cloud Firestore (persistentLocalCache with multi-tab manager)            │
│  - Firebase Auth (getReactNativePersistence via AsyncStorage)               │
│  - Firebase Storage (receipts, avatars with 2.5s timeout local fallback)    │
│  - AsyncStorage (cached user, teams list, personal loans, read watermarks)  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Navigation Architecture & Screen Registry

### 2.1 Navigation Structure ([App.tsx](file:///d:/App/Antigravity/Share%20Expense/App.tsx))
- **Root Navigator:** Stack Navigator (`createStackNavigator`), gated by `currentAppUser !== null`.
  - When unauthenticated: Displays `Login` screen.
  - When authenticated: Displays `MainTabs` (`createBottomTabNavigator`), with direct stack routes for modal-like full screens: `AddExpense`, `UserDetail`, `MoneyCircle`.
- **Transitions:** Custom card slide and opacity interpolation (`translateX` from screen width to 0, opacity 0.5 to 1).
- **Tab Bar Styling:** Height `58 + insets.bottom`, theme-aware background (`surface`), border divider.

### 2.2 Screen Directory & Screen Purposes
1. **`LoginScreen` ([src/screens/auth/LoginScreen.tsx](file:///d:/App/Antigravity/Share%20Expense/src/screens/auth/LoginScreen.tsx)):**
   - Native Google Sign-In via `@react-native-google-signin/google-signin`.
   - Collapsible Email & Password form.
   - Forgot Password link sending Firebase password reset email.
2. **`DashboardTab` ([src/screens/home/DashboardTab.tsx](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx)):**
   - Workspace title & group switcher dropdown modal.
   - Invite code display with clipboard copy on press.
   - Personal Wallet Card (Monthly deposit, share deductions, remaining funds, target progress bar).
   - Collective Wallet Card (Total pool deposits, total group spend, remaining cash).
   - Money Circle Card (Net lending balance, To Collect / To Pay summary).
   - Month navigation & horizontal calendar date strip (1st to last day of month).
   - Daily Attendance checkboxes (Breakfast, Lunch, Dinner).
   - Categorized daily expenses list with receipt preview thumbnails and custom split editor.
3. **`ExpensesScreen` ([src/screens/expenses/ExpensesScreen.tsx](file:///d:/App/Antigravity/Share%20Expense/src/screens/expenses/ExpensesScreen.tsx)):**
   - Month-by-month member spending ledger.
   - Member cards displaying each person's deposit, out-of-pocket spending, and net balance.
   - Add Member action (email + name).
   - Team audit history modal trigger (`ChangeHistoryModal`).
   - Settlement Plan modal trigger (`SettlementModal`).
   - Collective PDF and CSV statement generation.
4. **`UserDetailScreen` ([src/screens/expenses/UserDetailScreen.tsx](file:///d:/App/Antigravity/Share%20Expense/src/screens/expenses/UserDetailScreen.tsx)):**
   - In-depth statement for a single chosen member.
   - Net balance breakdown: $\text{Deposit} + \text{Spent} - \text{Share}$.
   - Admin-only balance adjustment (Credit/Debit wallet balance with recorded reason).
   - Direct monthly wallet deposit override.
   - Filterable expense history with modal editing and deletion.
   - Individual PDF and CSV export.
5. **`AddExpenseScreen` ([src/screens/data_entry/AddExpenseScreen.tsx](file:///d:/App/Antigravity/Share%20Expense/src/screens/data_entry/AddExpenseScreen.tsx)):**
   - Multi-item batch entry form (Item Name, Quantity, Price).
   - Receipt capture via Camera or Gallery (`expo-image-picker`).
   - Group member checkboxes for custom split allocation.
   - Atomic Firestore batch commit (`expenses` + `editHistory`).
6. **`MoneyCircleScreen` ([src/screens/home/MoneyCircleScreen.tsx](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/MoneyCircleScreen.tsx)):**
   - Private peer-to-peer lending ledger.
   - Hero net balance banner (`+` Green = owed to you; `-` Red = you owe).
   - Filters: 'all', 'given', 'borrowed'.
   - Per-teammate pairwise breakdown cards.
   - Quick actions: Mark as Settled / Pending, Delete transaction.
7. **`StatisticsScreen` ([src/screens/statistics/StatisticsScreen.tsx](file:///d:/App/Antigravity/Share%20Expense/src/screens/statistics/StatisticsScreen.tsx)):**
   - Interactive SVG donut chart with tapped category drilldown.
   - Horizontal scrolling SVG daily spending bar chart with auto-scroll to latest date.
   - Time filters: Daily, Weekly, Monthly, Custom date range.
   - Member spending progress bars with Largest Remainder percentage normalization.
8. **`SettingsScreen` ([src/screens/settings/SettingsScreen.tsx](file:///d:/App/Antigravity/Share%20Expense/src/screens/settings/SettingsScreen.tsx)):**
   - Profile editor (Avatar, Name, Bio, Phone).
   - Dark mode toggle (`useStore.setDarkMode`).
   - Group management (Switch, Edit group avatar/name, Leave group, Delete group).
   - Currency preference (PKR, Rs., USD, EUR, GBP, AED, SAR, INR).
   - Push notification preferences & channel settings.
   - Security actions (Change Password, Change Email, Deactivate Account, 30-day Account Deletion).
   - In-app 12-slide illustrated tutorial viewer.

---

## 3. Data Schema & Persistence Blueprint

### 3.1 Firestore Collections
1. **`users`:**
   - **Document ID:** `${uid}_${teamId}` for team memberships; `${uid}` for personal workspace.
   - **Schema:**
     ```typescript
     {
       id: string;                      // Matches document ID
       name: string;                    // Member display name
       email: string;                   // Firebase Auth email
       phone: string;                   // Optional phone number
       role: 'admin' | 'user';          // Access role
       teamId: string;                  // Active team code (or empty string)
       walletBalance: number;           // Legacy flat balance
       monthlyWallets?: Record<string, number>; // e.g. {"2026-10": 10000}
       monthlyTarget?: number;          // Optional spending budget target
       currency: string;                // Display currency symbol
       profileImageUrl?: string;        // Storage URL or local file URI
       bio?: string;                    // Biography
       pushToken?: string;              // Expo push token
       notifSettings?: Record<string, boolean>; // Category switches
       deactivated?: boolean;           // Deactivation flag
       deleted?: boolean;               // Deletion pending flag
       deleteAt?: Timestamp | null;     // Deletion timestamp (+30 days)
       createdAt: Timestamp;            // Account creation timestamp
     }
     ```
2. **`teams`:**
   - **Document ID:** 8-character uppercase alphanumeric string (e.g. `K9X2M4LQ`).
   - **Schema:**
     ```typescript
     {
       id: string;                      // 8-character team code
       name: string;                    // Group name (e.g. "Apartment 4B")
       adminId: string;                 // Creator Firebase Auth UID
       memberIds: string[];             // Array of user doc IDs (${uid}_${teamId})
       groupImageUrl?: string;          // Group avatar URL or local URI
       createdAt: Timestamp;            // Group creation timestamp
     }
     ```
3. **`expenses`:**
   - **Document ID:** Auto-generated ID.
   - **Schema:**
     ```typescript
     {
       id: string;
       userId: string;                  // Payer user doc ID
       userName: string;                // Payer display name
       itemName: string;                // Item name
       quantity: string;                // Quantity string (e.g. "2 kg", "1")
       price: number;                   // Item price
       category: 'breakfast' | 'lunch' | 'dinner' | 'utility' | 'none';
       date: Timestamp;                 // Calendar expense date
       teamId: string;                  // Workspace team ID
       receiptImageUrl?: string | null; // Receipt image URL or local URI
       splitUserIds?: string[];         // Explicit member IDs sharing this expense
       isEdited: boolean;               // Has item been edited
       lastEditedBy?: string;           // Editor user display name
       lastEditedAt?: Timestamp;        // Last modification timestamp
       createdAt: Timestamp;            // Record creation timestamp
     }
     ```
4. **`attendance`:**
   - **Document ID:** Deterministic: `${userId}_${YYYY-MM-DD}`.
   - **Schema:**
     ```typescript
     {
       id: string;                      // Compound key matching doc ID
       userId: string;                  // Member user doc ID
       teamId: string;                  // Team ID
       date: Timestamp;                 // Midnight timestamp of target day
       isPresent: boolean;              // General attendance flag
       attendedBreakfast: boolean;      // Attended breakfast
       attendedLunch: boolean;          // Attended lunch
       attendedDinner: boolean;         // Attended dinner
     }
     ```
5. **`personal_loans`:**
   - **Document ID:** `'loan_' + Date.now() + '_' + rand`.
   - **Schema:**
     ```typescript
     {
       id: string;
       teamId: string;                  // Workspace context
       lenderId: string;                // Member who gave/lent money
       lenderName: string;              // Lender display name
       borrowerId: string;              // Member who received/borrowed money
       borrowerName: string;            // Borrower display name
       amount: number;                  // Integer loan amount
       date: string;                    // ISO date string
       note?: string;                   // Optional memo
       status: 'PENDING' | 'SETTLED';   // Transaction status
       createdAt: string;               // ISO timestamp
     }
     ```
6. **`editHistory`:**
   - **Document ID:** Auto-generated ID.
   - **Schema:**
     ```typescript
     {
       entityId: string;                // Affected record ID
       entityType: 'expense' | 'attendance' | 'wallet' | 'wallet_adjustment' | 'month_end_transfer';
       action: 'created' | 'updated' | 'deleted';
       itemName?: string;               // Name of affected entity
       userId: string;                  // Editor user ID
       userName: string;                // Editor display name
       previousData: Record<string, any>; // State before edit
       newData: Record<string, any>;    // State after edit
       teamId?: string;                 // Team context
       timestamp: Timestamp;            // Time of edit
     }
     ```
7. **`notifications`:**
   - **Document ID:** Auto-generated ID (auto-deleted after 7 days).
   - **Schema:**
     ```typescript
     {
       teamId: string;
       title: string;
       desc: string;
       notifType: 'newExpense' | 'editExpense' | 'newMember' | 'walletUpdates' | 'adjustments' | 'transfers' | 'monthlyReports' | 'moneyCircle';
       targetUserIds?: string[];        // If targeted to specific members
       createdAt: Timestamp;
     }
     ```

---

## 4. Financial Calculations & Business Rules

### 4.1 Item Total Price
$$\text{ItemTotal} = (\text{Number}(\text{price}) \lor 0) \times (\text{parseFloat}(\text{quantity}) \lor 1)$$

### 4.2 Member Shares Algorithm (`calculateShares`)
For each expense $e$:
1. If $e.\text{splitUserIds}$ is populated $\rightarrow$ split equally among $e.\text{splitUserIds} \cap \text{Members}$.
2. Else if $e.\text{category} = \text{'utility'}$ $\rightarrow$ split equally among all team members.
3. Else if $e.\text{category} \in \{\text{'breakfast'}, \text{'lunch'}, \text{'dinner'}\}$ $\rightarrow$ split equally among members whose daily attendance matches that meal.
4. Else $\rightarrow$ split equally among members with $\text{isPresent} = \text{true}$.
5. **Fallback:** If zero payers are matched $\rightarrow$ 100% attributed to the purchaser ($e.\text{userId}$).

### 4.3 Settlement Option 1: Wallet Pool Refund Plan
- **Total Wallet Deposits:** $\sum \text{WalletDeposit}(m, \text{month})$
- **Total Spent:** $\sum \text{ItemTotal}(e)$
- **Remaining Pool Cash:** $\max(0, \text{Total Deposits} - \text{Total Spent})$
- **Member Net Position:**
  $$\text{NetPosition}(m) = (\text{WalletDeposit}(m) + \text{OutOfPocketSpent}(m)) - \text{CalculatedShare}(m)$$
  - $\text{NetPosition} \ge 0 \rightarrow$ Member **Receives** $+\text{Math.round}(\text{NetPosition})$ refund from physical pool.
  - $\text{NetPosition} < 0 \rightarrow$ Member **Owes** $-\text{Math.round}(|\text{NetPosition}|)$ back to pool.

### 4.4 Settlement Option 2: Direct Peer-to-Peer Plan
- **Net Expense Balance:** $\text{Math.round}(\text{OutOfPocketSpent}(m) - \text{CalculatedShare}(m))$
- **Debtors:** Balance $< 0$ (sorted descending by debt).
- **Creditors:** Balance $> 0$ (sorted descending by credit).
- **Greedy Minimization:** Greedy while-loop transfers $\min(\text{debtor}, \text{creditor})$ until all balances reach zero.
- **Money Circle Inclusion Toggle:**
  $$\text{CombinedBalance}(m) = (\text{Spent}(m) - \text{Share}(m)) + (\text{Lent}(m) - \text{Borrowed}(m))$$
  Greedy minimization executed over $\text{CombinedBalance}$ to settle personal loans and shared groceries simultaneously.

---

## 5. Security, Permissions, and Authorization Matrix

- **Client-Side Enforcement:**
  - Group name/avatar edits, member role toggling, member removal, and group deletion require `currentAppUser.role === 'admin'`.
  - Admin wallet balance adjustments require `role === 'admin'`.
- **Peer Collaboration Model:**
  - Any member can edit or delete any expense logged in the group.
  - All modifications commit audit logs to `editHistory` with before/after snapshots.
- **Account Deletion:**
  - Sets `deactivated: true, deleted: true, deleteAt: now + 30 days`.
  - Logging back in within 30 days automatically restores the account.
- **Server-Side Enforcement Limitation:**
  - No `firestore.rules` file is stored in the local repository. Server-side rule enforcement remains unverified statically.

---

## 6. Document Generation & External Pipelines

- **PDF Statement:** Generated via `expo-print` using HTML/CSS template containing branding, stats summary boxes, members summary table, Option 1 pool refund settlement table, and detailed expenses ledger.
- **CSV Statement:** Generated via `expo-file-system/legacy` with standard CSV escaping.
- **Android Save to Storage:** Uses `FileSystem.StorageAccessFramework` to grant users direct directory write permissions.
- **WhatsApp Text Sharing:** Uses `settlementService.formatWhatsAppText` to produce markdown text shared via native `Share.share`.
