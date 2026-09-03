import { AppUser, Expense } from '../models/types';

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
}

export interface SettlementSummary {
  totalSpent: number;
  totalWalletDeposits: number;
  remainingWalletPool: number;
  poolRefunds: PoolRefundItem[];
  peerToPeerTransactions: SettlementTransaction[];
  hasDirectTransactions: boolean;
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

    const currentKey = monthKey || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    // 1. Calculate pool refunds & individual positions
    const poolRefunds: PoolRefundItem[] = members.map(m => {
      const spent = memberSpentMap[m.id] || 0;
      const share = shares[m.id] || 0;
      
      let deposit = 0;
      if (m?.monthlyWallets && m.monthlyWallets[currentKey] !== undefined) {
        deposit = m.monthlyWallets[currentKey];
      } else if (currentKey === '2026-08' && (!m?.monthlyWallets || Object.keys(m.monthlyWallets).length === 0)) {
        deposit = m.walletBalance || 0;
      }

      totalSpent += spent;
      totalWalletDeposits += deposit;

      // Net Balance = (Wallet Deposit + Out of Pocket) - Share
      const netPosition = (deposit + spent) - share;

      return {
        userId: m.id,
        userName: m.name,
        walletDeposit: deposit,
        outOfPocketSpent: spent,
        calculatedShare: share,
        netPosition: Math.round(netPosition),
        refundOrPayout: Math.round(Math.abs(netPosition)),
        isReceiving: netPosition >= 0,
      };
    });

    const remainingWalletPool = Math.max(0, totalWalletDeposits - totalSpent);

    // 2. Calculate direct Peer-to-Peer simplified settlements (Splitwise algorithm on net expense balance)
    // Pure expense balance without wallet pool: (Spent Out of Pocket - Share)
    interface BalanceEntry {
      id: string;
      name: string;
      balance: number; // positive = paid more than share (needs to receive), negative = paid less (needs to pay)
    }

    const netExpenseBalances: BalanceEntry[] = members.map(m => {
      const spent = memberSpentMap[m.id] || 0;
      const share = shares[m.id] || 0;
      return {
        id: m.id,
        name: m.name,
        balance: Math.round(spent - share),
      };
    });

    const debtors = netExpenseBalances
      .filter(b => b.balance < 0)
      .map(b => ({ ...b, balance: Math.abs(b.balance) }))
      .sort((a, b) => b.balance - a.balance);

    const creditors = netExpenseBalances
      .filter(b => b.balance > 0)
      .map(b => ({ ...b }))
      .sort((a, b) => b.balance - a.balance);

    const peerToPeerTransactions: SettlementTransaction[] = [];
    let dIdx = 0;
    let cIdx = 0;

    while (dIdx < debtors.length && cIdx < creditors.length) {
      const debtor = debtors[dIdx];
      const creditor = creditors[cIdx];

      const settleAmount = Math.min(debtor.balance, creditor.balance);

      if (settleAmount > 0) {
        peerToPeerTransactions.push({
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

    return {
      totalSpent: Math.round(totalSpent),
      totalWalletDeposits: Math.round(totalWalletDeposits),
      remainingWalletPool: Math.round(remainingWalletPool),
      poolRefunds,
      peerToPeerTransactions,
      hasDirectTransactions: peerToPeerTransactions.length > 0,
    };
  },

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
        if (r.isReceiving) {
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
