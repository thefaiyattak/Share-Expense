import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Share,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { getThemeColors } from '../utils/theme';
import { settlementService, SettlementSummary } from '../services/settlementService';
import { expenseService } from '../services/expenseService';
import { Expense, AppUser, PersonalLoan } from '../models/types';
import MonthPickerModal from './MonthPickerModal';
import AppDatePickerModal from './AppDatePickerModal';
import { loanService } from '../services/loanService';

interface SettlementModalProps {
  visible: boolean;
  onClose: () => void;
  teamName: string;
  currency: string;
  settlement?: SettlementSummary;
  modalBottomPadding?: number;
  initialMonthDate?: Date;
}

type PeriodType = 'month' | 'custom' | 'all';

export default function SettlementModal({
  visible,
  onClose,
  teamName,
  currency,
  modalBottomPadding = 20,
  initialMonthDate,
}: SettlementModalProps) {
  const { darkMode, expenses, members, currentAppUser } = useStore();
  const colors = getThemeColors(darkMode);
  const styles = getStyles(colors, darkMode);

  const [activeTab, setActiveTab] = useState<'pool' | 'p2p'>('pool');
  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [includeLoans, setIncludeLoans] = useState<boolean>(true);
  const [loans, setLoans] = useState<PersonalLoan[]>([]);

  // Load team loans involving current user
  React.useEffect(() => {
    if (visible && currentAppUser?.teamId && currentAppUser?.id) {
      loanService.getLoans(currentAppUser.teamId, currentAppUser.id)
        .then(setLoans)
        .catch(() => {});
    }
  }, [visible, currentAppUser?.teamId, currentAppUser?.id]);

  // Month selection state (defaults to initialMonthDate or current month)
  const [selectedMonthDate, setSelectedMonthDate] = useState<Date>(() => {
    if (initialMonthDate) return initialMonthDate;
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);

  React.useEffect(() => {
    if (visible && initialMonthDate) {
      setSelectedMonthDate(initialMonthDate);
    }
  }, [visible, initialMonthDate]);

  // Custom date range state
  const [customStartDate, setCustomStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [customEndDate, setCustomEndDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  });
  const [datePickerMode, setDatePickerMode] = useState<'start' | 'end' | null>(null);

  // User join date constraint (optional floor)
  const userJoinDate = useMemo(() => {
    if (!currentAppUser?.createdAt) return new Date(0);
    const d = typeof (currentAppUser.createdAt as any)?.toDate === 'function'
      ? (currentAppUser.createdAt as any).toDate()
      : new Date(currentAppUser.createdAt);
    return isNaN(d.getTime()) ? new Date(0) : d;
  }, [currentAppUser?.createdAt]);

  const minAvailableDate = useMemo(() => {
    const d = new Date(userJoinDate);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, [userJoinDate]);

  // Date range label
  const periodLabel = useMemo(() => {
    if (periodType === 'month') {
      return selectedMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else if (periodType === 'custom') {
      const startStr = customStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const endStr = customEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `${startStr} – ${endStr}`;
    }
    return 'All-Time';
  }, [periodType, selectedMonthDate, customStartDate, customEndDate]);

  // Filter expenses based on selected period
  const filteredExpenses = useMemo(() => {
    let start: Date;
    let end: Date;

    if (periodType === 'month') {
      start = new Date(selectedMonthDate.getFullYear(), selectedMonthDate.getMonth(), 1, 0, 0, 0);
      end = new Date(selectedMonthDate.getFullYear(), selectedMonthDate.getMonth() + 1, 0, 23, 59, 59);
    } else if (periodType === 'custom') {
      start = new Date(customStartDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(customEndDate);
      end.setHours(23, 59, 59, 999);
    } else {
      return expenses;
    }

    return expenses.filter(e => {
      const d = e.date instanceof Date ? e.date : new Date(e.date);
      return d >= start && d <= end;
    });
  }, [expenses, periodType, selectedMonthDate, customStartDate, customEndDate]);

  // Calculate settlement dynamically based on filtered expenses
  const settlement = useMemo(() => {
    const memberMap: Record<string, number> = {};
    members.forEach(m => { memberMap[m.id] = 0; });

    filteredExpenses.forEach(e => {
      if (memberMap[e.userId] !== undefined) {
        const p = Number(e.price) || 0;
        const q = parseFloat(e.quantity) || 1;
        memberMap[e.userId] += (p * q);
      }
    });

    const memberIds = members.map(m => m.id);
    const shares = memberIds.length > 0
      ? expenseService.calculateShares({
          expenses: filteredExpenses,
          attendance: [],
          allIds: memberIds,
        })
      : {};

    const monthKey = periodType === 'month'
      ? `${selectedMonthDate.getFullYear()}-${String(selectedMonthDate.getMonth() + 1).padStart(2, '0')}`
      : undefined;

    return settlementService.calculateSettlement({
      members,
      memberSpentMap: memberMap,
      shares,
      monthKey,
    });
  }, [members, filteredExpenses, periodType, selectedMonthDate]);

  // Combined P2P transactions factoring in Personal Loans if enabled
  const combinedP2PTransactions = useMemo(() => {
    if (!includeLoans || loans.length === 0) {
      return settlement.peerToPeerTransactions;
    }

    // Calculate net balances across all members (Expense balance + Loan balance)
    // Positive balance = member is owed money (creditor)
    // Negative balance = member owes money (debtor)
    const netBalances: Record<string, number> = {};
    members.forEach(m => {
      netBalances[m.id] = 0;
    });

    // 1. Add pure expense balance (outOfPocketSpent - calculatedShare)
    settlement.poolRefunds.forEach(item => {
      netBalances[item.userId] = (netBalances[item.userId] || 0) + (item.outOfPocketSpent - item.calculatedShare);
    });

    // 2. Add personal loans balance
    loans.forEach(loan => {
      if (loan.status === 'SETTLED') return;
      // Lender is owed money (+), Borrower owes money (-)
      netBalances[loan.lenderId] = (netBalances[loan.lenderId] || 0) + loan.amount;
      netBalances[loan.borrowerId] = (netBalances[loan.borrowerId] || 0) - loan.amount;
    });

    // 3. Resolve minimal transfers using greedy debtor/creditor algorithm
    const debtors = Object.entries(netBalances)
      .filter(([_, bal]) => bal < -0.01)
      .map(([id, bal]) => ({ id, name: members.find(m => m.id === id)?.name || 'Member', balance: Math.abs(bal) }))
      .sort((a, b) => b.balance - a.balance);

    const creditors = Object.entries(netBalances)
      .filter(([_, bal]) => bal > 0.01)
      .map(([id, bal]) => ({ id, name: members.find(m => m.id === id)?.name || 'Member', balance: bal }))
      .sort((a, b) => b.balance - a.balance);

    const result = [];
    let dIdx = 0;
    let cIdx = 0;

    while (dIdx < debtors.length && cIdx < creditors.length) {
      const debtor = debtors[dIdx];
      const creditor = creditors[cIdx];
      const settleAmount = Math.min(debtor.balance, creditor.balance);

      if (settleAmount > 0) {
        result.push({
          fromId: debtor.id,
          fromName: debtor.name,
          toId: creditor.id,
          toName: creditor.name,
          amount: Math.round(settleAmount),
        });

        debtor.balance -= settleAmount;
        creditor.balance -= settleAmount;
      }

      if (debtor.balance < 0.01) dIdx++;
      if (creditor.balance < 0.01) cIdx++;
    }

    return result;
  }, [includeLoans, loans, members, settlement]);

  const formatAmt = (val: number) => {
    return `${currency} ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(val)}`;
  };

  const handleShareSummary = () => {
    const message = settlementService.formatWhatsAppText({
      teamName: teamName || 'Group',
      currency,
      settlement,
      mode: activeTab,
      periodLabel,
    });
    Share.share({
      message,
      title: `${teamName} Settlement Plan (${periodLabel})`,
    });
  };

  const handleCustomDateConfirm = (selected: Date) => {
    if (datePickerMode === 'start') {
      const d = new Date(selected);
      d.setHours(0, 0, 0, 0);
      setCustomStartDate(d);
      if (d > customEndDate) {
        const nextEnd = new Date(d);
        nextEnd.setHours(23, 59, 59, 999);
        setCustomEndDate(nextEnd);
      }
    } else if (datePickerMode === 'end') {
      const d = new Date(selected);
      d.setHours(23, 59, 59, 999);
      setCustomEndDate(d);
      if (d < customStartDate) {
        const nextStart = new Date(d);
        nextStart.setHours(0, 0, 0, 0);
        setCustomStartDate(nextStart);
      }
    }
    setDatePickerMode(null);
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { height: '94%', paddingBottom: modalBottomPadding }]}>
          {/* Modal Handle Bar */}
          <View style={styles.handleBar} />

          {/* Modal Header */}
          <View style={styles.modalHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View style={styles.headerIconBadge}>
                <Ionicons name="git-network-outline" size={20} color="#FFFFFF" />
              </View>
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={styles.modalTitle}>Settlement Plan</Text>
                <Text style={styles.modalSubTitle} numberOfLines={1}>
                  {teamName || 'Group'} · {periodLabel}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Clean Segment Bar: Month & Period Selector */}
          <View style={styles.periodCompactBar}>
            <TouchableOpacity
              style={styles.periodPillModern}
              onPress={() => setPeriodType(periodType === 'month' ? 'all' : 'month')}
              activeOpacity={0.8}
            >
              <Ionicons name="calendar-outline" size={13} color={colors.primary} style={{ marginRight: 4 }} />
              <Text style={styles.periodPillModernText}>
                {periodType === 'month' ? selectedMonthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'All-Time'}
              </Text>
            </TouchableOpacity>

            {periodType === 'month' && (
              <TouchableOpacity
                style={styles.changeMonthChip}
                onPress={() => setMonthPickerVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.changeMonthChipText}>Change Month</Text>
                <Ionicons name="chevron-down" size={12} color={colors.primary} />
              </TouchableOpacity>
            )}

            <View style={{ flex: 1 }} />

            <View style={styles.auditBadge}>
              <Ionicons name="receipt-outline" size={12} color={colors.textSecondary} style={{ marginRight: 4 }} />
              <Text style={styles.auditBadgeText}>{filteredExpenses.length} expenses</Text>
            </View>
          </View>

          {/* Mode Switcher: Pool vs Direct P2P */}
          <View style={styles.modeSwitcherContainer}>
            <TouchableOpacity
              style={[styles.modeTab, activeTab === 'pool' && styles.modeTabActive]}
              onPress={() => setActiveTab('pool')}
              activeOpacity={0.85}
            >
              <Ionicons
                name="wallet"
                size={14}
                color={activeTab === 'pool' ? colors.primary : colors.textSecondary}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.modeTabText, activeTab === 'pool' && styles.modeTabTextActive]}>
                Wallet Pool Refund
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeTab, activeTab === 'p2p' && styles.modeTabActive]}
              onPress={() => setActiveTab('p2p')}
              activeOpacity={0.85}
            >
              <Ionicons
                name="swap-horizontal"
                size={15}
                color={activeTab === 'p2p' ? colors.primary : colors.textSecondary}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.modeTabText, activeTab === 'p2p' && styles.modeTabTextActive]}>
                Direct Peer-to-Peer
              </Text>
            </TouchableOpacity>
          </View>

          {/* Scrollable Body */}
          <ScrollView
            style={{ width: '100%', flex: 1 }}
            contentContainerStyle={{ paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
          >
            {activeTab === 'pool' ? (
              /* TAB 1: WALLET POOL REFUND */
              <View style={{ width: '100%', paddingTop: 4 }}>
                {/* Clean, Non-congested Pool Summary Card */}
                <View style={styles.spaciousHeroCard}>
                  {/* Top Stats: Total Collected vs Total Spent */}
                  <View style={styles.heroRowStats}>
                    <View style={styles.heroStatItem}>
                      <View style={styles.statLabelBadge}>
                        <Ionicons name="arrow-down" size={11} color={colors.financial.walletDeposit} />
                        <Text style={styles.statLabelBadgeText}>Collected Pool</Text>
                      </View>
                      <Text style={[styles.heroStatNumber, { color: colors.financial.walletDeposit }]}>
                        {formatAmt(settlement.totalWalletDeposits)}
                      </Text>
                    </View>

                    <View style={styles.heroStatItemRight}>
                      <View style={styles.statLabelBadgeRight}>
                        <Ionicons name="arrow-up" size={11} color={colors.financial.spent} />
                        <Text style={styles.statLabelBadgeTextRight}>Group Spent</Text>
                      </View>
                      <Text style={[styles.heroStatNumberRight, { color: colors.financial.spent }]}>
                        {formatAmt(settlement.totalSpent)}
                      </Text>
                    </View>
                  </View>

                  {/* Divider */}
                  <View style={styles.heroCardDivider} />

                  {/* Remaining Cash Row */}
                  <View style={styles.heroRemainingRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={styles.cashGlowDot} />
                      <Text style={styles.heroRemainingTitle}>Remaining in Cash Pool</Text>
                    </View>
                    <Text style={styles.heroRemainingVal}>
                      {formatAmt(settlement.remainingWalletPool)}
                    </Text>
                  </View>
                </View>

                {/* Section Header */}
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Settlement & Refund Details</Text>
                  <Text style={styles.sectionMemberCount}>{settlement.poolRefunds.length} members</Text>
                </View>

                {/* Member Payout Cards - Spacious & Elegant */}
                {settlement.poolRefunds.map((item, idx) => {
                  const isPositive = item.isReceiving;
                  const statusBg = isPositive ? colors.financial.walletDepositLight : colors.financial.deficitLight;
                  const statusColor = isPositive ? colors.financial.walletDeposit : colors.financial.deficit;
                  const initials = item.userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

                  return (
                    <View key={item.userId || idx} style={styles.spaciousMemberCard}>
                      {/* Card Header: Avatar, Name, and Status Badge */}
                      <View style={styles.memberCardHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                          <View style={[styles.memberInitialsCircle, { backgroundColor: colors.primary + '18' }]}>
                            <Text style={[styles.memberInitialsText, { color: colors.primary }]}>{initials}</Text>
                          </View>
                          <View style={{ marginLeft: 12, flex: 1 }}>
                            <Text style={styles.memberName} numberOfLines={1}>{item.userName}</Text>
                            <Text style={styles.memberNetStatusSub}>
                              {isPositive ? 'Eligible for refund' : 'Payment required to pool'}
                            </Text>
                          </View>
                        </View>

                        {/* Large, clear Status Badge */}
                        <View style={[styles.spaciousStatusBadge, { backgroundColor: statusBg }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Ionicons name={isPositive ? "arrow-down-circle" : "arrow-up-circle"} size={13} color={statusColor} />
                            <Text style={[styles.spaciousStatusAction, { color: statusColor }]}>
                              {isPositive ? 'RECEIVES' : 'OWES'}
                            </Text>
                          </View>
                          <Text style={[styles.spaciousStatusAmt, { color: statusColor }]}>
                            {isPositive ? '+' : '−'} {formatAmt(item.refundOrPayout)}
                          </Text>
                        </View>
                      </View>

                      {/* 3-Column Financial Breakdown Table */}
                      <View style={styles.metricsTripleRow}>
                        <View style={styles.metricColumn}>
                          <Text style={styles.metricColumnLabel}>Deposited</Text>
                          <Text style={styles.metricColumnValue}>{formatAmt(item.walletDeposit)}</Text>
                        </View>
                        <View style={styles.metricColumnDivider} />
                        <View style={styles.metricColumn}>
                          <Text style={styles.metricColumnLabel}>Paid Extra</Text>
                          <Text style={styles.metricColumnValue}>{formatAmt(item.outOfPocketSpent)}</Text>
                        </View>
                        <View style={styles.metricColumnDivider} />
                        <View style={styles.metricColumn}>
                          <Text style={styles.metricColumnLabel}>Fair Share</Text>
                          <Text style={[styles.metricColumnValue, { color: colors.financial.calculatedShare }]}>
                            {formatAmt(item.calculatedShare)}
                          </Text>
                        </View>
                      </View>

                      {/* Calculation Formula Strip */}
                      <View style={styles.smartFormulaBar}>
                        <Ionicons name="calculator-outline" size={13} color={colors.textTertiary} style={{ marginRight: 6 }} />
                        <Text style={styles.smartFormulaText}>
                          ({formatAmt(item.walletDeposit + item.outOfPocketSpent)} total paid) − {formatAmt(item.calculatedShare)} = <Text style={{ fontWeight: '800', color: statusColor }}>{isPositive ? '+' : '−'}{formatAmt(item.refundOrPayout)}</Text>
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              /* TAB 2: DIRECT PEER-TO-PEER SETTLEMENT */
              <View style={{ width: '100%', paddingTop: 4 }}>

                {/* Spending summary strip with Loan toggle */}
                <View style={styles.p2pOverviewCard}>
                  <View>
                    <Text style={styles.p2pOverviewLabel}>Total Group Spending</Text>
                    <Text style={styles.p2pOverviewAmount}>
                      {formatAmt(settlement.totalSpent)}
                    </Text>
                  </View>
                  <View style={styles.p2pTransactionBadge}>
                    <Ionicons name="checkmark-done" size={14} color={colors.primary} style={{ marginRight: 4 }} />
                    <Text style={styles.p2pTransactionBadgeText}>
                      {combinedP2PTransactions.length} Payment{combinedP2PTransactions.length === 1 ? '' : 's'} Needed
                    </Text>
                  </View>
                </View>

                {/* Personal Loans Toggle Bar */}
                {loans.length > 0 && (
                  <View style={styles.loanToggleStrip}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <View style={[styles.loanToggleBadge, { backgroundColor: includeLoans ? colors.financial.walletDepositLight : colors.inputBg }]}>
                        <Ionicons name="swap-horizontal" size={14} color={includeLoans ? colors.financial.walletDeposit : colors.textSecondary} />
                      </View>
                      <View style={{ marginLeft: 10, flex: 1 }}>
                        <Text style={styles.loanToggleTitle}>Include Money Circle</Text>
                        <Text style={styles.loanToggleSub}>
                          {includeLoans ? `${loans.filter(l => l.status !== 'SETTLED').length} active circle entry(s) merged into payments` : 'Showing pure expense balance'}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.loanSwitchPill, includeLoans && styles.loanSwitchPillActive]}
                      onPress={() => setIncludeLoans(!includeLoans)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.loanSwitchPillText, includeLoans && styles.loanSwitchPillTextActive]}>
                        {includeLoans ? 'ON' : 'OFF'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Transactions List */}
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Optimized Settle Transfers</Text>
                </View>

                {combinedP2PTransactions.length === 0 ? (
                  <View style={styles.emptySettledState}>
                    <View style={styles.emptyIconCircle}>
                      <Ionicons name="checkmark-circle" size={40} color={colors.primary} />
                    </View>
                    <Text style={styles.emptySettledTitle}>Fully Balanced!</Text>
                    <Text style={styles.emptySettledDesc}>
                      Zero peer-to-peer transfers are required for {periodLabel}. Everyone is settled.
                    </Text>
                  </View>
                ) : (
                  combinedP2PTransactions.map((tx, idx) => (
                    <View key={idx} style={styles.transferCard}>
                      <View style={styles.transferCardInner}>
                        {/* Payer */}
                        <View style={styles.partyCol}>
                          <View style={[styles.partyAvatar, { backgroundColor: '#FFEBEE' }]}>
                            <Text style={[styles.partyAvatarText, { color: '#D32F2F' }]}>
                              {tx.fromName.substring(0, 2).toUpperCase()}
                            </Text>
                          </View>
                          <Text style={styles.partyName} numberOfLines={1}>{tx.fromName}</Text>
                          <View style={styles.paysBadge}>
                            <Text style={styles.paysBadgeText}>PAYS</Text>
                          </View>
                        </View>

                        {/* Amount & Arrow */}
                        <View style={styles.transferCenterCol}>
                          <Text style={styles.transferAmount}>{formatAmt(tx.amount)}</Text>
                          <View style={styles.transferArrowTrack}>
                            <View style={styles.transferArrowLine} />
                            <View style={styles.arrowIconBubble}>
                              <Ionicons name="arrow-forward" size={13} color="#FFFFFF" />
                            </View>
                          </View>
                        </View>

                        {/* Receiver */}
                        <View style={styles.partyCol}>
                          <View style={[styles.partyAvatar, { backgroundColor: '#E8F5E9' }]}>
                            <Text style={[styles.partyAvatarText, { color: '#2E7D32' }]}>
                              {tx.toName.substring(0, 2).toUpperCase()}
                            </Text>
                          </View>
                          <Text style={styles.partyName} numberOfLines={1}>{tx.toName}</Text>
                          <View style={styles.receivesBadge}>
                            <Text style={styles.receivesBadgeText}>RECEIVES</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </ScrollView>

          {/* Action Footer */}
          <View style={styles.modernFooter}>
            <TouchableOpacity
              style={styles.whatsAppButton}
              onPress={handleShareSummary}
              activeOpacity={0.85}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.whatsAppButtonText}>Share Plan (WhatsApp)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.doneActionButton}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={styles.doneActionButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Month Picker Modal */}
      <MonthPickerModal
        visible={monthPickerVisible}
        selectedDate={selectedMonthDate}
        minDate={minAvailableDate}
        maxDate={new Date()}
        onSelect={(newDate) => setSelectedMonthDate(newDate)}
        onClose={() => setMonthPickerVisible(false)}
        darkMode={darkMode}
      />

      {/* Custom Date Range Picker Modal */}
      <AppDatePickerModal
        visible={datePickerMode !== null}
        initialDate={datePickerMode === 'start' ? customStartDate : customEndDate}
        maximumDate={new Date()}
        minimumDate={minAvailableDate}
        onConfirm={handleCustomDateConfirm}
        onCancel={() => setDatePickerMode(null)}
        darkMode={darkMode}
      />
    </Modal>
  );
}

const getStyles = (colors: any, darkMode: boolean) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 20,
      paddingTop: 10,
      alignItems: 'center',
    },
    handleBar: {
      width: 42,
      height: 4.5,
      borderRadius: 3,
      backgroundColor: darkMode ? '#475569' : '#CBD5E1',
      marginBottom: 12,
    },
    modalHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
      marginBottom: 14,
    },
    headerIconBadge: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.35,
      shadowRadius: 5,
      elevation: 4,
    },
    modalTitle: {
      fontSize: 19,
      fontWeight: '800',
      color: colors.textPrimary,
      letterSpacing: -0.2,
    },
    verifiedTag: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#E8F5E9',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 8,
      gap: 3,
    },
    verifiedTagText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#2E7D32',
    },
    modalSubTitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
      fontWeight: '500',
    },
    closeBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.inputBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    periodCompactBar: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      backgroundColor: colors.cardBg,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
    periodPillModern: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.primary + '30',
    },
    periodPillModernText: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.primary,
    },
    changeMonthChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.inputBg,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 8,
      gap: 3,
    },
    changeMonthChipText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.primary,
    },
    auditBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    auditBadgeText: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    modeSwitcherContainer: {
      flexDirection: 'row',
      backgroundColor: colors.inputBg,
      borderRadius: 14,
      padding: 3,
      marginBottom: 14,
      width: '100%',
    },
    modeTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 9,
      borderRadius: 11,
    },
    modeTabActive: {
      backgroundColor: colors.surface,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 3,
      elevation: 2,
    },
    modeTabText: {
      fontSize: 12.5,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    modeTabTextActive: {
      color: colors.primary,
      fontWeight: '800',
    },
    spaciousHeroCard: {
      backgroundColor: colors.cardBg,
      borderRadius: 20,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 6,
      elevation: 2,
    },
    heroRowStats: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    heroStatItem: {
      flex: 1,
    },
    heroStatItemRight: {
      flex: 1,
      alignItems: 'flex-end',
    },
    statLabelBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.financial.walletDepositLight,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      alignSelf: 'flex-start',
      marginBottom: 6,
      gap: 3,
    },
    statLabelBadgeText: {
      fontSize: 10.5,
      fontWeight: '800',
      color: colors.financial.walletDeposit,
    },
    statLabelBadgeRight: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.financial.deficitLight,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      alignSelf: 'flex-end',
      marginBottom: 6,
      gap: 3,
    },
    statLabelBadgeTextRight: {
      fontSize: 10.5,
      fontWeight: '800',
      color: colors.financial.spent,
    },
    heroStatNumber: {
      fontSize: 22,
      fontWeight: '900',
      letterSpacing: -0.5,
    },
    heroStatNumberRight: {
      fontSize: 22,
      fontWeight: '900',
      letterSpacing: -0.5,
    },
    heroCardDivider: {
      height: 1,
      backgroundColor: colors.divider,
      marginVertical: 12,
    },
    heroRemainingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.inputBg,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
    },
    cashGlowDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.financial.walletDeposit,
      marginRight: 8,
    },
    heroRemainingTitle: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    heroRemainingVal: {
      fontSize: 15,
      fontWeight: '900',
      color: colors.financial.walletDeposit,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
      paddingHorizontal: 2,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.textPrimary,
      letterSpacing: -0.2,
    },
    sectionMemberCount: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    spaciousMemberCard: {
      backgroundColor: colors.cardBg,
      borderRadius: 20,
      padding: 16,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 5,
      elevation: 2,
    },
    memberCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },
    memberInitialsCircle: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
    },
    memberInitialsText: {
      fontSize: 15,
      fontWeight: '800',
    },
    memberName: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    memberNetStatusSub: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    spaciousStatusBadge: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      alignItems: 'flex-end',
    },
    spaciousStatusAction: {
      fontSize: 9.5,
      fontWeight: '900',
      letterSpacing: 0.5,
    },
    spaciousStatusAmt: {
      fontSize: 15,
      fontWeight: '900',
      marginTop: 2,
    },
    metricsTripleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.inputBg,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginBottom: 10,
    },
    metricColumn: {
      flex: 1,
      alignItems: 'center',
    },
    metricColumnDivider: {
      width: 1,
      height: 24,
      backgroundColor: colors.divider,
    },
    metricColumnLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textTertiary,
      textTransform: 'uppercase',
      marginBottom: 3,
    },
    metricColumnValue: {
      fontSize: 13.5,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    smartFormulaBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    smartFormulaText: {
      fontSize: 11,
      color: colors.textSecondary,
      flex: 1,
    },
    p2pOverviewCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.cardBg,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 10,
    },
    loanToggleStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    loanToggleBadge: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loanToggleTitle: {
      fontSize: 12.5,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    loanToggleSub: {
      fontSize: 10.5,
      color: colors.textSecondary,
      marginTop: 1,
    },
    loanSwitchPill: {
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 10,
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    loanSwitchPillActive: {
      backgroundColor: colors.financial.walletDeposit,
      borderColor: colors.financial.walletDeposit,
    },
    loanSwitchPillText: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.textSecondary,
    },
    loanSwitchPillTextActive: {
      color: '#FFFFFF',
    },
    p2pOverviewLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 2,
    },
    p2pOverviewAmount: {
      fontSize: 20,
      fontWeight: '900',
      color: colors.textPrimary,
    },
    p2pTransactionBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary + '15',
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: 12,
    },
    p2pTransactionBadgeText: {
      fontSize: 11.5,
      fontWeight: '800',
      color: colors.primary,
    },
    emptySettledState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
      backgroundColor: colors.cardBg,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 6,
      paddingHorizontal: 20,
    },
    emptyIconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.primary + '15',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    emptySettledTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    emptySettledDesc: {
      fontSize: 12.5,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
    },
    transferCard: {
      backgroundColor: colors.cardBg,
      borderRadius: 18,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 5,
      elevation: 2,
    },
    transferCardInner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    partyCol: {
      width: '30%',
      alignItems: 'center',
    },
    partyAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 5,
    },
    partyAvatarText: {
      fontSize: 15,
      fontWeight: '800',
    },
    partyName: {
      fontSize: 12.5,
      fontWeight: '800',
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: 3,
    },
    paysBadge: {
      backgroundColor: '#FFEBEE',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
    },
    paysBadgeText: {
      fontSize: 8.5,
      fontWeight: '900',
      color: '#D32F2F',
      letterSpacing: 0.4,
    },
    receivesBadge: {
      backgroundColor: '#E8F5E9',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
    },
    receivesBadgeText: {
      fontSize: 8.5,
      fontWeight: '900',
      color: '#2E7D32',
      letterSpacing: 0.4,
    },
    transferCenterCol: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: 6,
    },
    transferAmount: {
      fontSize: 16,
      fontWeight: '900',
      color: colors.primary,
      marginBottom: 5,
    },
    transferArrowTrack: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
    },
    transferArrowLine: {
      flex: 1,
      height: 2.5,
      backgroundColor: colors.primary + '35',
      borderRadius: 1.5,
    },
    arrowIconBubble: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: -4,
    },
    modernFooter: {
      flexDirection: 'row',
      gap: 10,
      width: '100%',
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    whatsAppButton: {
      flex: 2,
      flexDirection: 'row',
      backgroundColor: '#25D366',
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#25D366',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.3,
      shadowRadius: 5,
      elevation: 3,
    },
    whatsAppButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '800',
    },
    doneActionButton: {
      flex: 1,
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    doneActionButtonText: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
  });
