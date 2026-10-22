# External Integrations, Cloud Services, and Document Generation

> **Audit Scope:** Remote APIs, cloud storage, notification dispatchers, file pipelines, and report export engines.  
> **Source Files:** [firebase.ts](file:///d:/App/Antigravity/Share%20Expense/src/services/firebase.ts), [notificationService.ts](file:///d:/App/Antigravity/Share%20Expense/src/services/notificationService.ts), [pdfService.ts](file:///d:/App/Antigravity/Share%20Expense/src/services/pdfService.ts), [settlementService.ts](file:///d:/App/Antigravity/Share%20Expense/src/services/settlementService.ts), [app.json](file:///d:/App/Antigravity/Share%20Expense/app.json)

---

## 1. Cloud Backend Services & APIs

| Service | Provider | Purpose | Configuration Keys (Values Redacted) | Implementation Status |
| :--- | :--- | :--- | :--- | :--- |
| **Authentication** | Firebase Auth | User authentication, token management, password resets | `apiKey`, `authDomain`, `projectId`, `appId` | **Implemented** |
| **Cloud Database** | Cloud Firestore | Real-time multi-client document store | `projectId` | **Implemented** |
| **Object Storage** | Firebase Storage | Image uploads for receipts and user/group avatars | `storageBucket` | **Implemented** (with local fallback) |
| **Push Gateway** | Expo Push API | Remote push dispatching (`https://exp.host/--/api/v2/push/send`) | `projectId` (EAS Project ID in `app.json`) | **Implemented** |
| **Google Sign-In** | Google Identity | Native Android/iOS Google authentication | `webClientId` | **Implemented** |

---

## 2. Push Notification Architecture

The application implements a dual-layer notification architecture combining Firestore in-app alerts with remote Expo push notifications ([notificationService.ts](file:///d:/App/Antigravity/Share%20Expense/src/services/notificationService.ts)):

```
Notification Event Triggered (e.g. New Expense, Loan Created, Wallet Update)
  │
  ├── 1. In-App Notification Write (Always Committed)
  │       └── Writes doc to Firestore collection `notifications`
  │           Fields: { teamId, title, desc, notifType, targetUserIds?, createdAt }
  │           Retention: Records older than 7 days are auto-deleted by listener
  │
  └── 2. Cross-Device Remote Push Notification
          │
          ├── Resolve Target Recipients:
          │     - Targeted: User IDs specified in targetUserIds (e.g. Money Circle)
          │     - Group-wide: All team members except the initiating user (self-filtered)
          │
          ├── Check Recipient Preferences (uData.notifSettings):
          │     - masterEnabled === false -> Skip
          │     - notifSettings[notifType] === false -> Skip
          │
          ├── Collect Push Tokens:
          │     - Reads uData.pushToken from Firestore user documents
          │
          └── Dispatch HTTP POST to Expo Server:
                URL: https://exp.host/--/api/v2/push/send
                Payload: [{ to, sound: 'default', title, body, priority: 'high', data }]
```

### Android Notification Channel Configuration
In [notificationService.ts:L32-L39](file:///d:/App/Antigravity/Share%20Expense/src/services/notificationService.ts#L32-L39):
- **Channel ID:** `'default'`
- **Importance:** `Notifications.AndroidImportance.MAX`
- **Vibration Pattern:** `[0, 250, 250, 250]`
- **Light Color:** `#2E7D32` (App signature primary green)

### Supported Notification Types & Preference Keys
- `'newExpense'`: Dispatched when a member logs one or more expenses.
- `'editExpense'`: Dispatched when an expense is updated or deleted.
- `'newMember'`: Dispatched when a new user joins the group via invite code.
- `'walletUpdates'`: Dispatched when a member deposits or withdraws wallet funds.
- `'adjustments'`: Dispatched when an admin adjusts a member's balance.
- `'transfers'`: Dispatched for month-end balance roll-forwards.
- `'monthlyReports'`: Summary reports.
- `'moneyCircle'`: Targeted notification between lender and borrower.

---

## 3. Receipts, Media, and Storage Pipeline

### 3.1 Media Capture
Receipt images and profile pictures are captured using `expo-image-picker` ([AddExpenseScreen.tsx:L60-L101](file:///d:/App/Antigravity/Share%20Expense/src/screens/data_entry/AddExpenseScreen.tsx#L60-L101)):
- **Sources:** Device Camera (`ImagePicker.launchCameraAsync`) or Photo Gallery (`ImagePicker.launchImageLibraryAsync`).
- **Options:** `mediaTypes: ['images']`, `quality: 0.8`.
- **Permissions:** Prompts for `CameraPermissions` and `MediaLibraryPermissions`.

### 3.2 Firebase Storage Upload Paths
- **Receipts:** `receipts/${Date.now()}_${rand}.jpg` ([authService.ts:L577](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L577))
- **User Profiles:** `profiles/${userId}_${Date.now()}.jpg` ([authService.ts:L533](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L533))
- **Group Avatars:** `groups/${cleanTeamId}_${Date.now()}.jpg` ([authService.ts:L533](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L533))

### 3.3 Blob Conversion & Fallback Strategy
1. The app converts the React Native image URI into a binary `Blob` using `fetch(imageUri)` or an `XMLHttpRequest` fallback with `responseType = 'blob'`.
2. **2500ms Timeout Guard:** `authService.uploadReceiptImage` races the upload against a 2.5-second timeout promise ([authService.ts:L603-L607](file:///d:/App/Antigravity/Share%20Expense/src/services/authService.ts#L603-L607)).
3. **Local URI Fallback:** If the upload fails, is rejected, or times out, the function catches the error and returns the local `imageUri` (`file://...`). While this allows the author to view their receipt instantly without blocking expense submission, teammates on other devices cannot resolve this path.

---

## 4. Statement & Report Generation

The application includes full PDF and CSV document generation engines in [src/services/pdfService.ts](file:///d:/App/Antigravity/Share%20Expense/src/services/pdfService.ts):

### 4.1 PDF Statement Generation (`pdfService.generatePdf`)
- **Engine:** `expo-print` via `Print.printToFileAsync({ html })`.
- **HTML/CSS Design:**
  - Modern print stylesheet using Helvetica Neue typography, brand header with team name and period.
  - Three-column metrics summary banner (Total Spending, Member Count, Total Items Logged).
  - **Members Summary Table:** Name, Total Spent, Wallet Balance, Net Balance.
  - **Option 1 Settlement Summary Table:** Member, Total Contributed, Fair Share, Net Settlement (Receives/Owes with color badges).
  - **Detailed Expenses Ledger:** Date & Time, Item Name, Quantity/Description, Line Total, Category Badge, Paid By.
  - Footer with software version attribution.
- **Scope Options:** Can generate a collective team statement or filter to a single user (`targetUserId`).
- **Sharing:** Immediately invokes `expo-sharing` (`Sharing.shareAsync`) unless `skipShare` is true.

### 4.2 CSV Statement Generation (`pdfService.generateCsv`)
- **Engine:** Pure JavaScript CSV formatting with double-quote escaping.
- **Headers:** `['Date', 'Item', 'Qty/Desc', 'Price', 'Category', 'By']`.
- **File System Write:** Uses `expo-file-system/legacy` to write UTF-8 encoded text to:
  `${FileSystem.documentDirectory}ShareExpense_${reportLabel}_${Date.now()}.csv`
- **Sharing:** Dispatches via `Sharing.shareAsync(filename, { mimeType: 'text/csv' })`.

### 4.3 Native Device Storage Export (`pdfService.saveFileToDevice`)
- **Android:** Uses the Android Storage Access Framework (`FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync`). Prompts the user to pick an arbitrary folder on device storage (e.g. Downloads or Documents), creates the file via `createFileAsync`, and writes content (Base64 for PDF, UTF-8 for CSV).
- **iOS:** Hands off file URI to the native iOS share sheet, which includes "Save to Files" natively.

---

## 5. WhatsApp Formatted Text Export

In [src/services/settlementService.ts:L142-L188](file:///d:/App/Antigravity/Share%20Expense/src/services/settlementService.ts#L142-L188), the app formats a human-readable text statement ready for one-tap WhatsApp sharing:

```text
📊 Apartment 4B — Group Pool Settlement Summary
📅 Period: October 2026
━━━━━━━━━━━━━━━━━━━━━
💰 Total Group Deposit: PKR 25,000
🛒 Total Group Spent: PKR 10,500
💵 Remaining Pool Cash: PKR 14,500

Member Payouts / Refunds:
🟢 Alice: Receives PKR 11,750 (Deposit: PKR 10,000 + Spent: PKR 6,000 - Share: PKR 4,250)
🟢 Bob: Receives PKR 9,500
🟢 Charlie: Receives PKR 3,750

_Generated via Share Expense App_
```

Dispatched using React Native's standard `Share.share({ message, title })`.
