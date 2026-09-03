import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import { getThemeColors } from '../../utils/theme';
import { loanService } from '../../services/loanService';
import { PersonalLoan } from '../../models/types';
import LoanModal from '../../components/LoanModal';

export default function MoneyCircleScreen() {
  const navigation = useNavigation<any>();
  const { currentAppUser, members, currency, darkMode } = useStore();
  const colors = getThemeColors(darkMode);
  const styles = getStyles(colors, darkMode);

  const [loans, setLoans] = useState<PersonalLoan[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'given' | 'borrowed'>('all');
  const [loanModalVisible, setLoanModalVisible] = useState(false);
  const [loanModalType, setLoanModalType] = useState<'give' | 'borrow'>('give');
  const [selectedMemberForLoan, setSelectedMemberForLoan] = useState<string | undefined>(undefined);

  // Load loans
  const fetchLoans = async () => {
    if (!currentAppUser?.teamId || !currentAppUser?.id) return;
    try {
      const data = await loanService.getLoans(currentAppUser.teamId, currentAppUser.id);
      setLoans(data);
    } catch (e) {
      console.warn('Error fetching loans:', e);
    }
  };

  useEffect(() => {
    fetchLoans();
  }, [currentAppUser?.teamId, currentAppUser?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLoans();
    setRefreshing(false);
  };

  // User Loan Summary
  const summary = useMemo(() => {
    if (!currentAppUser?.id) return { toCollect: 0, toPay: 0, netBalance: 0 };
    return loanService.getUserLoanSummary(currentAppUser.id, loans);
  }, [currentAppUser?.id, loans]);

  // Filtered loans list
  const filteredLoans = useMemo(() => {
    if (!currentAppUser?.id) return [];
    return loans.filter(l => {
      if (filterType === 'given') return l.lenderId === currentAppUser.id;
      if (filterType === 'borrowed') return l.borrowerId === currentAppUser.id;
      return true;
    });
  }, [loans, filterType, currentAppUser?.id]);

  // Per-member breakdown
  const memberBreakdown = useMemo(() => {
    if (!currentAppUser?.id) return [];
    const otherMembers = members.filter(m => m.id !== currentAppUser.id);
    return otherMembers.map(m => {
      const net = loanService.getNetLoanBalanceBetween(currentAppUser.id, m.id, loans);
      const memberLoans = loans.filter(
        l => (l.lenderId === m.id && l.borrowerId === currentAppUser.id) ||
             (l.borrowerId === m.id && l.lenderId === currentAppUser.id)
      );
      return {
        member: m,
        net,
        loanCount: memberLoans.length,
      };
    }).filter(item => item.net !== 0 || item.loanCount > 0);
  }, [members, currentAppUser?.id, loans]);

  // Settle or Delete loan
  const handleToggleSettle = (loan: PersonalLoan) => {
    const nextStatus = loan.status === 'SETTLED' ? 'PENDING' : 'SETTLED';
    Alert.alert(
      nextStatus === 'SETTLED' ? 'Mark as Settled' : 'Mark as Pending',
      `Are you sure you want to mark this transaction of ${currency} ${loan.amount.toLocaleString()} as ${nextStatus.toLowerCase()}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            await loanService.settleLoan(loan.id, nextStatus);
            setLoans(prev => prev.map(l => l.id === loan.id ? { ...l, status: nextStatus } : l));
          },
        },
      ]
    );
  };

  const handleDeleteLoan = (loan: PersonalLoan) => {
    Alert.alert(
      'Delete Transaction',
      `Are you sure you want to delete this ${currency} ${loan.amount.toLocaleString()} entry?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await loanService.deleteLoan(loan.id);
            setLoans(prev => prev.filter(l => l.id !== loan.id));
          },
        },
      ]
    );
  };

  const formatAmt = (val: number) => {
    return `${currency} ${Math.abs(val).toLocaleString()}`;
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <Text style={styles.headerTitle}>Money Circle</Text>
          <View style={styles.privateTag}>
            <Ionicons name="lock-closed" size={10} color={colors.textSecondary} />
            <Text style={styles.privateTagText}>Strictly Private Ledger</Text>
          </View>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* Hero Card: Overall Money Circle Position */}
        <View style={styles.heroCard}>
          <Text style={styles.heroSub}>Net Personal Balance</Text>
          <Text style={[
            styles.heroAmount,
            { color: summary.netBalance > 0 ? colors.financial.walletDeposit : summary.netBalance < 0 ? colors.financial.spent : colors.textPrimary }
          ]}>
            {summary.netBalance > 0 ? `+${formatAmt(summary.netBalance)}` : summary.netBalance < 0 ? `-${formatAmt(summary.netBalance)}` : `${currency} 0`}
          </Text>
          <Text style={styles.heroStatusDesc}>
            {summary.netBalance > 0
              ? 'You are owed more overall across your circle.'
              : summary.netBalance < 0
              ? 'You owe more overall across your circle.'
              : 'All circle accounts are settled.'}
          </Text>

          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatItem}>
              <View style={styles.heroStatBadgeGreen}>
                <Ionicons name="arrow-up" size={12} color={colors.financial.walletDeposit} />
                <Text style={styles.heroStatBadgeTextGreen}>To Collect</Text>
              </View>
              <Text style={[styles.heroStatValue, { color: colors.financial.walletDeposit }]}>
                {formatAmt(summary.toCollect)}
              </Text>
            </View>

            <View style={styles.heroStatDivider} />

            <View style={styles.heroStatItem}>
              <View style={styles.heroStatBadgeRed}>
                <Ionicons name="arrow-down" size={12} color={colors.financial.spent} />
                <Text style={styles.heroStatBadgeTextRed}>To Pay</Text>
              </View>
              <Text style={[styles.heroStatValue, { color: colors.financial.spent }]}>
                {formatAmt(summary.toPay)}
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons (Lent (Give) in Green, Borrow (Take) in Red) */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.giveBtn}
            onPress={() => {
              setLoanModalType('give');
              setSelectedMemberForLoan(undefined);
              setLoanModalVisible(true);
            }}
            activeOpacity={0.85}
          >
            <View style={styles.actionIconCircleGreen}>
              <Ionicons name="arrow-up" size={16} color="#FFFFFF" />
            </View>
            <View style={{ marginLeft: 10 }}>
              <Text style={styles.giveBtnTitle}>Lent (Give)</Text>
              <Text style={styles.actionBtnSub}>You gave money</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.borrowBtn}
            onPress={() => {
              setLoanModalType('borrow');
              setSelectedMemberForLoan(undefined);
              setLoanModalVisible(true);
            }}
            activeOpacity={0.85}
          >
            <View style={styles.actionIconCircleRed}>
              <Ionicons name="arrow-down" size={16} color="#FFFFFF" />
            </View>
            <View style={{ marginLeft: 10 }}>
              <Text style={styles.borrowBtnTitle}>Borrow (Take)</Text>
              <Text style={styles.actionBtnSub}>You took money</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Members Circle Ledgers */}
        {memberBreakdown.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <Text style={styles.sectionTitle}>Members Circle</Text>
            {memberBreakdown.map(({ member, net, loanCount }) => {
              const initials = member.name.substring(0, 2).toUpperCase();
              const isOwed = net > 0;
              const isDebt = net < 0;
              const statusColor = isOwed ? colors.financial.walletDeposit : isDebt ? colors.financial.spent : colors.textSecondary;
              const statusBg = isOwed ? colors.financial.walletDepositLight : isDebt ? colors.financial.spentLight : colors.inputBg;

              return (
                <View key={member.id} style={styles.memberCard}>
                  <View style={styles.memberCardTop}>
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberAvatarText}>{initials}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.memberName}>{member.name}</Text>
                      <Text style={styles.memberCountSub}>{loanCount} active transaction{loanCount === 1 ? '' : 's'}</Text>
                    </View>
                    <View style={[styles.memberStatusBadge, { backgroundColor: statusBg }]}>
                      <Text style={[styles.memberStatusBadgeAction, { color: statusColor }]}>
                        {isOwed ? 'OWES YOU' : isDebt ? 'YOU OWE' : 'SETTLED'}
                      </Text>
                      <Text style={[styles.memberStatusBadgeAmt, { color: statusColor }]}>
                        {formatAmt(net)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.memberCardActions}>
                    <TouchableOpacity
                      style={styles.memberActionChip}
                      onPress={() => {
                        setSelectedMemberForLoan(member.id);
                        setLoanModalType('give');
                        setLoanModalVisible(true);
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="arrow-up" size={12} color={colors.financial.walletDeposit} />
                      <Text style={[styles.memberActionChipText, { color: colors.financial.walletDeposit }]}>Lent (Give)</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.memberActionChip}
                      onPress={() => {
                        setSelectedMemberForLoan(member.id);
                        setLoanModalType('borrow');
                        setLoanModalVisible(true);
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="arrow-down" size={12} color={colors.financial.spent} />
                      <Text style={[styles.memberActionChipText, { color: colors.financial.spent }]}>Borrow (Take)</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Transaction History Filter Tabs */}
        <View style={styles.historySectionHeader}>
          <Text style={styles.sectionTitle}>Transaction History</Text>
          <View style={styles.filterPills}>
            {(['all', 'given', 'borrowed'] as const).map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.filterPill, filterType === f && styles.filterPillActive]}
                onPress={() => setFilterType(f)}
              >
                <Text style={[styles.filterPillText, filterType === f && styles.filterPillTextActive]}>
                  {f === 'all' ? 'All' : f === 'given' ? 'Given' : 'Borrowed'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Transactions List */}
        {filteredLoans.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="swap-horizontal" size={32} color={colors.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>No Transactions</Text>
            <Text style={styles.emptyDesc}>
              Tap "Give" or "Borrow" above to record a private transaction in your Money Circle.
            </Text>
          </View>
        ) : (
          filteredLoans.map(loan => {
            const isGiven = loan.lenderId === currentAppUser?.id;
            const otherName = isGiven ? loan.borrowerName : loan.lenderName;
            const isSettled = loan.status === 'SETTLED';
            const txColor = isGiven ? colors.financial.walletDeposit : colors.financial.spent;
            const txBg = isGiven ? colors.financial.walletDepositLight : colors.financial.spentLight;

            return (
              <View key={loan.id} style={[styles.txCard, isSettled && { opacity: 0.6 }]}>
                <View style={[styles.txIconCircle, { backgroundColor: txBg }]}>
                  <Ionicons
                    name={isGiven ? 'arrow-up' : 'arrow-down'}
                    size={16}
                    color={txColor}
                  />
                </View>

                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.txTitle}>
                      {isGiven ? `Gave to ${otherName}` : `Borrowed from ${otherName}`}
                    </Text>
                    {isSettled && (
                      <View style={styles.settledTag}>
                        <Text style={styles.settledTagText}>SETTLED</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.txDate}>
                    {new Date(loan.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {loan.note ? ` · ${loan.note}` : ''}
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                  <Text style={[styles.txAmount, { color: txColor }]}>
                    {isGiven ? `+${formatAmt(loan.amount)}` : `-${formatAmt(loan.amount)}`}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    <TouchableOpacity onPress={() => handleToggleSettle(loan)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons
                        name={isSettled ? 'refresh-circle-outline' : 'checkmark-circle-outline'}
                        size={18}
                        color={colors.textSecondary}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteLoan(loan)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="trash-outline" size={17} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Record Loan Modal */}
      <LoanModal
        visible={loanModalVisible}
        onClose={() => setLoanModalVisible(false)}
        members={members}
        currentAppUser={currentAppUser}
        currency={currency}
        darkMode={darkMode}
        initialType={loanModalType}
        initialMemberId={selectedMemberForLoan}
        onSaveLoan={async (loanData) => {
          const newL = await loanService.addLoan(loanData);
          setLoans(prev => [newL, ...prev]);
          Alert.alert(
            'Recorded Successfully',
            loanData.lenderId === currentAppUser?.id
              ? `Transaction of ${currency} ${loanData.amount.toLocaleString()} given to ${loanData.borrowerName}.`
              : `Transaction of ${currency} ${loanData.amount.toLocaleString()} borrowed from ${loanData.lenderName}.`
          );
        }}
        existingLoans={loans}
      />
    </SafeAreaView>
  );
}

const getStyles = (colors: any, darkMode: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderColor: colors.divider,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.inputBg,
    },
    headerTitleCol: {
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.textPrimary,
      letterSpacing: -0.2,
    },
    privateTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 2,
    },
    privateTagText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    },
    heroCard: {
      backgroundColor: colors.cardBg,
      borderRadius: 22,
      padding: 20,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 10,
      elevation: 3,
    },
    heroSub: {
      fontSize: 11.5,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    heroAmount: {
      fontSize: 32,
      fontWeight: '900',
      letterSpacing: -0.5,
      marginBottom: 4,
    },
    heroStatusDesc: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 16,
    },
    heroStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    heroStatItem: {
      flex: 1,
      alignItems: 'center',
    },
    heroStatDivider: {
      width: 1,
      height: 28,
      backgroundColor: colors.divider,
    },
    heroStatBadgeGreen: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.financial.walletDepositLight,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      marginBottom: 4,
    },
    heroStatBadgeTextGreen: {
      fontSize: 10.5,
      fontWeight: '800',
      color: colors.financial.walletDeposit,
    },
    heroStatBadgeRed: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.financial.spentLight,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      marginBottom: 4,
    },
    heroStatBadgeTextRed: {
      fontSize: 10.5,
      fontWeight: '800',
      color: colors.financial.spent,
    },
    heroStatValue: {
      fontSize: 16,
      fontWeight: '900',
    },
    actionRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 20,
    },
    giveBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.financial.walletDepositLight,
      borderWidth: 1.5,
      borderColor: colors.financial.walletDeposit,
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 14,
      shadowColor: colors.financial.walletDeposit,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    actionIconCircleGreen: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.financial.walletDeposit,
      alignItems: 'center',
      justifyContent: 'center',
    },
    giveBtnTitle: {
      fontSize: 13.5,
      fontWeight: '800',
      color: colors.financial.walletDeposit,
    },
    borrowBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.financial.spentLight,
      borderWidth: 1.5,
      borderColor: colors.financial.spent,
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 14,
      shadowColor: colors.financial.spent,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    actionIconCircleRed: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.financial.spent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    borrowBtnTitle: {
      fontSize: 13.5,
      fontWeight: '800',
      color: colors.financial.spent,
    },
    actionBtnSub: {
      fontSize: 10,
      color: colors.textSecondary,
      marginTop: 1,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 10,
    },
    memberCard: {
      backgroundColor: colors.cardBg,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 10,
    },
    memberCardTop: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    memberAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary + '18',
      alignItems: 'center',
      justifyContent: 'center',
    },
    memberAvatarText: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.primary,
    },
    memberName: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    memberCountSub: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 1,
    },
    memberStatusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 10,
      alignItems: 'flex-end',
    },
    memberStatusBadgeAction: {
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0.5,
    },
    memberStatusBadgeAmt: {
      fontSize: 13.5,
      fontWeight: '900',
      marginTop: 1,
    },
    memberCardActions: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      justifyContent: 'flex-end',
    },
    memberActionChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.inputBg,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      gap: 4,
    },
    memberActionChipText: {
      fontSize: 11.5,
      fontWeight: '800',
    },
    historySectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
      marginTop: 4,
    },
    filterPills: {
      flexDirection: 'row',
      backgroundColor: colors.inputBg,
      borderRadius: 10,
      padding: 3,
    },
    filterPill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
    },
    filterPillActive: {
      backgroundColor: colors.cardBg,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 1,
    },
    filterPillText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    filterPillTextActive: {
      color: colors.textPrimary,
      fontWeight: '800',
    },
    txCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 8,
    },
    txIconCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    txTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    txDate: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    txAmount: {
      fontSize: 14,
      fontWeight: '800',
    },
    settledTag: {
      backgroundColor: colors.inputBg,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 4,
    },
    settledTagText: {
      fontSize: 8.5,
      fontWeight: '800',
      color: colors.textSecondary,
    },
    emptyCard: {
      backgroundColor: colors.cardBg,
      borderRadius: 16,
      padding: 24,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 10,
    },
    emptyIconCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.inputBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    emptyDesc: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 16,
    },
  });
