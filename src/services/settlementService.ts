import { AppUser, Expense } from '../models/types';
import { computeMemberMonth, getMemberMonthSettled } from '../utils/monthBalance';
import { splitByWeights } from '../utils/math';

export interface SettlementTransaction {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
}

export interface PoolRefundItem {
  userId: string;
  userName: string;
  walletDeposit: number;
  outOfPocketSpent: number;
  calculatedShare: number;
  netPosition: number;
  refundOrPayout: number;
  isReceiving: boolean;
  settledAmount?: number;
  remainingAmount?: number;
  isSettled?: boolean;
}

export interface SettlementSummary {
  totalSpent: number;
  totalWalletDeposits: number;
  remainingWalletPool: number;
  poolRefunds: PoolRefundItem[];
  peerToPeerTransactions: SettlementTransaction[];
  hasDirectTransactions: boolean;
}

export interface DebtParty {
  id: string;
  name: string;
  balance: number;
}

/**
 * Generates an exact peer-to-peer settlement plan clearing debts.
 * Asserts sum(creditors) === sum(debtors). If they differ by even 1 rupee,
 * logs an error and balances to the largest creditor/debtor so the plan always clears to 0.
 */
export function settleDebts(
  creditors: DebtParty[],
  debtors: DebtParty[]
): SettlementTransaction[] {
  const cList = creditors
    .map(c => ({ ...c, balance: Math.round(c.balance) }))
    .filter(c => c.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  const dList = debtors
    .map(d => ({ ...d, balance: Math.round(d.balance) }))
    .filter(d => d.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  let sumCreditors = cList.reduce((acc, c) => acc + c.balance, 0);
  let sumDebtors = dList.reduce((acc, d) => acc + d.balance, 0);

  if (sumCreditors !== sumDebtors) {
    console.error(
      `[settlementService] Assertion failed: sum(creditors) [${sumCreditors}] !== sum(debtors) [${sumDebtors}]. Imbalance of ${Math.abs(sumCreditors - sumDebtors)} rupee(s). Balancing before generating transactions.`
    );
    if (sumCreditors > sumDebtors) {
      let diff = sumCreditors - sumDebtors;
      for (const c of cList) {
        const dec = Math.min(c.balance, diff);
        c.balance -= dec;
        diff -= dec;
        if (diff === 0) break;
      }
    } else {
      let diff = sumDebtors - sumCreditors;
      for (const d of dList) {
        const dec = Math.min(d.balance, diff);
        d.balance -= dec;
        diff -= dec;
        if (diff === 0) break;
      }
    }
  }

  const transactions: SettlementTransaction[] = [];
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < dList.length && cIdx < cList.length) {
    const debtor = dList[dIdx];
    const creditor = cList[cIdx];

    const settleAmount = Math.min(debtor.balance, creditor.balance);

    if (settleAmount > 0) {
      transactions.push({
        fromId: debtor.id,
        fromName: debtor.name,
        toId: creditor.id,
        toName: creditor.name,
        amount: settleAmount,
      });

      debtor.balance -= settleAmount;
      creditor.balance -= settleAmount;
    }

    if (debtor.balance === 0) dIdx++;
    if (creditor.balance === 0) cIdx++;
  }

  return transactions;
}

export const settlementService = {
  calculateSettlement: (params: {
    members: AppUser[];
    memberSpentMap: Record<string, number>;
    shares: Record<string, number>;
    monthKey?: string;
  }): SettlementSummary => {
    const { members, memberSpentMap, shares, monthKey } = params;

    let totalSpent = 0;
    let totalWalletDeposits = 0;

    members.forEach(m => {
      totalSpent += (memberSpentMap[m.id] || 0);
    });

    // Use largest-remainder method so shares sum to exact totalSpent
    const rawWeights = members.map(m => shares[m.id] || 0);
    const exactSharesArray = splitByWeights(totalSpent, rawWeights);
    const exactShares: Record<string, number> = {};
    members.forEach((m, idx) => {
      exactShares[m.id] = exactSharesArray[idx];
    });

    const currentKey = monthKey || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    // 1. Calculate pool refunds & individual positions
    const poolRefunds: PoolRefundItem[] = members.map(m => {
      const spent = memberSpentMap[m.id] || 0;
      const share = exactShares[m.id] ?? (shares[m.id] || 0);
      
      const mm = computeMemberMonth({
        member: m,
        monthKey: currentKey,
        spent,
        share,
      });

      totalWalletDeposits += mm.deposit;

      return {
        userId: m.id,
        userName: m.name,
        walletDeposit: mm.deposit,
        outOfPocketSpent: mm.spent,
        calculatedShare: mm.share,
        netPosition: mm.remaining,
        refundOrPayout: Math.abs(mm.remaining),
        isReceiving: mm.remaining >= 0,
        settledAmount: mm.settled,
        remainingAmount: mm.remaining,
        isSettled: mm.isSettled,
      };
    });

    const remainingWalletPool = Math.max(0, totalWalletDeposits - totalSpent);

    // 2. Calculate direct Peer-to-Peer simplified settlements
    // Net expense balance without wallet pool: (Spent Out of Pocket - Share - Settled)
    const netExpenseBalances: DebtParty[] = members.map(m => {
      const spent = memberSpentMap[m.id] || 0;
      const share = exactShares[m.id] ?? (shares[m.id] || 0);
      const settled = getMemberMonthSettled(m, currentKey);
      return {
        id: m.id,
        name: m.name,
        balance: Math.round(spent - share - settled),
      };
    });

    const debtors = netExpenseBalances
      .filter(b => b.balance < 0)
      .map(b => ({ ...b, balance: Math.abs(b.balance) }));

    const creditors = netExpenseBalances
      .filter(b => b.balance > 0)
      .map(b => ({ ...b }));

    const peerToPeerTransactions = settleDebts(creditors, debtors);

    return {
      totalSpent: Math.round(totalSpent),
      totalWalletDeposits: Math.round(totalWalletDeposits),
      remainingWalletPool: Math.round(remainingWalletPool),
      poolRefunds,
      peerToPeerTransactions,
      hasDirectTransactions: peerToPeerTransactions.length > 0,
    };
  },

  settleDebts,

  formatWhatsAppText: (params: {
    teamName: string;
    currency: string;
    settlement: SettlementSummary;
    mode: 'pool' | 'p2p';
    periodLabel?: string;
  }): string => {
    const { teamName, currency, settlement, mode, periodLabel } = params;
    const formatAmt = (n: number) => `${currency} ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(n)}`;
    const headerPeriod = periodLabel ? `\n📅 *Period:* ${periodLabel}` : '';

    if (mode === 'pool') {
      let text = `📊 *${teamName} — Group Pool Settlement Summary*${headerPeriod}\n`;
      text += `━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `💰 *Total Group Deposit:* ${formatAmt(settlement.totalWalletDeposits)}\n`;
      text += `🛒 *Total Group Spent:* ${formatAmt(settlement.totalSpent)}\n`;
      text += `💵 *Remaining Pool Cash:* ${formatAmt(settlement.remainingWalletPool)}\n\n`;
      text += `*Member Payouts / Refunds:*\n`;

      settlement.poolRefunds.forEach(r => {
        if (r.isSettled) {
          text += `⚪ *${r.userName}:* Settled for this month\n`;
        } else if (r.isReceiving) {
          text += `🟢 *${r.userName}:* Receives ${formatAmt(r.refundOrPayout)} (Deposit: ${formatAmt(r.walletDeposit)} + Spent: ${formatAmt(r.outOfPocketSpent)} - Share: ${formatAmt(r.calculatedShare)})\n`;
        } else {
          text += `🔴 *${r.userName}:* Owes/Pays ${formatAmt(r.refundOrPayout)}\n`;
        }
      });

      text += `\n_Generated via Share Expense App_`;
      return text;
    } else {
      let text = `🤝 *${teamName} — Direct Peer-to-Peer Settlement*${headerPeriod}\n`;
      text += `━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `🛒 *Total Expenses Spent:* ${formatAmt(settlement.totalSpent)}\n\n`;

      if (settlement.peerToPeerTransactions.length === 0) {
        text += `✅ *All expenses are completely balanced! No direct payments required.*\n`;
      } else {
        text += `*Who Pays Whom:*\n`;
        settlement.peerToPeerTransactions.forEach((t, i) => {
          text += `${i + 1}. *${t.fromName}* ➡️ pays *${t.toName}*: *${formatAmt(t.amount)}*\n`;
        });
      }

      text += `\n_Generated via Share Expense App_`;
      return text;
    }
  },
};
