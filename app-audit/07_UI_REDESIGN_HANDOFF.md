# UI System, Architecture Dependencies, and Redesign Handoff

> **Audit Scope:** UI system tokens, styling architecture, embedded business logic in components, and a comprehensive "Preserve During Redesign" checklist.  
> **Source Files:** [theme.ts](file:///d:/App/Antigravity/Share%20Expense/src/utils/theme.ts), [DashboardTab.tsx](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx), [ExpensesScreen.tsx](file:///d:/App/Antigravity/Share%20Expense/src/screens/expenses/ExpensesScreen.tsx), [SettlementModal.tsx](file:///d:/App/Antigravity/Share%20Expense/src/components/SettlementModal.tsx)

---

## 1. Existing Design System & Styling Architecture

The application uses **Vanilla React Native `StyleSheet`** objects styled dynamically through a theme helper function `getThemeColors(darkMode)` defined in [src/utils/theme.ts](file:///d:/App/Antigravity/Share%20Expense/src/utils/theme.ts).

### 1.1 Color Tokens & Palette Semantics
The app enforces an explicit **Signature Financial Color System** (`FINANCIAL_COLORS`) to ensure users instantly recognize transaction roles:

| Token | Light Value | Dark Value | Financial Semantic |
| :--- | :---: | :---: | :--- |
| `primary` | `#4CAF50` | `#4CAF50` | Brand primary green, interactive buttons, selected tabs |
| `primaryDark` | `#2E7D32` | `#2E7D32` | Header bars, primary brand accents, success toasts |
| `primaryLight` | `#E8F5E9` | `#1B3B2B` | Green badge backgrounds, light highlights |
| `walletDeposit` | `#2E7D32` | `#81C784` | Member deposited cash, positive cash-in |
| `spent` | `#D32F2F` | `#FF8A80` | Out-of-pocket spending, money leaving member pocket |
| `calculatedShare` | `#1565C0` | `#64B5F6` | Calculated consumption share, fair split portion |
| `walletLeft` | `#F57F17` | `#FFD54F` | Remaining positive wallet funds |
| `deficit` | `#C62828` | `#FF8A80` | Negative balance, overdraft, money owed |
| `surface` | `#FFFFFF` | `#1E1E1E` | Card surface, bottom sheets, modals |
| `background` | `#F5F5F5` | `#121212` | Main screen canvas background |
| `textPrimary` | `#2D2D2D` | `#FFFFFF` | Primary headings, body copy |
| `textSecondary` | `#757575` | `#AAAAAA` | Subtitles, helper text, timestamps |
| `divider` | `#EEEEEE` | `#2A2A2A` | Card borders, dividing lines |

### 1.2 Category Color Palette
Defined in Zustand state ([useStore.ts:L47-L52](file:///d:/App/Antigravity/Share%20Expense/src/store/useStore.ts#L47-L52)):
- **Breakfast:** `#FFA726` (Warm Orange)
- **Lunch:** `#4CAF50` (Fresh Green)
- **Dinner:** `#5C6BC0` (Indigo Blue)
- **Utility:** `#EF5350` (Red Coral)

### 1.3 Typography
Configured in `AppTheme.fonts` ([theme.ts:L102-L106](file:///d:/App/Antigravity/Share%20Expense/src/utils/theme.ts#L102-L106)):
- Regular: `'Poppins-Regular'`
- Medium: `'Poppins-Medium'`
- Bold: `'Poppins-Bold'`
*(Note: Where custom fonts are not loaded, fallback styles rely on standard system fonts with font weights `'500'`, `'600'`, `'700'`, `'bold'`)*.

### 1.4 Safe Area & Keyboard Handling
- **Safe Area:** Screens wrap content in `SafeAreaView` from `react-native-safe-area-context` or read `useSafeAreaInsets()` to compute dynamic bottom padding (`height: 58 + insets.bottom` on Tab Bar) ([App.tsx:L71](file:///d:/App/Antigravity/Share%20Expense/App.tsx#L71)).
- **Keyboard Handling:** Modals and screens utilize `KeyboardAvoidingView` with `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}`. Additionally, [src/utils/useKeyboardVisible.ts](file:///d:/App/Antigravity/Share%20Expense/src/utils/useKeyboardVisible.ts) provides a custom hook that detects active keyboard states to adjust modal sheet padding (`modalBottomPadding = isKeyboardVisible ? 14 : Math.max(insets.bottom + 6, 18)`).

---

## 2. Business Logic Coupled Directly to UI Screens

> [!WARNING]
> In this codebase, extensive business and financial calculations are written directly inside Screen and Modal JSX components rather than encapsulated inside backend cloud functions or standalone domain services. Anyone redesigning the UI must take extreme care not to erase or alter these inline calculations.

### Critical Embedded Logic Locations:
1. **`DashboardTab.tsx`:**
   - **User Join Date Floor:** Lines 140-158 compute `userJoinMonthStart` and filter out all historical group expenses that occurred prior to the month the user joined.
   - **Line Total Spending:** Lines 978-984 multiply `price * quantity` across all expenses in the viewing month.
   - **Monthly Wallet Resolution:** Lines 1008-1022 look up `monthlyWallets[viewingMonthKey]` with legacy fallback for `'2026-08'`.
   - **Optimistic Attendance Toggle:** Lines 1041-1108 mutate the local attendance array immediately to guarantee 0ms UI responsiveness before initiating the Firestore write.
2. **`ExpensesScreen.tsx`:**
   - **Single-Pass Spending Map:** Lines 131-143 compute total out-of-pocket spending per user in a single reduction pass.
   - **Attendance Fallback Discrepancy:** Line 153 invokes `calculateShares` with `attendance: []`, causing non-utility expenses without custom splits to be attributed 100% to the purchaser.
3. **`SettlementModal.tsx`:**
   - **Combined Debt Minimization Algorithm:** Lines 172-236 calculate combined net balances between shared expenses and private personal loans, sorting debtors and creditors descending and executing the greedy matching while-loop.
   - **Custom Date Range Boundaries:** Lines 115-135 clamp start dates to `00:00:00.000` and end dates to `23:59:59.999`.

---

## 3. "Preserve During Redesign" Checklist

When creating a new UI, redesigning screens, or building an alternative frontend client for Share Expense, the following behavioral specifications must be strictly maintained:

### 1. Financial Calculations & Precision
- [ ] Maintain line item total calculation: `Total = (Number(price) || 0) * (parseFloat(quantity) || 1)`.
- [ ] Maintain the dual settlement philosophy:
  - **Option 1 (Wallet Pool Refund):** `Net Position = (Wallet Deposit + Out of Pocket) - Share`.
  - **Option 2 (Direct P2P):** `Net Balance = Out of Pocket - Share` resolved via greedy debtor-to-creditor matching.
- [ ] Preserve the "Include Money Circle" switch in P2P settlement: `Combined Balance = (Spent - Share) + (Lent - Borrowed)`.
- [ ] Preserve Largest Remainder Method (`calculateIntegerPercentages`) on statistical progress bars to guarantee 100% exact sum.
- [ ] Retain legacy month key fallback for `'2026-08'` where `deposit = walletBalance`.

### 2. Identity & Persistence Keys
- [ ] Preserve dual-document user ID pattern: team profiles stored at `users/${uid}_${teamId}`, personal profiles at `users/${uid}`.
- [ ] Preserve AsyncStorage tracking key `@last_active_user_doc_id_${email}` to maintain active group selection across sessions.
- [ ] Preserve offline cache keys: `@cached_app_user_${email}`, `@cached_user_teams_${email}`, `@personal_loans_cache`.

### 3. Navigation & Routing
- [ ] Gate routes by `currentAppUser`: render `LoginScreen` when null, `MainTabs` + sub-screens when authenticated.
- [ ] Maintain parameter passing to `AddExpenseScreen`: `{ defaultCategory, selectedDate }`.
- [ ] Prevent `LoginScreen` flash on boot: keep splash overlay mounted until `initializing === false`.

### 4. Permissions & Audit Integrity
- [ ] Restrict group editing, member removal, role assignment, and admin wallet balance adjustments to users with `role === 'admin'`.
- [ ] Retain peer collaborative editing: any member can edit any expense, but every modification MUST append an entry to `editHistory` with before/after diffs.
- [ ] Preserve 30-day soft deletion grace period on account deletion (`deleteAt = now + 30 days`), allowing seamless restoration upon re-login.

### 5. Media & File Export
- [ ] Maintain 2500ms timeout on receipt upload with local device URI fallback.
- [ ] Preserve Android `StorageAccessFramework` integration for directory saving of PDF and CSV files.
- [ ] Preserve WhatsApp markdown formatting (`*bold*`, emojis, bulleted payout lists) when sharing settlement plans.
