# Share Expense

A production-grade, offline-first group expense sharing, private money circle, and household budget management app built with React Native (Expo) and Firebase. Currency: PKR (whole rupees).

---

## 1. Quick Start & Setup

### Prerequisites
- **Node.js**: LTS (v20+ recommended)
- **Package Manager**: `npm`
- **Java JDK**: OpenJDK 17 (required for Android builds and Firebase Local Emulator)
- **Firebase CLI**: `npm install -g firebase-tools`

### Installation
```bash
# Clone the repository
git clone <repo-url>
cd "Share Expense"

# Install project dependencies
npm install

# Setup environment variables from template
cp .env.example .env
```

### Running the App
```bash
# Start the Expo development server
npm run start

# Launch on Android device / emulator
npm run android

# Launch on iOS simulator
npm run ios
```

---

## 2. Architecture Overview

- **Framework**: React Native 0.86 + Expo SDK 57 + TypeScript (Strict Mode with `noImplicitAny`).
- **Backend**: Client-only Firebase JS SDK 12 (Authentication, Cloud Firestore, Firebase Storage).
- **Offline-First Storage**: Native SQLite (`expo-sqlite`) for local persistence:
  - `cache` table: Scoped snapshots of profiles, teams, expenses, attendance, and member ledgers.
  - `outbox` table: Monotonic queue of pending mutations and media uploads with exponential backoff.
- **State Management**: Zustand (`src/store/useStore.ts`) with reactive optimistic overlays combining server snapshots with in-flight outbox operations.
- **Navigation**: React Navigation (Native Stack + Bottom Tabs).

---

## 3. Financial Data Model

Each member's position is calculated on a per-month basis (`YYYY-MM`) using atomic ledger maps on the `users` document:

| Ledger Field | Type | Description |
|---|---|---|
| `monthlyWallets` | `Record<string, number>` | Deposit advance contributed by the member for the month. |
| `monthlyCarryIn` | `Record<string, number>` | Balance carried in from the previous month. |
| `monthlyCarriedOut`| `Record<string, number>` | Balance carried forward into the next month. |
| `monthlySettlements`| `Record<string, number>` | Payments cleared: positive = paid out to member; negative = paid by member. |

### Balance Calculation Formula
```
Net = round((Deposit + CarryIn + Spent) - FairShare)
Remaining = Net - Settled - CarriedOut
isSettled = (Remaining === 0) && hadActivity
```
- **Positive Net (+)**: Member is owed money (creditor).
- **Negative Net (-)**: Member owes money (debtor).
- **Settlement Payments**: Recorded by admin as signed adjustments with `increment(delta)`, preserving wallet history.

### Debt Settlement Algorithm (`settleDebts`)
- Solves multilateral debts using the **Largest Remainder Method (Hamilton-Hare)**.
- Automatically rebalances 1-rupee rounding differences to guarantee $\sum(\text{creditors}) \equiv \sum(\text{debtors})$ before generating the optimal minimal transaction plan.

---

## 4. Offline-First Architecture

### How It Works
1. **Reads**: The app hydrates from local SQLite cache before listeners connect. If the device is offline or the server is slow (>8s), the cached snapshot is used instantly without hanging spinners.
2. **Writes**: Screen actions never write directly to Firestore. Instead, mutations are enqueued into the SQLite `outbox` table and an optimistic overlay instantly updates the UI.
3. **Sync Engine**:
   - Triggers automatically when connectivity is restored, when the app enters the foreground, or immediately after an enqueue if online.
   - **Idempotency**: Every operation is tagged with an `opId` written to `syncOps/{opId}` within a Firestore transaction. Duplicate executions from dropped ACKs return safely without re-applying writes.
   - **Per-Document FIFO Blocking**: If an operation on Document A fails, subsequent operations on Document A wait, while independent operations on Document B proceed in parallel.
   - **Backoff Schedule**: Transient failures retry at `2s -> 5s -> 15s -> 60s -> 300s` (max 5 retries before entering `failed` status).
4. **Attachments**:
   - Camera and gallery photos are copied immediately to `${FileSystem.documentDirectory}/attachments/` upon capture.
   - UI displays `localReceiptUri || receiptImageUrl`. Uploads run in the background via `uploadReceipt` outbox ops.

### Online-Only Actions
Actions that require real-time backend validation are guarded with `useNetworkStore.getState().isOnline`:
- Sign-in and account registration.
- Creating or joining teams.
- Adding members by email.
- Changing passwords or deleting accounts.
- Attempting these offline immediately displays `"This action needs an internet connection"` without corrupting the outbox.

---

## 5. Security & Access Rules

- **Firestore Rules (`firestore.rules`)**:
  - `personal_loans`: Strictly private between lender and borrower (`request.auth.uid in [resource.data.lenderId, resource.data.borrowerId]`). Invisible to other team members.
  - `expenses`: Read/create restricted to verified team members; updates/deletions restricted to author or team admin.
  - `editHistory`: Append-only audit trail (`allow update, delete: if false`).
  - `syncOps`: Immutable idempotency markers (`allow update, delete: if false`).
- **Storage Rules (`storage.rules`)**:
  - Enforces MIME image validation and 10MB size limit on receipts and avatars.

---

## 6. Testing

```bash
# Run the full automated Vitest test suite (84+ tests)
npm test

# Run tests in watch mode
npm run test:watch

# Run Firestore Security Rules against local emulator
npm run test:rules
```

Test suites include:
- Pure math & largest-remainder rounding (`src/utils/math.test.ts`).
- Settlement & month balance logic (`src/utils/monthBalance.test.ts`).
- Money Circle netting logic (`src/services/loanService.test.ts`).
- SQLite storage & serialization (`src/offline/localDb.test.ts`, `src/offline/serialize.test.ts`).
- Cache repo & offline reads (`src/offline/cacheRepo.test.ts`).
- Outbox & Sync engine per-doc blocking (`src/offline/syncEngine.test.ts`).
- **Fault-Injection Property Test**: 200 random network drop schedules (`src/offline/faultInjection.test.ts`).
- PII redaction and error logging (`src/utils/logger.test.ts`).

---

## 7. Human-Action Runbook

The following actions require explicit human execution with proper production permissions:

### Step 2: Audit Stub-Password Accounts
Run the migration script to detect users created under legacy Google Auth stubs who need password resets:
```bash
# Dry run mode (read-only audit):
node scripts/list-stub-password-accounts.js /path/to/serviceAccountKey.json

# Apply mode (revokes refresh tokens and generates reset links):
node scripts/list-stub-password-accounts.js /path/to/serviceAccountKey.json --apply
```

### Step 3: Git History Purge & Keystore Rotation
Because previous release keystores were tracked in history, purge the git history and rotate upload credentials:
```bash
# Purge historical commits from repository:
git filter-repo --invert-paths --path android/app/release.keystore --path app-release.aab
git push origin --force --all

# Google Play Console:
# Request an Upload Key Reset in Play Console: Setup > App integrity > Request upload key reset.
# Generate a new upload key and store in password manager.
```

### Step 8: Migrate Legacy August 2026 Wallets
To permanently backfill users from the legacy wallet schema:
```bash
# Dry run:
node scripts/migrate-legacy-wallets.js /path/to/serviceAccountKey.json

# Apply:
node scripts/migrate-legacy-wallets.js /path/to/serviceAccountKey.json --apply
```

### Step 15: Deploy Security Rules
Deploy the hardened Firestore and Storage security rules:
```bash
firebase deploy --only firestore:rules,storage
```

---

## 8. Release Signing

### EAS Build (Recommended)
When building through EAS (`eas build --platform android`), keystores and credentials are managed securely in the cloud.

### Local Release Builds
Configure signing variables in `~/.gradle/gradle.properties`:
```properties
RELEASE_STORE_FILE=/path/to/upload-keystore.keystore
RELEASE_KEY_ALIAS=my-key-alias
RELEASE_STORE_PASSWORD=my-store-password
RELEASE_KEY_PASSWORD=my-key-password
```
If these properties are missing, local release builds will fail with a clear configuration message. Debug builds continue using `android/app/debug.keystore`.
