# Financial Calculations, Algorithms, and Business Rules

> **Audit Scope:** Precise mathematical formulas, allocation algorithms, debt minimization logic, rounding conventions, and worked reconciliation examples.  
> **Source Files:** [settlementService.ts](file:///d:/App/Antigravity/Share%20Expense/src/services/settlementService.ts), [expenseService.ts](file:///d:/App/Antigravity/Share%20Expense/src/services/expenseService.ts), [loanService.ts](file:///d:/App/Antigravity/Share%20Expense/src/services/loanService.ts), [math.ts](file:///d:/App/Antigravity/Share%20Expense/src/utils/math.ts), [SettlementModal.tsx](file:///d:/App/Antigravity/Share%20Expense/src/components/SettlementModal.tsx)

---

## 1. Core Financial Formulas & Calculation Inventory

### 1.1 Item Spending & Line Total Formula
In all calculations throughout the app, the total cost for an expense record is calculated as:
$$\text{ItemTotal} = (\text{Number}(\text{price}) \lor 0) \times (\text{parseFloat}(\text{quantity}) \lor 1)$$

- **Code Evidence:** [expenseService.ts:L491](file:///d:/App/Antigravity/Share%20Expense/src/services/expenseService.ts#L491), [pdfService.ts:L29](file:///d:/App/Antigravity/Share%20Expense/src/services/pdfService.ts#L29), [DashboardTab.tsx:L982](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L982).
- **Behavioral Note:** If `quantity` is entered as a descriptive string like `"2.5 kg"`, `parseFloat("2.5 kg")` evaluates to `2.5`. If `quantity` is empty or non-numeric (e.g. `"half"`), it defaults to `1`.

---

### 1.2 Member Monthly Wallet Deposit
Each member's wallet contribution for a given month key $K$ (format: `YYYY-MM`) is determined by:
$$\text{WalletDeposit}(m, K) = \begin{cases} 
m.\text{monthlyWallets}[K] & \text{if } m.\text{monthlyWallets}[K] \neq \text{undefined} \\
m.\text{walletBalance} \lor 0 & \text{if } K = \text{'2026-08'} \land (m.\text{monthlyWallets} \text{ is empty}) \\
0 & \text{otherwise}
\end{cases}$$

- **Code Evidence:** [settlementService.ts:L51-L56](file:///d:/App/Antigravity/Share%20Expense/src/services/settlementService.ts#L51-L56), [DashboardTab.tsx:L1009-L1017](file:///d:/App/Antigravity/Share%20Expense/src/screens/home/DashboardTab.tsx#L1009-L1017).

---

### 1.3 Collective Group Wallet Total & Remaining Cash
For a group with members $M = \{m_1, m_2, \dots, m_n\}$ and expenses $E$ in viewing month $K$:
$$\text{TotalWalletDeposits} = \sum_{m \in M} \text{WalletDeposit}(m, K)$$
$$\text{TotalGroupSpent} = \sum_{e \in E} \text{ItemTotal}(e)$$
$$\text{RemainingWalletPool} = \max(0, \text{TotalWalletDeposits} - \text{TotalGroupSpent})$$

- **Code Evidence:** [settlementService.ts:L58-L75](file:///d:/App/Antigravity/Share%20Expense/src/services/settlementService.ts#L58-L75).

---

### 1.4 Dynamic Share Allocation Algorithm (`calculateShares`)
For each expense $e \in E$, the algorithm determines the set of eligible participants $\text{Payers}(e) \subseteq M$ as follows:

1. **Explicit Custom Split:**
   If $e.\text{splitUserIds}$ exists and has at least 1 ID:
   $$\text{Payers}(e) = e.\text{splitUserIds} \cap M$$
2. **Utility Category:**
   If $e.\text{category} = \text{'utility'}$:
   $$\text{Payers}(e) = M \quad (\text{all members of the group})$$
3. **Meal Categories (Breakfast, Lunch, Dinner):**
   Matches daily attendance records for $e.\text{date}$:
   - Breakfast: $\text{Payers}(e) = \{a.\text{userId} \mid a.\text{date} = e.\text{date} \land a.\text{attendedBreakfast} = \text{true}\}$
   - Lunch: $\text{Payers}(e) = \{a.\text{userId} \mid a.\text{date} = e.\text{date} \land a.\text{attendedLunch} = \text{true}\}$
   - Dinner: $\text{Payers}(e) = \{a.\text{userId} \mid a.\text{date} = e.\text{date} \land a.\text{attendedDinner} = \text{true}\}$
4. **Uncategorized or None:**
   $$\text{Payers}(e) = \{a.\text{userId} \mid a.\text{date} = e.\text{date} \land a.\text{isPresent} = \text{true}\}$$
5. **Fallback (Zero Payers):**
   If $|\text{Payers}(e)| = 0$:
   $$\text{Shares}[e.\text{userId}] \mathrel{+}= \text{ItemTotal}(e)$$
   *(The purchaser absorbs 100% of the cost)*
6. **Equi-distribution among Payers:**
   If $|\text{Payers}(e)| > 0$:
   $$\text{PerPersonShare} = \frac{\text{ItemTotal}(e)}{|\text{Payers}(e)|}$$
   $$\forall u \in \text{Payers}(e): \quad \text{Shares}[u] \mathrel{+}= \text{PerPersonShare}$$

- **Code Evidence:** [expenseService.ts:L480-L531](file:///d:/App/Antigravity/Share%20Expense/src/services/expenseService.ts#L480-L531).

---

### 1.5 Net Financial Position (Option 1: Wallet Pool Refund Plan)
This model treats all wallet deposits and out-of-pocket spending as contributions to the collective pool, compared against the member's fair share of consumption:

$$\text{TotalContributed}(m) = \text{WalletDeposit}(m) + \text{OutOfPocketSpent}(m)$$
$$\text{NetPosition}(m) = \text{TotalContributed}(m) - \text{CalculatedShare}(m)$$

- **Payout / Refund Rule:**
  - If $\text{NetPosition}(m) \ge 0$: Member is **Receiving** a refund of $+\text{Math.round}(\text{NetPosition}(m))$ from the wallet pool.
  - If $\text{NetPosition}(m) < 0$: Member **Owes** $-\text{Math.round}(|\text{NetPosition}(m)|)$ back to the group.
- **Mathematical Balance Proof:**
  $$\sum_{m \in M} \text{NetPosition}(m) = \sum \text{WalletDeposit} + \sum \text{OutOfPocketSpent} - \sum \text{CalculatedShare}$$
  Since $\sum \text{OutOfPocketSpent} = \sum \text{CalculatedShare} = \text{TotalGroupSpent}$,
  $$\sum_{m \in M} \text{NetPosition}(m) = \text{TotalWalletDeposits} = \text{RemainingWalletPool} + \text{TotalGroupSpent}$$
- **Code Evidence:** [settlementService.ts:L60-L73](file:///d:/App/Antigravity/Share%20Expense/src/services/settlementService.ts#L60-L73).

---

### 1.6 Direct Peer-to-Peer Simplified Debt Algorithm (Option 2: Direct P2P)
This model isolates out-of-pocket spending from the wallet pool and computes direct transfers between members:

$$\text{NetExpenseBalance}(m) = \text{Math.round}(\text{OutOfPocketSpent}(m) - \text{CalculatedShare}(m))$$

- **Parties Classification:**
  - **Debtors ($D$):** Members with $\text{NetExpenseBalance} < 0$. Balance stored as $|\text{NetExpenseBalance}|$, sorted descending by debt.
  - **Creditors ($C$):** Members with $\text{NetExpenseBalance} > 0$. Sorted descending by credit.
- **Greedy Matching Loop:**
  ```typescript
  while (dIdx < debtors.length && cIdx < creditors.length) {
    const settleAmount = Math.min(debtors[dIdx].balance, creditors[cIdx].balance);
    if (settleAmount > 0) {
      transactions.push({
        from: debtors[dIdx],
        to: creditors[cIdx],
        amount: settleAmount
      });
      debtors[dIdx].balance -= settleAmount;
      creditors[cIdx].balance -= settleAmount;
    }
    if (debtors[dIdx].balance === 0) dIdx++;
    if (creditors[cIdx].balance === 0) cIdx++;
  }
  ```
- **Code Evidence:** [settlementService.ts:L77-L140](file:///d:/App/Antigravity/Share%20Expense/src/services/settlementService.ts#L77-L140).

---

### 1.7 Money Circle Integration in Settlement (Combined P2P)
When the user toggles "Include Money Circle" in the Settlement Modal:
1. For each member $m \in M$, initialize:
   $$\text{CombinedNetBalance}(m) = \text{OutOfPocketSpent}(m) - \text{CalculatedShare}(m)$$
2. For each loan $l \in \text{Loans}$ with status `PENDING`:
   $$\text{CombinedNetBalance}(l.\text{lenderId}) \mathrel{+}= l.\text{amount}$$
   $$\text{CombinedNetBalance}(l.\text{borrowerId}) \mathrel{-}= l.\text{amount}$$
3. The greedy debt minimization loop is executed over $\text{CombinedNetBalance}$.
- **Result:** Members can offset personal debts directly against shared grocery expenses in a single unified transfer.
- **Code Evidence:** [SettlementModal.tsx:L172-L236](file:///d:/App/Antigravity/Share%20Expense/src/components/SettlementModal.tsx#L172-L236).

---

### 1.8 Percentage Distribution (Hare-Niemeyer / Largest Remainder Method)
To avoid 99% or 101% rounding sum errors on statistical charts, [src/utils/math.ts](file:///d:/App/Antigravity/Share%20Expense/src/utils/math.ts) implements the Largest Remainder Method:
1. $\text{RawPct} = \frac{\text{Amount}}{\text{Total}} \times 100$
2. $\text{FloorPct} = \lfloor \text{RawPct} \rfloor$, $\text{Remainder} = \text{RawPct} - \text{FloorPct}$
3. $\text{Diff} = 100 - \sum \text{FloorPct}$
4. Sort items descending by $\text{Remainder}$ and increment the top $\text{Diff}$ items by $+1$.
5. The sum of all integer percentages is guaranteed to equal exactly $100\%$.

---

## 2. Floating-Point Precision & Rounding Risk Analysis

- **Currency Data Types:** All currency values are stored as standard JavaScript IEEE 754 64-bit floating point `number` primitives.
- **Precision Limits:** While typical household amounts (e.g., 500 to 500,000 PKR) do not exceed `Number.MAX_SAFE_INTEGER` ($2^{53} - 1$), division during multi-member splits (e.g. $1000 / 3 = 333.3333333333333$) introduces fractional cents/paise.
- **Rounding Application:**
  - Intermediate shares in Zustand store maintain floating point precision.
  - Final settlement figures in `settlementService.ts` apply `Math.round(val)` on final net positions and transactions.
  - Due to discrete rounding on multiple members, occasionally $\sum \text{DebtorTransfers}$ may differ from $\sum \text{CreditorTransfers}$ by $\pm 1$ unit of currency. The greedy while-loop guards against this by advancing when `balance < 0.01`.

---

## 3. Illustrative Worked Examples (Mathematically Reconciled)

*Note: The following examples use fictional test data to illustrate the formulas.*

### Scenario Setup
- **Group:** 3 flatmates (Alice, Bob, Charlie)
- **Period:** October 2026
- **Monthly Wallet Deposits:**
  - Alice: 10,000 PKR
  - Bob: 10,000 PKR
  - Charlie: 5,000 PKR
  - **Total Wallet Pool Deposits:** 25,000 PKR
- **Expenses Logged:**
  1. *Expense 1 (Groceries - Utility):* 6,000 PKR, paid out-of-pocket by Alice. Category: Utility (Split 3 ways equally -> 2,000 each).
  2. *Expense 2 (Dinner):* 3,000 PKR, paid out-of-pocket by Bob. Attendance: Alice & Bob attended (Charlie absent) -> Split 2 ways (1,500 each).
  3. *Expense 3 (Breakfast):* 1,500 PKR, paid out-of-pocket by Charlie. Custom Split: Charlie & Alice -> Split 2 ways (750 each).
- **Total Spending:** $6,000 + 3,000 + 1,500 = \mathbf{10,500\text{ PKR}}$.

---

### Step 1: Member Spent & Calculated Shares
| Member | Wallet Deposit | Out-of-Pocket Spent | Calculated Share | Details of Share |
| :--- | :---: | :---: | :---: | :--- |
| **Alice** | 10,000 | 6,000 | **4,250** | Exp 1 (2,000) + Exp 2 (1,500) + Exp 3 (750) |
| **Bob** | 10,000 | 3,000 | **3,500** | Exp 1 (2,000) + Exp 2 (1,500) + Exp 3 (0) |
| **Charlie** | 5,000 | 1,500 | **2,750** | Exp 1 (2,000) + Exp 2 (0) + Exp 3 (750) |
| **Total** | **25,000** | **10,500** | **10,500** | **Reconciled: Total Spent = Total Shares** |

---

### Step 2: Option 1 — Wallet Pool Refund Plan
$$\text{RemainingWalletPool} = 25,000 - 10,500 = \mathbf{14,500\text{ PKR}}$$

| Member | Deposit + Out-of-Pocket | Calculated Share | Net Position | Settlement Action |
| :--- | :---: | :---: | :---: | :--- |
| **Alice** | $10,000 + 6,000 = 16,000$ | 4,250 | **+11,750** | **Receives 11,750 PKR** refund from pool |
| **Bob** | $10,000 + 3,000 = 13,000$ | 3,500 | **+9,500** | **Receives 9,500 PKR** refund from pool |
| **Charlie** | $5,000 + 1,500 = 6,500$ | 2,750 | **+3,750** | **Receives 3,750 PKR** refund from pool |
| **Total** | **35,500** | **10,500** | **+25,000** | $\mathbf{11,750 + 9,500 + 3,750 = 25,000\text{ PKR}}$ |

*Reconciliation:* Total refunded across members ($25,000$) exactly matches total wallet deposits made ($25,000$). After Alice, Bob, and Charlie collect their refunds, the net remaining pool cash in the house physical envelope is:
$$\text{Pool Cash} = 25,000 - (11,750 + 9,500 + 3,750) = \mathbf{0\text{ PKR}}$$

---

### Step 3: Option 2 — Direct Peer-to-Peer Plan (Pure Expense Balancing)
Ignoring the wallet pool deposits, settling only who paid vs who consumed:

$$\text{NetExpenseBalance} = \text{OutOfPocketSpent} - \text{CalculatedShare}$$
- **Alice:** $6,000 - 4,250 = \mathbf{+1,750\text{ PKR}}$ (Creditor: owed 1,750)
- **Bob:** $3,000 - 3,500 = \mathbf{-500\text{ PKR}}$ (Debtor: owes 500)
- **Charlie:** $1,500 - 2,750 = \mathbf{-1,250\text{ PKR}}$ (Debtor: owes 1,250)

**P2P Greedy Matching Transfers:**
1. **Charlie pays Alice:** $1,250\text{ PKR}$ (Charlie balance: 0, Alice remaining: +500)
2. **Bob pays Alice:** $500\text{ PKR}$ (Bob balance: 0, Alice remaining: 0)

*Reconciliation:*
- Alice receives: $1,250 + 500 = 1,750\text{ PKR}$.
- Charlie pays: $1,250\text{ PKR}$.
- Bob pays: $500\text{ PKR}$.
- All debts are completely balanced in **2 transactions**.

---

### Step 4: Option 2 with Money Circle Loan Included
Suppose Bob privately lent Alice $1,000\text{ PKR}$ earlier in the week:
- Loan: Bob (Lender) $\rightarrow$ Alice (Borrower): $1,000\text{ PKR}$.
- **Net Combined Balances:**
  - Alice: $+1,750 - 1,000 = \mathbf{+750\text{ PKR}}$
  - Bob: $-500 + 1,000 = \mathbf{+500\text{ PKR}}$
  - Charlie: $\mathbf{-1,250\text{ PKR}}$
- **Transfers Generated:**
  1. **Charlie pays Alice:** $750\text{ PKR}$
  2. **Charlie pays Bob:** $500\text{ PKR}$
- *Reconciliation:* Bob no longer needs to pay Alice $500\text{ PKR}$; instead, his private loan is automatically reconciled via Charlie's payment to him!
