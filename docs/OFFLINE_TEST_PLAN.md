# Offline-First Manual Device Test Plan

This document details the 10 mandatory manual verification scenarios for the offline-first architecture of the **Share Expense** application on real physical Android and iOS devices.

---

### Scenario 1: Basic Create Offline & Automatic Sync
- **Preconditions**: User is logged in to a team.
- **Steps**:
  1. Turn on **Airplane Mode** on the device.
  2. Verify the top banner displays: `Offline - changes are saved on this device`.
  3. Navigate to **Add Expense**, fill in "Office Groceries", Rs 1,500, category "Utility", and tap **Save**.
  4. Note immediate return to dashboard/expenses list without infinite loading spinner.
  5. Close and terminate the app completely (swipe away from App Switcher).
  6. Reopen the app while still in Airplane Mode.
  7. Turn off Airplane Mode (re-enable Wi-Fi or Mobile Data).
- **Expected Outcome**:
  - The expense appears immediately in offline state with a `cloud-offline` indicator icon.
  - Upon reopening in Airplane Mode, the expense remains visible from local SQLite cache.
  - When connection is restored, the banner briefly displays `Syncing 1 change...` followed by `All changes synced`.
  - In Firestore Console, exactly **one** document is created under `expenses/` and **one** under `editHistory/`.

---

### Scenario 2: Adjust Pending & Carry Over Offline
- **Preconditions**: User is an admin viewing User Details for a member.
- **Steps**:
  1. Turn on **Airplane Mode**.
  2. Tap **Adjust Pending** and record a payment of `+PKR 1,000`.
  3. Verify the live remainder updates immediately and reflects the new net balance.
  4. Tap **Carry Over** to carry remaining balance into next month.
  5. Close and reopen the app in Airplane Mode.
  6. Turn off Airplane Mode.
- **Expected Outcome**:
  - Remainder and settlement calculations remain accurate throughout offline restarts.
  - When connectivity returns, `recordSettlement` and `carryForward` execute atomically in one Firestore transaction.
  - The Firestore `users/{uid}` document reflects `monthlySettlements` and `monthlyCarryIn`/`monthlyCarriedOut` increments without overwriting other months.

---

### Scenario 3: Receipt Attachment Offline
- **Preconditions**: Device camera/gallery permissions granted.
- **Steps**:
  1. Turn on **Airplane Mode**.
  2. Go to **Add Expense**, take a photo of a receipt, fill details, and tap **Save**.
  3. Force-close the app and clear OS app cache (not app data).
  4. Reopen the app in Airplane Mode.
  5. Tap the newly created expense to preview the receipt.
  6. Turn off Airplane Mode.
- **Expected Outcome**:
  - The receipt photo is copied immediately to `${FileSystem.documentDirectory}/attachments/` and is not lost when OS temp cache clears.
  - The receipt preview opens and displays properly offline from local disk.
  - Once online, the `uploadReceipt` outbox operation uploads the image to Firebase Storage, updates the Firestore document with the HTTPS download URL, and replaces the local thumbnail indicator with the remote URL.

---

### Scenario 4: Rapid Sequential Edits under Flaky Network
- **Preconditions**: Device connected to a throttled or flaky connection (e.g. 3G simulation or DevTools throttling).
- **Steps**:
  1. Open an existing expense.
  2. Edit price to 200 and save.
  3. Immediately reopen and edit price to 300 and save.
  4. Immediately reopen and edit price to 450 and save.
  5. Allow the sync engine to process the queue.
- **Expected Outcome**:
  - FIFO order per document is preserved.
  - The final Firestore state shows price `450`.
  - Three distinct audit logs are recorded in `editHistory` in sequential order.

---

### Scenario 5: Multi-Device Concurrent Field Updates
- **Preconditions**: Two physical devices logged into the same team.
- **Steps**:
  1. Put Device A and Device B in Airplane Mode.
  2. Device A updates the wallet deposit for `2026-11` (`+5,000`).
  3. Device B records a settlement payment for `2026-11` (`+2,000`).
  4. Bring Device A online first, wait for sync to complete.
  5. Bring Device B online second.
- **Expected Outcome**:
  - Because operations use Firestore atomic `increment()` operations inside field paths (`monthlyWallets.2026-11` and `monthlySettlements.2026-11`), neither change overwrites the other.
  - Both devices converge to identical balances.

---

### Scenario 6: Sign-Out Safety with Pending Writes
- **Preconditions**: App is in Airplane Mode with at least one pending expense created offline.
- **Steps**:
  1. Go to **Settings** and tap **Sign Out**.
- **Expected Outcome**:
  - A modal dialog appears warning: `"You have 1 unsynced change. Signing out will keep them on this device, but other devices will not see them until you sign in here again."`
  - Tapping **Cancel** dismisses the modal and keeps the user logged in with outbox intact.
  - Tapping **Sign Out Anyway** signs out but leaves the outbox rows safely stored in SQLite for the user's next login.

---

### Scenario 7: Cold Start in Airplane Mode
- **Preconditions**: User has previously loaded dashboard at least once. Device is completely offline.
- **Steps**:
  1. Turn on Airplane Mode.
  2. Reboot or cold-launch the application.
- **Expected Outcome**:
  - App opens directly into the Dashboard without hanging on splash or showing infinite spinners.
  - Hydrated profile, members, and expenses are shown from SQLite cache.
  - Top status bar displays `Offline - changes are saved on this device`.

---

### Scenario 8: Process Termination During Active Sync
- **Preconditions**: Device has 5+ pending ops queued offline.
- **Steps**:
  1. Turn off Airplane Mode.
  2. As soon as the banner says `Syncing 5 changes...`, immediately kill the app process (swipe up).
  3. Reopen the app.
- **Expected Outcome**:
  - `syncEngine.init()` detects any operations stuck in `syncing` status and resets them to `pending`.
  - Sync automatically resumes.
  - Idempotency markers in Firestore `syncOps/{opId}` prevent already-committed operations from executing twice.

---

### Scenario 9: Error Recovery & Manual Discard
- **Preconditions**: An operation fails permanently (e.g. invalid document or deleted parent team).
- **Steps**:
  1. Simulate an error or let an invalid operation exceed max retries.
  2. Notice the top banner changes to red: `"1 change needs attention"`.
  3. Tap the banner to open the **Sync & Offline Status** screen.
  4. Inspect the error description and attempt **Retry**.
  5. Tap **Discard**, confirm prompt.
- **Expected Outcome**:
  - The failed item is removed from the outbox.
  - The attention banner clears and returns to normal status.

---

### Scenario 10: Background Sync on App Resume
- **Preconditions**: App is offline with pending operations.
- **Steps**:
  1. Queue 2 expenses while offline.
  2. Minimize the app (send to background).
  3. Turn on Wi-Fi / cellular data.
  4. Wait 15 seconds.
  5. Bring the app back to the foreground.
- **Expected Outcome**:
  - AppState listener detects foreground transition, triggers `NetInfo.fetch()` and `syncEngine.flush()`.
  - Operations sync in background; banner displays `All changes synced`.
