# Complete Screen and Navigation Inventory

> **Audit Scope:** Source code inspection of screens, navigators, bottom sheets, modals, and interactive dialogs.  
> **Source Directory:** [src/screens](file:///d:/App/Antigravity/Share%20Expense/src/screens), [src/components](file:///d:/App/Antigravity/Share%20Expense/src/components), [App.tsx](file:///d:/App/Antigravity/Share%20Expense/App.tsx)

---

## 1. Top-Level Navigation Map & Routing Hierarchy

The app uses React Navigation 7 with a root Stack Navigator and a nested Bottom Tab Navigator defined in [App.tsx](file:///d:/App/Antigravity/Share%20Expense/App.tsx#L43-L83). Route access is gated conditionally by `currentAppUser` state:

```
NavigationContainer (App.tsx:L278)
 ├── (Unauthenticated: currentAppUser === null)
 │    └── Stack.Screen name="Login" (LoginScreen.tsx)
 │
 └── (Authenticated: currentAppUser !== null)
      ├── Stack.Screen name="MainTabs" (TabNavigator)
      │    ├── Tab.Screen name="Dashboard" (DashboardTab.tsx)
      │    ├── Tab.Screen name="Expenses" (ExpensesScreen.tsx)
      │    ├── Tab.Screen name="Stats" (StatisticsScreen.tsx)
      │    └── Tab.Screen name="Settings" (SettingsScreen.tsx)
      │
      ├── Stack.Screen name="AddExpense" (AddExpenseScreen.tsx)
      ├── Stack.Screen name="UserDetail" (UserDetailScreen.tsx)
      └── Stack.Screen name="MoneyCircle" (MoneyCircleScreen.tsx)
```

### Global Overlay Layers
Mounted outside the navigation hierarchy at the root level of `App.tsx`:
1. **CustomToast** ([App.tsx:L276](file:///d:/App/Antigravity/Share%20Expense/App.tsx#L276), [CustomToast.tsx](file:///d:/App/Antigravity/Share%20Expense/src/components/CustomToast.tsx)): Floating animated toast with progress bar for notifications and 1-button alerts.
2. **Global Splash Screen Overlay** ([App.tsx:L315-L358](file:///d:/App/Antigravity/Share%20Expense/App.tsx#L315-L358)): Animated splash view that remains mounted until auth initialization resolves, then smoothly fades out.
3. **Global Modern Alert Modal** ([App.tsx:L361-L454](file:///d:/App/Antigravity/Share%20Expense/App.tsx#L361-L454)): Custom dialog rendered when `Alert.alert` is called with 2 or more buttons.

---

## 2. Screen Inventory and Detailed Specification

### 2.1 Login Screen (`LoginScreen.tsx`)
- **Route Name:** `Login`
- **File:** [src/screens/auth/LoginScreen.tsx](file:///d:/App/Antigravity/Share%20Expense/src/screens/auth/LoginScreen.tsx)
- **Purpose:** Onboarding entry point offering Google Sign-In and Email/Password authentication.
- **Entry Point:** Initial route when `currentAppUser` is null.
- **Exit Paths:** Successful authentication updates `currentAppUser` in Zustand store, transitioning to `MainTabs`.
- **Status:** **Implemented** (Google Native Sign-In + Fallback stub; Email/Password Sign-In; Password Reset).

#### Displayed Elements & Interactive Controls:
| Control / Element | Type | Handler | Operation & Data Flow | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Google Sign-In Button** | `TouchableOpacity` | `handleGoogleSignInNative` ([L177-L218](file:///d:/App/Antigravity/Share%20Expense/src/screens/auth/LoginScreen.tsx#L177-L218)) | Initiates Google Play Services sign-in, retrieves email/name, calls `authService.signInWithGoogle` | **Implemented** |
| **Email/Password Toggle Link** | `TouchableOpacity` | `setLoginTab('email')` ([L266](file:///d:/App/Antigravity/Share%20Expense/src/screens/auth/LoginScreen.tsx#L266)) | Expands the email and password input panel | **Implemented** |
| **Email Address Input** | `TextInput` | `setEmailInput` ([L285](file:///d:/App/Antigravity/Share%20Expense/src/screens/auth/LoginScreen.tsx#L285)) | State binding for user login email | **Implemented** |
| **Password Input** | `TextInput` | `setPasswordInput` ([L296](file:///d:/App/Antigravity/Share%20Expense/src/screens/auth/LoginScreen.tsx#L296)) | Secure text entry for user password | **Implemented** |
| **Password Visibility Toggle**| `TouchableOpacity` | `setShowPassword(v => !v)` ([L301](file:///d:/App/Antigravity/Share%20Expense/src/screens/auth/LoginScreen.tsx#L301)) | Toggles password masking (`eye-outline` vs `eye-off-outline`) | **Implemented** |
| **Sign In Button** | `TouchableOpacity` | `handleEmailPasswordSignIn` ([L99-L125](file:///d:/App/Antigravity/Share%20Expense/src/screens/auth/LoginScreen.tsx#L99-L125)) | Calls `authService.signInWithEmail`, hydrates user profile and teams | **Implemented** |
| **Forgot Password Link** | `TouchableOpacity` | `handleForgotPassword` ([L127-L175](file:///d:/App/Antigravity/Share%20Expense/src/screens/auth/LoginScreen.tsx#L127-L175)) | Dispatches Firebase password reset email to entered address | **Implemented** |
| **Alert Modal** | `Modal` | `setAlertVisible(false)` ([L356](file:///d:/App/Antigravity/Share%20Expense/src/screens/auth/LoginScreen.tsx#L356)) | In-screen modal alert for errors or success notifications | **Implemented** |

---

### 2.2 Dashboard Tab (`DashboardTab.tsx`)
- **Route Name:** `Dashboard` (Inside `MainTabs`)
- **File:** [src/screens/home/DashboardTab.tsx](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx) (3,360 lines)
- **Purpose:** Primary command center of the application. Displays personal & collective wallet balances, month-by-month navigation, horizontal date calendar strip, daily meal attendance checkboxes (Breakfast, Lunch, Dinner), categorized expenses for the selected day, Money Circle mini-summary, and quick-add actions.
- **Entry Point:** Default tab on launch.
- **Status:** **Implemented**.

#### Key Sections & Sub-Components in DashboardTab:
1. **Header App Bar:**
   - Active Group Title & Dropdown trigger: Opens Group Switcher Dropdown Modal ([L1790](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L1790)).
   - Invite Code pill with copy-to-clipboard on long press.
   - Notifications bell icon with unread count badge: Opens Notifications Modal ([L2039](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L2039)).
   - App Tutorials icon: Opens `AppTutorialModal` ([L71](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L71)).
2. **Workspace Creation Banner (Personal Workspace Mode):**
   - Visible when user is in personal workspace (`!currentAppUser.teamId`).
   - "Create Group" button -> opens `createModalVisible` ([L1653](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L1653)).
   - "Join Group" button -> opens `joinModalVisible` ([L1704](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L1704)).
3. **Financial Wallet Cards:**
   - **My Wallet Card:** Displays user's deposit for viewing month, remaining balance after user's calculated share, monthly target spending progress bar, and "Add / Subtract Funds" button ([L1407](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L1407)).
   - **Collective Wallet Card (Group mode):** Displays total collective deposits across all members, total group spending, and remaining group cash.
4. **Money Circle Banner:**
   - Summarizes user's private lending position (`To Collect` vs. `To Pay`).
   - "Open Circle" button navigates to `MoneyCircleScreen` ([L305](file:///d:/App/Antigravity/Share%20Expense/App.tsx#L305)).
   - Direct "+ Lent (Give)" and "+ Borrow (Take)" quick buttons open `LoanModal` ([L72](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L72)).
5. **Month & Calendar Date Navigation:**
   - Month Selector with Prev/Next buttons (bounded by user's registration date).
   - Horizontal scrolling calendar date strip (1st to last day of month) with auto-scroll to selected date ([L190-L201](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L190-L201)).
6. **Daily Attendance Section:**
   - Interactive meal chips: Breakfast, Lunch, Dinner.
   - Handled via `handleToggleMealAttendance` ([L1041-L1108](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L1041-L1108)) with 0ms optimistic local store update and background Firestore sync.
7. **Daily Categorized Expense Cards:**
   - Sections for Breakfast, Lunch, Dinner, Utility, and None.
   - Lists item name, payer, quantity, and total price.
   - Receipt attachment preview thumbnail (tap to view full-screen receipt modal).
   - "Edit Split" button opens `Manage Expense Split Modal` ([L2282](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L2282)).
   - Quick "Add Expense" FAB/button navigates to `AddExpenseScreen` with target category preselected.

#### Modals Hosted in DashboardTab:
| Modal Name | Trigger | Action / Purpose | Status |
| :--- | :--- | :--- | :--- |
| **Create Group Modal** ([L1653](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L1653)) | Banner "Create Group" | Creates new team document, generates 8-char uppercase code, creates admin user doc | **Implemented** |
| **Join Group Modal** ([L1704](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L1704)) | Banner "Join Group" | Validates invite code, joins team, supports clipboard paste | **Implemented** |
| **Group Switcher Modal** ([L1790](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L1790)) | Header Title Tap | Lists all teams user belongs to + Personal Workspace option | **Implemented** |
| **Update Wallet Modal** ([L1948](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L1948)) | My Wallet Tap | Allows adding or subtracting wallet funds and setting monthly target | **Implemented** |
| **Notifications Modal** ([L2039](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L2039)) | Header Bell Tap | Full-page list of alerts (7-day retention), mark read, multi-select delete | **Implemented** |
| **Manage Expense Split Modal** ([L2282](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L2282)) | "Edit Split" on Item | Checkbox list of members sharing this specific item's cost | **Implemented** |
| **Receipt Image Preview Modal** ([L2372](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L2372)) | Receipt Thumbnail Tap | Full-screen image preview with close button | **Implemented** |
| **First-Time Onboarding Modal** ([L2397](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L2397)) | First app launch | Welcoming modal dismissed and recorded to `@onboarding_seen_${id}` | **Implemented** |

---

### 2.3 Expenses Screen (`ExpensesScreen.tsx`)
- **Route Name:** `Expenses` (Inside `MainTabs`)
- **File:** [src/screens/expenses/ExpensesScreen.tsx](file:///d:/App/Antigravity/Share%20Expense/src/screens/expenses/ExpensesScreen.tsx) (1,350 lines)
- **Purpose:** Team members management and collective monthly settlement statement view.
- **Status:** **Implemented**.

#### Displayed Elements & Interactive Controls:
| Control / Element | Type | Handler | Description | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Month Navigation Bar** | Buttons | `handlePrevMonth` / `handleNextMonth` ([L62-L75](file:///d:/App/Antigravity/Share%20Expense/src/screens/expenses/ExpensesScreen.tsx#L62-L75)) | Decrements / increments selected statement month | **Implemented** |
| **Month Picker Trigger** | Button | `setMonthPickerVisible(true)` ([L57](file:///d:/App/Antigravity/Share%20Expense/src/screens/expenses/ExpensesScreen.tsx#L57)) | Opens `MonthPickerModal` for direct year/month jump | **Implemented** |
| **Team Financial Summary Card** | Container | Static derived state | Total Deposits, Total Spending, Net Remaining balance | **Implemented** |
| **Audit History Button** | `TouchableOpacity` | `setHistoryModalVisible(true)` ([L523](file:///d:/App/Antigravity/Share%20Expense/src/screens/expenses/ExpensesScreen.tsx#L523)) | Opens `ChangeHistoryModal` displaying team change log | **Implemented** |
| **Add Member Button** | `TouchableOpacity` | `setModalVisible(true)` ([L597](file:///d:/App/Antigravity/Share%20Expense/src/screens/expenses/ExpensesScreen.tsx#L597)) | Opens "Add Member Modal" (Email & Name) | **Implemented** (Admin/Self) |
| **Member Row Cards** | `TouchableOpacity` | `navigation.navigate('UserDetail', { user: m, ... })` ([L687](file:///d:/App/Antigravity/Share%20Expense/src/screens/expenses/ExpensesScreen.tsx#L687)) | Navigates to `UserDetailScreen` for chosen member | **Implemented** |
| **Settlement Plan Button** | `TouchableOpacity` | `setSettlementModalVisible(true)` ([L735](file:///d:/App/Antigravity/Share%20Expense/src/screens/expenses/ExpensesScreen.tsx#L735)) | Opens `SettlementModal` for pool refund and P2P transfers | **Implemented** |
| **Export Statement (PDF/CSV)** | Action row | `pdfService.generatePdf` / `pdfService.generateCsv` | Generates statement file and opens native share sheet | **Implemented** |

---

### 2.4 User Detail Screen (`UserDetailScreen.tsx`)
- **Route Name:** `UserDetail`
- **File:** [src/screens/expenses/UserDetailScreen.tsx](file:///d:/App/Antigravity/Share%20Expense/src/screens/expenses/UserDetailScreen.tsx) (2,160 lines)
- **Purpose:** In-depth financial statement and expense history for an individual member.
- **Entry Point:** Tapping a member row in `ExpensesScreen` or `DashboardTab`.
- **Status:** **Implemented**.

#### Displayed Elements & Interactive Controls:
| Control / Element | Type | Handler | Description | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Month Switcher** | Row | `handlePrevMonth` / `handleNextMonth` | Scopes stats and expenses to selected calendar month | **Implemented** |
| **Member Balance Overview Card** | Card | Derived math | Deposit, Out-of-pocket spent, Fair Share, and Net Position | **Implemented** |
| **Admin Balance Adjustment Button** | `TouchableOpacity` | `setAdjustModalVisible(true)` ([L755](file:///d:/App/Antigravity/Share%20Expense/src/screens/expenses/UserDetailScreen.tsx#L755)) | Admin-only: Credit or debit target member's wallet balance with reason | **Implemented** (Admin only) |
| **Member Wallet Edit Button** | `TouchableOpacity` | `setWalletModalVisible(true)` ([L719](file:///d:/App/Antigravity/Share%20Expense/src/screens/expenses/UserDetailScreen.tsx#L719)) | Directly sets monthly wallet deposit for target member | **Implemented** |
| **Member Audit History Button** | `TouchableOpacity` | `setHistoryModalVisible(true)` ([L703](file:///d:/App/Antigravity/Share%20Expense/src/screens/expenses/UserDetailScreen.tsx#L703)) | Opens `ChangeHistoryModal` filtered to this user's records | **Implemented** |
| **Expense Item Row** | Row | `setExpenseModalVisible(true)` ([L1049](file:///d:/App/Antigravity/Share%20Expense/src/screens/expenses/UserDetailScreen.tsx#L1049)) | Opens Edit/Delete Expense Modal | **Implemented** |
| **Edit/Delete Expense Modal** | `Modal` | `handleSaveEditExpense` / `handleDeleteExpense` | Allows editing item name, price, qty, category, receipt, or deleting | **Implemented** |
| **Export Member PDF/CSV** | Button | `pdfService.generatePdf(targetUserId: id)` | Exports individual statement | **Implemented** |

---

### 2.5 Add Expense Screen (`AddExpenseScreen.tsx`)
- **Route Name:** `AddExpense`
- **File:** [src/screens/data_entry/AddExpenseScreen.tsx](file:///d:/App/Antigravity/Share%20Expense/src/screens/data_entry/AddExpenseScreen.tsx) (608 lines)
- **Purpose:** Multi-item batch expense entry form with receipt attachment and custom member split selectors.
- **Entry Point:** Dashboard quick-add buttons or floating action triggers.
- **Route Params:** `{ defaultCategory?: MealCategory, selectedDate?: string }`
- **Status:** **Implemented**.

#### Displayed Elements & Interactive Controls:
| Control / Element | Type | Handler | Description | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Target Date Banner** | Banner | `expenseDate` state | Displays target date passed from dashboard calendar | **Implemented** |
| **Item Rows (Multi-item batch)**| Dynamic List | `updateItem(index, key, value)` ([L104](file:///d:/App/Antigravity/Share%20Expense/src/screens/data_entry/AddExpenseScreen.tsx#L104)) | Text inputs for Item Name, Quantity, and Price | **Implemented** |
| **Receipt Attachment Box** | Button | `handlePickReceipt(index)` ([L60](file:///d:/App/Antigravity/Share%20Expense/src/screens/data_entry/AddExpenseScreen.tsx#L60)) | Camera or Photo Library picker via `expo-image-picker` | **Implemented** |
| **Add Item Row Button** | Button | `addItemRow` ([L120](file:///d:/App/Antigravity/Share%20Expense/src/screens/data_entry/AddExpenseScreen.tsx#L120)) | Appends a new item row to batch submission | **Implemented** |
| **Remove Item Row** | Button | `removeItemRow(index)` ([L124](file:///d:/App/Antigravity/Share%20Expense/src/screens/data_entry/AddExpenseScreen.tsx#L124)) | Removes selected item row | **Implemented** |
| **Split Member Chips** | Grid of Chips | `toggleSplitUser(id)` ([L130](file:///d:/App/Antigravity/Share%20Expense/src/screens/data_entry/AddExpenseScreen.tsx#L130)) | Selects which group members share this expense | **Implemented** |
| **Select All / Clear Split** | Button | `toggleAllMembers` ([L142](file:///d:/App/Antigravity/Share%20Expense/src/screens/data_entry/AddExpenseScreen.tsx#L142)) | Toggles all group members on or off for split | **Implemented** |
| **Save Expenses Button** | Button | `handleSave` ([L151-L207](file:///d:/App/Antigravity/Share%20Expense/src/screens/data_entry/AddExpenseScreen.tsx#L151-L207)) | Validates fields, uploads receipts, writes batch to Firestore | **Implemented** |

---

### 2.6 Money Circle Screen (`MoneyCircleScreen.tsx`)
- **Route Name:** `MoneyCircle`
- **File:** [src/screens/home/MoneyCircleScreen.tsx](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/MoneyCircleScreen.tsx) (808 lines)
- **Purpose:** Dedicated private ledger for peer-to-peer lending and borrowing (isolated from shared household expenses).
- **Entry Point:** Dashboard Money Circle card banner.
- **Status:** **Implemented**.

#### Displayed Elements & Interactive Controls:
| Control / Element | Type | Handler | Description | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Hero Balance Card** | Card | `summary.netBalance` ([L56](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/MoneyCircleScreen.tsx#L56)) | Net Personal Circle Balance (+ Green = owed, - Red = owe) | **Implemented** |
| **To Collect / To Pay Boxes** | Mini Cards | `summary.toCollect` / `toPay` | Sum of all pending lent vs borrowed amounts | **Implemented** |
| **Lent (Give) Action Button** | Button | `setLoanModalType('give')` ([L220](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/MoneyCircleScreen.tsx#L220)) | Opens `LoanModal` in Lent mode (you gave money) | **Implemented** |
| **Borrow (Take) Action Button** | Button | `setLoanModalType('borrow')` ([L239](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/MoneyCircleScreen.tsx#L239)) | Opens `LoanModal` in Borrow mode (you took money) | **Implemented** |
| **Filter Tabs** | Tabs | `setFilterType('all'|'given'|'borrowed')` ([L29](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/MoneyCircleScreen.tsx#L29)) | Filters active transaction history | **Implemented** |
| **Member Breakdown Cards** | List | `memberBreakdown` ([L72](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/MoneyCircleScreen.tsx#L72)) | Individual card per teammate showing pairwise net balance | **Implemented** |
| **Toggle Settle Button** | Row Action | `handleToggleSettle(loan)` ([L90](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/MoneyCircleScreen.tsx#L90)) | Toggles loan status between `PENDING` and `SETTLED` | **Implemented** |
| **Delete Loan Button** | Row Action | `handleDeleteLoan(loan)` ([L108](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/MoneyCircleScreen.tsx#L108)) | Deletes transaction record with confirmation | **Implemented** |

---

### 2.7 Statistics Screen (`StatisticsScreen.tsx`)
- **Route Name:** `Stats` (Inside `MainTabs`)
- **File:** [src/screens/statistics/StatisticsScreen.tsx](file:///d:/App/Antigravity/Share%20Expense/src/screens/statistics/StatisticsScreen.tsx) (1,266 lines)
- **Purpose:** Analytical visualization of spending trends, category distributions, and daily burn rates using SVG charts.
- **Entry Point:** Bottom Tab Navigator.
- **Status:** **Implemented**.

#### Displayed Elements & Interactive Controls:
| Control / Element | Type | Handler | Description | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Time Period Filters** | Segmented Bar | `setFilter('Daily'|'Weekly'|'Monthly'|'Custom')` ([L29](file:///d:/App/Antigravity/Share%20Expense/src/screens/statistics/StatisticsScreen.tsx#L29)) | Scopes expenses to selected timeframe | **Implemented** |
| **Custom Date Range Pickers** | Date Buttons | `setDatePickerMode('start'|'end')` ([L45](file:///d:/App/Antigravity/Share%20Expense/src/screens/statistics/StatisticsScreen.tsx#L45)) | Opens `AppDatePickerModal` for start/end date | **Implemented** |
| **SVG Donut Chart** | Interactive SVG | `togglePieCat(category)` ([L86](file:///d:/App/Antigravity/Share%20Expense/src/screens/statistics/StatisticsScreen.tsx#L86)) | Animated SVG donut chart with tapped category expansion | **Implemented** |
| **Category Breakdown Cards** | Touch Cards | `togglePieCat(category)` | Displays percentage and amount for Breakfast, Lunch, Dinner, Utility | **Implemented** |
| **SVG Bar Chart Timeline** | Horizontal Scroll | `toggleBarIndex(index)` ([L91](file:///d:/App/Antigravity/Share%20Expense/src/screens/statistics/StatisticsScreen.tsx#L91)) | Date-by-date spending bars with touch tooltips and auto-scroll to end | **Implemented** |
| **Member Spending Progress Bars**| Progress Rows | Static calculations | Relative percentage of total spending contributed by each member | **Implemented** |

---

### 2.8 Settings Screen (`SettingsScreen.tsx`)
- **Route Name:** `Settings` (Inside `MainTabs`)
- **File:** [src/screens/settings/SettingsScreen.tsx](file:///d:/App/Antigravity/Share%20Expense/src/screens/settings/SettingsScreen.tsx) (2,750 lines)
- **Purpose:** User profile configuration, group management, currency settings, theme toggle, push notification preferences, security actions (password change, deactivation, deletion), and in-app tutorials.
- **Entry Point:** Bottom Tab Navigator.
- **Status:** **Implemented**.

#### Key Settings Rows & Action Handlers:
| Section / Item | Type | Handler | Description | Status |
| :--- | :--- | :--- | :--- | :--- |
| **User Profile Card** | Header Card | `setProfileModalVisible(true)` ([L1017](file:///d:/App/Antigravity/Share%20Expense/src/screens/settings/SettingsScreen.tsx#L1017)) | Opens Profile Modal (Avatar upload, Name, Bio, Phone) | **Implemented** |
| **Dark Mode Switch** | Switch | `setDarkMode(!darkMode)` | Toggles dark theme across entire application | **Implemented** |
| **Groups Management** | Row | `setGroupsModalVisible(true)` ([L1090](file:///d:/App/Antigravity/Share%20Expense/src/screens/settings/SettingsScreen.tsx#L1090)) | Switch groups, Edit group details, Leave group, or Delete group | **Implemented** |
| **Currency Preference** | Row | `setCurrencyModalVisible(true)` ([L1096](file:///d:/App/Antigravity/Share%20Expense/src/screens/settings/SettingsScreen.tsx#L1096)) | Select display currency (PKR, Rs., USD, EUR, GBP, AED, SAR, INR) | **Implemented** |
| **Notification Settings** | Row | `setNotifModalVisible(true)` ([L1109](file:///d:/App/Antigravity/Share%20Expense/src/screens/settings/SettingsScreen.tsx#L1109)) | Master switch, category toggles, send test push notification | **Implemented** |
| **Security & Privacy** | Row | `setSecurityModalVisible(true)` ([L1117](file:///d:/App/Antigravity/Share%20Expense/src/screens/settings/SettingsScreen.tsx#L1117)) | Change password, change email, deactivate account, delete account | **Implemented** |
| **App Tutorials & Guides** | Row | `setTutorialModalVisible(true)` ([L1126](file:///d:/App/Antigravity/Share%20Expense/src/screens/settings/SettingsScreen.tsx#L1126)) | Opens step-by-step 12-slide walkthrough | **Implemented** |
| **About Share Expense** | Row | `setAboutModalVisible(true)` ([L1134](file:///d:/App/Antigravity/Share%20Expense/src/screens/settings/SettingsScreen.tsx#L1134)) | Displays app version (1.9.0), developer credits | **Implemented** |
| **Sign Out Button** | Button | `handleSignOut` ([L444](file:///d:/App/Antigravity/Share%20Expense/src/screens/settings/SettingsScreen.tsx#L444)) | Clears cache, signs out of Google and Firebase Auth | **Implemented** |

---

## 3. Reusable Modals & Dialog Components

| Component | File Path | Props & Usage | Status |
| :--- | :--- | :--- | :--- |
| **SettlementModal** | [src/components/SettlementModal.tsx](file:///d:/App/Antigravity/Share%20Expense/src/components/SettlementModal.tsx) | Generates Wallet Pool Refund and P2P settlement plans; handles WhatsApp sharing and Money Circle inclusion toggle. | **Implemented** |
| **LoanModal** | [src/components/LoanModal.tsx](file:///d:/App/Antigravity/Share%20Expense/src/components/LoanModal.tsx) | Records Lent (Give) or Borrowed (Take) transaction with target member, amount, date, and note. | **Implemented** |
| **ChangeHistoryModal** | [src/components/ChangeHistoryModal.tsx](file:///d:/App/Antigravity/Share%20Expense/src/components/ChangeHistoryModal.tsx) | Live Firestore audit log viewer (`editHistory` collection) showing created/updated/deleted diffs. | **Implemented** |
| **AppTutorialModal** | [src/components/AppTutorialModal.tsx](file:///d:/App/Antigravity/Share%20Expense/src/components/AppTutorialModal.tsx) | 12-slide illustrated carousel guiding users through all major app functions. | **Implemented** |
| **MonthPickerModal** | [src/components/MonthPickerModal.tsx](file:///d:/App/Antigravity/Share%20Expense/src/components/MonthPickerModal.tsx) | Month & Year selector dialog with minimum/maximum date boundaries. | **Implemented** |
| **AppDatePickerModal** | [src/components/AppDatePickerModal.tsx](file:///d:/App/Antigravity/Share%20Expense/src/components/AppDatePickerModal.tsx) | Calendar grid day-picker dialog with month/year navigation. | **Implemented** |
| **CustomToast** | [src/components/CustomToast.tsx](file:///d:/App/Antigravity/Share%20Expense/src/components/CustomToast.tsx) | Animated top floating toast with progress indicator (duration: 3000ms). | **Implemented** |
| **GlobalLoader** | [src/components/GlobalLoader.tsx](file:///d:/App/Antigravity/Share%20Expense/src/components/GlobalLoader.tsx) | Modal activity indicator with animated spectrum bars for background operations. | **Implemented** |
