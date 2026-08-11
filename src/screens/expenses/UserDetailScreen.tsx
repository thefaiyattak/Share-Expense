import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  LayoutAnimation,
  UIManager,
  Keyboard
} from 'react-native';
import { GlobalLoader } from '../../components/GlobalLoader';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental && !(globalThis as any).nativeFabricUIManager && !(globalThis as any).__turboModuleProxy) {
  try {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  } catch (e) {}
}
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../store/useStore';
import { getThemeColors } from '../../utils/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import Svg, { Circle } from 'react-native-svg';
import { db } from '../../services/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { expenseService } from '../../services/expenseService';
import { pdfService } from '../../services/pdfService';
import { notificationService } from '../../services/notificationService';
import { AppUser } from '../../models/types';
import { calculateIntegerPercentages } from '../../utils/math';
import ChangeHistoryModal from '../../components/ChangeHistoryModal';
import { useKeyboardVisible } from '../../utils/useKeyboardVisible';

export default function UserDetailScreen() {
  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardVisible();
  const modalBottomPadding = isKeyboardVisible ? 14 : Math.max(insets.bottom + 6, 18);
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { currency, expenses, currentAppUser, setCurrentAppUser, setExpenses, setMembers, members, darkMode, activeTeamId } = useStore();

  const colors = getThemeColors(darkMode);
  const styles = getStyles(colors);

  const { 
    userId,
    userName, 
    userInitials, 
    spent, 
    wallet, 
    balance, 
    avatarBg, 
    avatarText,
    profileImageUrl
  } = route.params;

  const [loading, setLoading] = useState(false);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [historyTab, setHistoryTab] = useState<'user' | 'team'>('user');

  const handleSwitchHistoryTab = (tab: 'user' | 'team') => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHistoryTab(tab);
  };

  // Modal states
  const [walletModalVisible, setWalletModalVisible] = useState(false);
  const [walletInput, setWalletInput] = useState(wallet.toString());

  const [expenseModalVisible, setExpenseModalVisible] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<any>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editSplitUserIds, setEditSplitUserIds] = useState<string[]>([]);
  const [editHistory, setEditHistory] = useState<any[]>([]);
  const [receiptPreviewUri, setReceiptPreviewUri] = useState<string | null>(null);
  const [receiptPreviewVisible, setReceiptPreviewVisible] = useState(false);

  // Admin Adjustment Modal State
  const [adjustModalVisible, setAdjustModalVisible] = useState(false);
  const [adjustType, setAdjustType] = useState<'credit' | 'debit'>('credit');
  const [adjustAmountInput, setAdjustAmountInput] = useState('');
  const [adjustReasonInput, setAdjustReasonInput] = useState('');
  const [adjustError, setAdjustError] = useState('');

  // Access Controls
  const isAuthorized = currentAppUser?.role === 'admin' || currentAppUser?.id === userId;

  const formatAmount = (val: number) => {
    return `${currency} ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(val)}`;
  };

  const formatExactDateTime = (val: any) => {
    if (!val) return '';
    const d = val instanceof Date ? val : (typeof val?.toDate === 'function' ? val.toDate() : new Date(val));
    if (isNaN(d.getTime())) return '';
    const dateStr = d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${dateStr} at ${timeStr}`;
  };

  // User join date restriction logic
  const userJoinDate = React.useMemo(() => {
    if (!currentAppUser?.createdAt) return new Date(0);
    const d = typeof (currentAppUser.createdAt as any)?.toDate === 'function'
      ? (currentAppUser.createdAt as any).toDate()
      : new Date(currentAppUser.createdAt);
    return isNaN(d.getTime()) ? new Date(0) : d;
  }, [currentAppUser?.createdAt]);

  // Month Selector State
  const [selectedMonthDate, setSelectedMonthDate] = useState<Date>(new Date());

  const handlePrevMonth = () => {
    setSelectedMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    const today = new Date();
    setSelectedMonthDate(prev => {
      const next = new Date(prev.getFullYear(), prev.getMonth() + 1, 1);
      if (next.getFullYear() > today.getFullYear() || (next.getFullYear() === today.getFullYear() && next.getMonth() > today.getMonth())) {
        return prev;
      }
      return next;
    });
  };

  const selectedMonthStart = React.useMemo(() => {
    return new Date(selectedMonthDate.getFullYear(), selectedMonthDate.getMonth(), 1, 0, 0, 0);
  }, [selectedMonthDate]);

  const selectedMonthEnd = React.useMemo(() => {
    return new Date(selectedMonthDate.getFullYear(), selectedMonthDate.getMonth() + 1, 0, 23, 59, 59);
  }, [selectedMonthDate]);

  // All team expenses for the selected month
  const monthTeamExpenses = React.useMemo(() => {
    return expenses.filter((e) => {
      const expDate = new Date(e.date);
      return expDate >= selectedMonthStart && expDate <= selectedMonthEnd;
    });
  }, [expenses, selectedMonthStart, selectedMonthEnd]);

  // Filter user specific expenses for selected month
  const userExpenses = React.useMemo(() => {
    return monthTeamExpenses.filter((e) => e.userId === userId);
  }, [monthTeamExpenses, userId]);

  // Out-of-pocket spent by user in selected month
  const monthUserSpent = React.useMemo(() => {
    return userExpenses.reduce((sum, e) => sum + (Number(e.price) || 0) * (parseFloat(e.quantity) || 1), 0);
  }, [userExpenses]);

  // Calculate member shares for the selected month
  const memberIds = React.useMemo(() => members.map(m => m.id), [members]);
  const monthShares = React.useMemo(() => {
    return memberIds.length > 0 ? expenseService.calculateShares({
      expenses: monthTeamExpenses,
      attendance: [],
      allIds: memberIds
    }) : {};
  }, [monthTeamExpenses, memberIds]);

  const userMonthShare = monthShares[userId] || 0;

  const isCurrentMonth = React.useMemo(() => {
    const now = new Date();
    return selectedMonthDate.getFullYear() === now.getFullYear() && selectedMonthDate.getMonth() === now.getMonth();
  }, [selectedMonthDate]);

  const userMemberObj = members.find(m => m.id === userId);
  
  const userWallet = React.useMemo(() => {
    if (isCurrentMonth) {
      return userMemberObj ? userMemberObj.walletBalance : wallet;
    }
    // For past months with no expenses/activity, wallet is 0
    if (!monthTeamExpenses || monthTeamExpenses.length === 0) {
      return 0;
    }
    // For past months with expenses, use real calculated month share/spent
    return userMonthShare > 0 ? userMonthShare : monthUserSpent;
  }, [isCurrentMonth, userMemberObj, wallet, monthTeamExpenses, monthUserSpent, userMonthShare]);

  // Net balance / wallet deduction status for selected month
  let monthDisplayBalance = 0;
  let isMonthPositive = false;

  // Net position includes wallet deposit PLUS out-of-pocket spent minus calculated share
  const totalUserContribution = userWallet + monthUserSpent;
  const netPosition = totalUserContribution - userMonthShare;

  if (netPosition >= 0) {
    isMonthPositive = true;
    monthDisplayBalance = netPosition;
  } else {
    isMonthPositive = false;
    monthDisplayBalance = Math.abs(netPosition);
  }

  const left = userWallet > 0 ? userWallet - monthUserSpent : -monthUserSpent;

  const [selectedGaugeSegment, setSelectedGaugeSegment] = useState<'added' | 'spent' | 'left' | null>(null);

  const toggleGaugeSegment = (seg: 'added' | 'spent' | 'left') => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedGaugeSegment(prev => prev === seg ? null : seg);
  };

  // Math for category totals in selected month
  const { categoryTotals, totalCatSpent } = React.useMemo(() => {
    const totals: Record<string, number> = { breakfast: 0, lunch: 0, dinner: 0, utility: 0 };
    userExpenses.forEach((e) => {
      const cat = e.category || 'utility';
      if (totals[cat] !== undefined) {
        totals[cat] += (Number(e.price) || 0) * (parseFloat(e.quantity) || 1);
      }
    });
    const total = Object.values(totals).reduce((a, b) => a + b, 0);
    return { categoryTotals: totals, totalCatSpent: total };
  }, [userExpenses]);

  useEffect(() => {
    if (!selectedExpense) {
      setEditHistory([]);
      return;
    }
    const unsub = expenseService.getEditHistory(selectedExpense.id, (data) => {
      setEditHistory(data);
    });
    return unsub;
  }, [selectedExpense]);

  // SVG Gauge calculations
  const { spentPct, leftPct, radius, circumference, spentLength, leftLength, spentStrokeDashoffset, leftStrokeDashoffset } = React.useMemo(() => {
    const sPct = userWallet > 0 ? Math.max(0, Math.min(monthUserSpent / userWallet, 1)) : 0;
    const lPct = userWallet > 0 ? Math.max(0, Math.min(left / userWallet, 1)) : 0;
    const rad = 38;
    const circ = 2 * Math.PI * rad;
    const gap = 8; 
    const totalGaps = sPct > 0 && lPct > 0 ? 2 * gap : 0;
    const availableLength = circ - totalGaps;
    const sLen = sPct * availableLength;
    const lLen = lPct * availableLength;
    const sDashoffset = - (gap / 2);
    const lDashoffset = - (sLen + gap + (gap / 2));
    return {
      spentPct: sPct,
      leftPct: lPct,
      radius: rad,
      circumference: circ,
      spentLength: sLen,
      leftLength: lLen,
      spentStrokeDashoffset: sDashoffset,
      leftStrokeDashoffset: lDashoffset
    };
  }, [userWallet, monthUserSpent, left]);
  const usagePct = spentPct;

  // Handle Wallet Update
  const [walletError, setWalletError] = useState('');
  const handleUpdateWallet = async () => {
    if (!walletInput.trim()) {
      setWalletError('Amount is required');
      return;
    }
    const val = Number(walletInput);
    if (isNaN(val) || val < 0) {
      setWalletError('Please enter a valid non-negative amount');
      return;
    }
    setWalletModalVisible(false);
    setLoading(true);
    try {
      const newWalletAmount = parseFloat(walletInput);
      const oldWallet = userWallet;
      await updateDoc(doc(db, 'users', userId), {
        walletBalance: newWalletAmount
      });

      // Log audit history
      await expenseService.logAuditLog({
        teamId: activeTeamId || currentAppUser?.teamId || '',
        entityId: userId,
        entityType: 'wallet',
        action: 'updated',
        itemName: `${userName}'s Wallet Deposit`,
        userId: currentAppUser?.id || '',
        userName: currentAppUser?.name || 'Unknown',
        previousData: { walletBalance: oldWallet },
        newData: { walletBalance: newWalletAmount }
      });

      // Update local state if updating own wallet
      if (currentAppUser && currentAppUser.id === userId) {
        setCurrentAppUser({
          ...currentAppUser,
          walletBalance: newWalletAmount
        } as AppUser);
      }

      Alert.alert('Success', 'Wallet balance updated successfully.');
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update wallet balance');
    } finally {
      setLoading(false);
    }
  };

  // Handle Admin Manual Adjustment (+ / -)
  const handleAdminAdjustBalance = async () => {
    if (currentAppUser?.role !== 'admin') {
      Alert.alert('Access Denied', 'Only the group admin can adjust member amounts or carry them to next month.');
      return;
    }
    const val = Number(adjustAmountInput);
    if (!adjustAmountInput.trim() || isNaN(val) || val <= 0) {
      setAdjustError('Please enter a valid positive adjustment amount');
      return;
    }

    setAdjustModalVisible(false);
    setLoading(true);
    try {
      const currentWallet = userWallet;
      // Credit increases wallet (+), Debit reduces wallet (-)
      const newWalletAmount = adjustType === 'credit' 
        ? currentWallet + val 
        : currentWallet - val;

      await updateDoc(doc(db, 'users', userId), {
        walletBalance: newWalletAmount
      });

      // Log audit history for admin adjustment
      const reasonText = adjustReasonInput.trim() ? ` (${adjustReasonInput.trim()})` : '';
      const auditItemName = `${userName}'s Wallet ${adjustType === 'credit' ? 'Credit (+)' : 'Debit (-)'}${reasonText}`;
      
      await expenseService.logAuditLog({
        teamId: activeTeamId || currentAppUser?.teamId || '',
        entityId: userId,
        entityType: 'wallet_adjustment',
        action: 'updated',
        itemName: auditItemName,
        userId: currentAppUser?.id || '',
        userName: currentAppUser?.name || 'Admin',
        previousData: { walletBalance: currentWallet },
        newData: { walletBalance: newWalletAmount, adjustmentType: adjustType, amount: val, reason: adjustReasonInput.trim() }
      });

      // PUSH REAL-TIME NOTIFICATION
      const targetTeamId = activeTeamId || currentAppUser?.teamId;
      if (targetTeamId) {
        const notifTitle = `Wallet ${adjustType === 'credit' ? 'Credited (+)' : 'Debited (-)'}`;
        const notifDesc = `Admin ${currentAppUser?.name || ''} ${adjustType === 'credit' ? 'credited' : 'debited'} ${formatAmount(val)} for ${userName}${reasonText}.`;
        await notificationService.notify(targetTeamId, notifTitle, notifDesc, 'adjustments');
      }

      if (currentAppUser?.id === userId) {
        setCurrentAppUser({ ...currentAppUser, walletBalance: newWalletAmount } as AppUser);
      }

      setAdjustAmountInput('');
      setAdjustReasonInput('');
      Alert.alert(
        'Balance Adjusted',
        `Successfully ${adjustType === 'credit' ? 'credited' : 'debited'} ${formatAmount(val)} for ${userName}. New wallet balance: ${formatAmount(newWalletAmount)}.`
      );
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to adjust balance');
    } finally {
      setLoading(false);
    }
  };

  // Handle Carrying Outstanding Balance (+ / -) to Next Month
  const handleTransferToNextMonth = () => {
    if (currentAppUser?.role !== 'admin') {
      Alert.alert('Access Denied', 'Only team admins can carry over balances.');
      return;
    }

    if (monthDisplayBalance === 0) {
      Alert.alert('No Balance', 'There is no remaining positive or negative balance for this month to transfer.');
      return;
    }

    const directionLabel = isMonthPositive ? 'Surplus (+)' : 'Deficit (-)';
    const amountFormatted = formatAmount(monthDisplayBalance);
    const selectedMonthName = selectedMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    Alert.alert(
      'Carry Over to Next Month',
      `Are you sure you want to transfer the ${directionLabel} of ${amountFormatted} from ${selectedMonthName} to ${userName}'s next month wallet?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Transfer Balance',
          onPress: async () => {
            setLoading(true);
            try {
              const currentWallet = userWallet;
              // If positive surplus: add to next month wallet (+). If negative deficit: adjust/deduct from wallet (-).
              const netTransfer = isMonthPositive ? monthDisplayBalance : -monthDisplayBalance;
              const newWalletAmount = currentWallet + netTransfer;

              await updateDoc(doc(db, 'users', userId), {
                walletBalance: newWalletAmount
              });

              // LOG HISTORY AUDIT
              const auditItemName = `${selectedMonthName} Balance Carry-over for ${userName}`;
              await expenseService.logAuditLog({
                teamId: activeTeamId || currentAppUser?.teamId || '',
                entityId: userId,
                entityType: 'month_end_transfer',
                action: 'updated',
                itemName: auditItemName,
                userId: currentAppUser?.id || '',
                userName: currentAppUser?.name || 'Admin',
                previousData: { walletBalance: currentWallet },
                newData: { walletBalance: newWalletAmount, netTransfer, fromMonth: selectedMonthName, transferAmount: monthDisplayBalance, isPositive: isMonthPositive }
              });

              // PUSH REAL-TIME NOTIFICATION
              const targetTeamId = activeTeamId || currentAppUser?.teamId;
              if (targetTeamId) {
                const notifTitle = 'Month-End Balance Transferred';
                const notifDesc = `Admin ${currentAppUser?.name || ''} transferred ${directionLabel} of ${amountFormatted} from ${selectedMonthName} to ${userName}'s active wallet.`;
                await notificationService.notify(targetTeamId, notifTitle, notifDesc, 'transfers');
              }

              if (currentAppUser?.id === userId) {
                setCurrentAppUser({ ...currentAppUser, walletBalance: newWalletAmount } as AppUser);
              }

              Alert.alert(
                'Transfer Complete',
                `Transferred ${isMonthPositive ? '+' : '-'}${amountFormatted} from ${selectedMonthName} to active wallet balance.`
              );
              navigation.goBack();
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to transfer balance');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  // Handle Expense Editing
  const handleEditExpense = async () => {
    if (!editItemName.trim()) {
      Alert.alert('Error', 'Please enter an item name.');
      return;
    }
    if (!editPrice.trim() || isNaN(Number(editPrice))) {
      Alert.alert('Error', 'Please enter a valid price.');
      return;
    }
    setExpenseModalVisible(false);
    setLoading(true);
    try {
      const previousState = {
        itemName: selectedExpense.itemName,
        price: selectedExpense.price,
        quantity: selectedExpense.quantity,
        category: selectedExpense.category,
        splitUserIds: selectedExpense.splitUserIds || [],
        teamId: selectedExpense.teamId || activeTeamId || '',
      };

      await expenseService.updateExpense(
        selectedExpense.id,
        {
          itemName: editItemName.trim(),
          price: parseFloat(editPrice) || 0,
          quantity: editQty.trim() || '1',
          splitUserIds: editSplitUserIds,
        },
        currentAppUser?.id || '',
        currentAppUser?.name || 'Unknown',
        previousState
      );

      setSelectedExpense(null);
      Alert.alert('Success', 'Expense updated successfully.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update expense');
    } finally {
      setLoading(false);
    }
  };

  // Handle Expense Deletion
  const handleDeleteExpense = () => {
    Alert.alert(
      'Delete Expense',
      'Are you sure you want to delete this expense?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setExpenseModalVisible(false);
            setLoading(true);
            try {
              const prevData = {
                itemName: selectedExpense.itemName,
                price: selectedExpense.price,
                quantity: selectedExpense.quantity,
                category: selectedExpense.category,
                teamId: selectedExpense.teamId || activeTeamId || '',
              };
              await expenseService.deleteExpense(
                selectedExpense.id,
                prevData,
                currentAppUser?.id || '',
                currentAppUser?.name || 'Unknown'
              );
              setSelectedExpense(null);
              Alert.alert('Success', 'Expense deleted.');
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to delete expense');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <GlobalLoader message="Updating..." visible={loading} />

      <View style={[styles.header, { backgroundColor: avatarText }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerContentHorizontal}>
          <View style={styles.avatarCompact}>
            {profileImageUrl ? (
              <Image source={{ uri: profileImageUrl }} style={styles.avatarCompactImg} />
            ) : (
              <Text style={styles.avatarCompactText}>{userInitials}</Text>
            )}
          </View>
          <View style={styles.headerTextCol}>
            <Text style={styles.userNameCompact} numberOfLines={1}>{userName}</Text>
          </View>

          {/* Month Selector Pill */}
          <View style={styles.monthPillContainer}>
            <TouchableOpacity onPress={handlePrevMonth} style={styles.monthPillBtn}>
              <Ionicons name="chevron-back" size={14} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.monthPillText}>
              {selectedMonthDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
            </Text>
            <TouchableOpacity onPress={handleNextMonth} style={styles.monthPillBtn}>
              <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* History Icon Button */}
          <TouchableOpacity 
            onPress={() => setHistoryModalVisible(true)}
            style={{ marginLeft: 8, padding: 4 }}
          >
            <Ionicons name="time-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {/* Finance Cards Grid (2x2 Layout) */}
        <View style={styles.financeGrid}>
          <View style={styles.row}>
            {/* Wallet Balance Card */}
            <TouchableOpacity 
              disabled={!isAuthorized}
              style={[styles.fCard2x2, { backgroundColor: colors.financial.walletDepositLight }]}
              onPress={() => setWalletModalVisible(true)}
            >
              <View style={styles.cardHeaderRow}>
                <Ionicons name="wallet" size={18} color={colors.financial.walletDeposit} />
                {isAuthorized && <Ionicons name="create-outline" size={13} color={colors.financial.walletDeposit} style={{ marginLeft: 'auto' }} />}
              </View>
              <Text style={[styles.fValue, { color: colors.financial.walletDeposit }]} numberOfLines={1}>{formatAmount(userWallet)}</Text>
              <Text style={[styles.fLabel, { color: colors.financial.walletDeposit }]}>Wallet Deposit</Text>
            </TouchableOpacity>

            {/* Spent Card */}
            <View style={[styles.fCard2x2, { backgroundColor: colors.financial.spentLight, marginLeft: 8 }]}>
              <View style={styles.cardHeaderRow}>
                <Ionicons name="cart" size={18} color={colors.financial.spent} />
              </View>
              <Text style={[styles.fValue, { color: colors.financial.spent }]} numberOfLines={1}>{formatAmount(monthUserSpent)}</Text>
              <Text style={[styles.fLabel, { color: colors.financial.spent }]}>Paid Out of Pocket</Text>
            </View>
          </View>

          <View style={[styles.row, { marginTop: 8 }]}>
            {/* Share Owed Card */}
            <View style={[styles.fCard2x2, { backgroundColor: colors.financial.calculatedShareLight }]}>
              <View style={styles.cardHeaderRow}>
                <Ionicons name="pie-chart" size={18} color={colors.financial.calculatedShare} />
              </View>
              <Text style={[styles.fValue, { color: colors.financial.calculatedShare }]} numberOfLines={1}>{formatAmount(userMonthShare)}</Text>
              <Text style={[styles.fLabel, { color: colors.financial.calculatedShare }]}>Your Share</Text>
            </View>

            {/* Net Status / Wallet Left Card */}
            <View style={[styles.fCard2x2, { backgroundColor: isMonthPositive ? colors.financial.walletLeftLight : colors.financial.deficitLight, marginLeft: 8 }]}>
              <View style={styles.cardHeaderRow}>
                <Ionicons name={isMonthPositive ? "arrow-up-circle" : "arrow-down-circle"} size={18} color={isMonthPositive ? colors.financial.walletLeft : colors.financial.deficit} />
                {currentAppUser?.role === 'admin' && (
                  <TouchableOpacity
                    onPress={() => setAdjustModalVisible(true)}
                    style={{ marginLeft: 'auto' }}
                  >
                    <Ionicons name="options-outline" size={14} color={isMonthPositive ? colors.financial.walletLeft : colors.financial.deficit} />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={[styles.fValue, { color: isMonthPositive ? colors.financial.walletLeft : colors.financial.deficit }]} numberOfLines={1}>
                {isMonthPositive ? '+' : '-'} {formatAmount(monthDisplayBalance)}
              </Text>
              <Text style={[styles.fLabel, { color: isMonthPositive ? colors.financial.walletLeft : colors.financial.deficit }]}>
                {isMonthPositive ? 'Net Credit (To Receive)' : 'Net Deficit (To Pay)'}
              </Text>
            </View>
          </View>

          {/* Settlement Math Formula Breakdown Helper */}
          <View style={{ marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surface, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border }}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
            <Text style={{ fontSize: 11, color: colors.textSecondary, flex: 1 }}>
              Net Balance = (Deposit + Out of Pocket) − Your Share
            </Text>
          </View>

          {/* Admin Month-End Settlement & Transfer Bar */}
          {currentAppUser?.role === 'admin' && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.primary + '18',
                  borderWidth: 1,
                  borderColor: colors.primary + '40',
                  borderRadius: 10,
                  paddingVertical: 10,
                  paddingHorizontal: 8
                }}
                onPress={() => {
                  setAdjustAmountInput('');
                  setAdjustReasonInput('');
                  setAdjustModalVisible(true);
                }}
              >
                <Ionicons name="create-outline" size={15} color={colors.primary} style={{ marginRight: 5 }} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
                  Adjust Pending (+/-)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.primary,
                  borderRadius: 10,
                  paddingVertical: 10,
                  paddingHorizontal: 8,
                  elevation: 2
                }}
                onPress={handleTransferToNextMonth}
              >
                <Ionicons name="arrow-forward-circle-outline" size={16} color="#FFFFFF" style={{ marginRight: 5 }} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>
                  Carry to Next Month
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Category Breakdown */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Category breakdown</Text>
          {(() => {
            const catItems = Object.entries(categoryTotals).map(([cat, amount]) => ({ id: cat, amount }));
            const catPctMap = calculateIntegerPercentages(catItems, c => c.amount);

            return Object.entries(categoryTotals).map(([cat, amount]) => {
              const pct = catPctMap[cat] || 0;
              if (amount === 0) return null;
              return (
                <View key={cat} style={styles.catBreakdownRow}>
                  <View style={styles.catBreakdownNameCol}>
                    <Text style={styles.catBreakdownName}>{cat.toUpperCase()}</Text>
                    <Text style={styles.catBreakdownPct}>{pct}%</Text>
                  </View>
                  <Text style={styles.catBreakdownAmt}>{formatAmount(amount)}</Text>
                </View>
              );
            });
          })()}
        </View>

        {/* Wallet usage Gauge */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Wallet usage</Text>
          <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 8, fontWeight: '500' }}>Tap gauge rows to inspect details</Text>
          <View style={styles.gaugeContainer}>
            <View style={styles.gaugeSvg}>
              <Svg height="100" width="100" viewBox="0 0 100 100">
                {/* Background base circle (Added - Green) */}
                <Circle
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="transparent"
                  stroke={colors.financial.walletDeposit}
                  strokeWidth={selectedGaugeSegment === 'added' ? "12" : "8"}
                  opacity={0.3}
                  onPress={() => toggleGaugeSegment('added')}
                />
                {/* Spent Segment (Red) */}
                {spentPct > 0 && (
                  <Circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="transparent"
                    stroke={colors.financial.spent}
                    strokeWidth={selectedGaugeSegment === 'spent' ? "12" : "8"}
                    strokeDasharray={`${spentLength} ${circumference}`}
                    strokeDashoffset={spentStrokeDashoffset}
                    strokeLinecap="round"
                    transform="rotate(-90, 50, 50)"
                    onPress={() => toggleGaugeSegment('spent')}
                  />
                )}
                {/* Left Segment (Orange) */}
                {leftPct > 0 && (
                  <Circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="transparent"
                    stroke={colors.financial.walletLeft}
                    strokeWidth={selectedGaugeSegment === 'left' ? "12" : "8"}
                    strokeDasharray={`${leftLength} ${circumference}`}
                    strokeDashoffset={leftStrokeDashoffset}
                    strokeLinecap="round"
                    transform="rotate(-90, 50, 50)"
                    onPress={() => toggleGaugeSegment('left')}
                  />
                )}
              </Svg>
              <View style={styles.gaugeTextOverlay}>
                <Text style={styles.gaugeText}>{Math.round(usagePct * 100)}%</Text>
              </View>
            </View>
            
            <View style={styles.gaugeDetails}>
              <TouchableOpacity style={[styles.gaugeRow, selectedGaugeSegment === 'added' && { backgroundColor: colors.financial.walletDepositLight, borderRadius: 6, paddingHorizontal: 4 }]} onPress={() => toggleGaugeSegment('added')}>
                <View style={[styles.gaugeDot, { backgroundColor: colors.financial.walletDeposit }]} />
                <Text style={styles.gaugeLabel}>Added (100%)</Text>
                <Text style={styles.gaugeValue}>{formatAmount(userWallet)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.gaugeRow, selectedGaugeSegment === 'spent' && { backgroundColor: colors.financial.spentLight, borderRadius: 6, paddingHorizontal: 4 }]} onPress={() => toggleGaugeSegment('spent')}>
                <View style={[styles.gaugeDot, { backgroundColor: colors.financial.spent }]} />
                <Text style={styles.gaugeLabel}>Spent ({Math.round(spentPct * 100)}%)</Text>
                <Text style={styles.gaugeValue}>{formatAmount(monthUserSpent)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.gaugeRow, styles.gaugeRowTotal, selectedGaugeSegment === 'left' && { backgroundColor: colors.financial.walletLeftLight, borderRadius: 6, paddingHorizontal: 4 }]} onPress={() => toggleGaugeSegment('left')}>
                <View style={[styles.gaugeDot, { backgroundColor: left >= 0 ? colors.financial.walletLeft : colors.financial.deficit }]} />
                <Text style={styles.gaugeLabel}>Left ({Math.round(leftPct * 100)}%)</Text>
                <Text style={[styles.gaugeValue, { fontWeight: 'bold', color: left >= 0 ? colors.financial.walletLeft : colors.financial.deficit }]}>{formatAmount(left)}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {selectedGaugeSegment === 'added' && (
            <View style={{ backgroundColor: colors.financial.walletDepositLight, borderRadius: 8, padding: 8, marginTop: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: 'bold', color: colors.financial.walletDeposit }}>Total Wallet Balance Added</Text>
              <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.financial.walletDeposit }}>{formatAmount(userWallet)}</Text>
            </View>
          )}

          {selectedGaugeSegment === 'spent' && (
            <View style={{ backgroundColor: colors.financial.spentLight, borderRadius: 8, padding: 8, marginTop: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: 'bold', color: colors.financial.spent }}>Total Amount Spent</Text>
              <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.financial.spent }}>{formatAmount(monthUserSpent)} ({Math.round(spentPct * 100)}% of total wallet)</Text>
            </View>
          )}

          {selectedGaugeSegment === 'left' && (
            <View style={{ backgroundColor: colors.financial.walletLeftLight, borderRadius: 8, padding: 8, marginTop: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: 'bold', color: colors.financial.walletLeft }}>Remaining Wallet Balance</Text>
              <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.financial.walletLeft }}>{formatAmount(left)} ({Math.round(leftPct * 100)}% available)</Text>
            </View>
          )}
        </View>

        {/* Expense History Section (Switchable User vs Team Expenses) */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Expense History</Text>

          {/* Segmented Switch Menu */}
          <View style={styles.historySegmentContainer}>
            <TouchableOpacity 
              style={[styles.historySegmentBtn, historyTab === 'user' && styles.historySegmentBtnActive]}
              onPress={() => handleSwitchHistoryTab('user')}
            >
              <Ionicons 
                name="person" 
                size={13} 
                color={historyTab === 'user' ? '#FFFFFF' : colors.textSecondary} 
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.historySegmentText, historyTab === 'user' && styles.historySegmentTextActive]}>
                {(userName || 'User').split(' ')[0]}'s ({userExpenses.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.historySegmentBtn, historyTab === 'team' && styles.historySegmentBtnActive]}
              onPress={() => handleSwitchHistoryTab('team')}
            >
              <Ionicons 
                name="people" 
                size={13} 
                color={historyTab === 'team' ? '#FFFFFF' : colors.textSecondary} 
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.historySegmentText, historyTab === 'team' && styles.historySegmentTextActive]}>
                Team Expenses ({monthTeamExpenses.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Render List based on Active Tab */}
          {(() => {
            const listToRender = historyTab === 'user' ? userExpenses : monthTeamExpenses;
            const userFirstName = (userName || 'User').split(' ')[0];

            if (listToRender.length === 0) {
              return (
                <Text style={styles.emptyText}>
                  {historyTab === 'user' ? `No expenses logged by ${userFirstName} in this month.` : 'No team expenses logged in this month.'}
                </Text>
              );
            }

            return listToRender.map((exp) => (
              <TouchableOpacity
                key={exp.id}
                style={styles.expenseRow}
                disabled={!isAuthorized}
                onPress={() => {
                  setSelectedExpense(exp);
                  setEditItemName(exp.itemName);
                  setEditQty(exp.quantity.toString());
                  setEditPrice(exp.price.toString());
                  const initialSplit = (exp.splitUserIds && exp.splitUserIds.length > 0) ? exp.splitUserIds : members.map(m => m.id);
                  setEditSplitUserIds(initialSplit);
                  setExpenseModalVisible(true);
                }}
              >
                <View style={styles.expenseMainCol}>
                  <Text style={styles.expenseName}>{exp.itemName}</Text>
                  <Text style={styles.expenseDate}>
                    {formatExactDateTime(exp.date)} · Qty: {exp.quantity} · Paid by <Text style={{ fontWeight: 'bold', color: colors.textPrimary }}>{exp.userName}</Text>
                  </Text>
                  {exp.isEdited && (
                    <Text style={styles.editedLabel}>
                      Edited by {exp.lastEditedBy}{exp.lastEditedAt ? ` at ${formatExactDateTime(exp.lastEditedAt)}` : ''}
                    </Text>
                  )}
                  {exp.receiptImageUrl ? (
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        Alert.alert(
                          'Receipt',
                          'View attached receipt?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'View',
                              onPress: () => {
                                setReceiptPreviewUri(exp.receiptImageUrl!);
                                setReceiptPreviewVisible(true);
                              }
                            }
                          ]
                        );
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}
                    >
                      <Ionicons name="camera" size={11} color={colors.primary} />
                      <Text style={{ fontSize: 10, color: colors.primary, marginLeft: 3, fontWeight: '600' }}>Receipt attached</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={styles.expenseRightCol}>
                  <Text style={styles.expenseAmount}>
                    {formatAmount((Number(exp.price) || 0) * (parseFloat(exp.quantity) || 1))}
                  </Text>
                  {isAuthorized && (
                    <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} style={{ marginLeft: 8 }} />
                  )}
                </View>
              </TouchableOpacity>
            ));
          })()}
        </View>

        {/* Generate Statement */}
        <TouchableOpacity 
          style={styles.statementBtn}
          onPress={async () => {
            if (currentAppUser?.role !== 'admin' && currentAppUser?.id !== userId) {
              Alert.alert('Access Denied', 'Standard members can only generate their own statement.');
              return;
            }
            
            const userObj: any = members.find(m => m.id === userId) || (currentAppUser?.id === userId ? currentAppUser : null);
            if (!userObj) {
              Alert.alert('Error', 'Member details not found.');
              return;
            }

            Alert.alert(
              'Generate Statement',
              'Choose format to download/share:',
              [
                { text: 'Cancel', style: 'cancel' },
                { 
                  text: 'PDF Statement', 
                  onPress: async () => {
                    try {
                      setLoading(true);
                      const uri = await pdfService.generatePdf({
                        users: [userObj as any],
                        expenses: expenses,
                        dateRange: 'All time',
                        teamName: (currentAppUser as any)?.teamName || 'Share Expense',
                        currency: currency,
                        targetUserId: userId,
                        skipShare: true
                      });
                      setTimeout(() => {
                        Alert.alert(
                          'PDF Statement Ready',
                          'What would you like to do?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { 
                              text: 'Save to Device', 
                              onPress: () => pdfService.saveFileToDevice(uri, `Statement_${userObj.name}_${Date.now()}.pdf`, 'application/pdf') 
                            },
                            { 
                              text: 'Share', 
                              onPress: () => pdfService.shareFile(uri, 'application/pdf', 'Share PDF Statement') 
                            }
                          ]
                        );
                      }, 100);
                    } catch (err: any) {
                      Alert.alert('Error', err.message || 'Failed to generate PDF');
                    } finally {
                      setLoading(false);
                    }
                  }
                },
                { 
                  text: 'CSV Statement', 
                  onPress: async () => {
                    try {
                      setLoading(true);
                      const uri = await pdfService.generateCsv({
                        expenses: expenses,
                        currency: currency,
                        targetUserId: userId,
                        skipShare: true
                      });
                      setTimeout(() => {
                        Alert.alert(
                          'CSV Statement Ready',
                          'What would you like to do?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { 
                              text: 'Save to Device', 
                              onPress: () => pdfService.saveFileToDevice(uri, `Statement_${userObj.name}_${Date.now()}.csv`, 'text/csv') 
                            },
                            { 
                              text: 'Share', 
                              onPress: () => pdfService.shareFile(uri, 'text/csv', 'Share CSV Statement') 
                            }
                          ]
                        );
                      }, 100);
                    } catch (err: any) {
                      Alert.alert('Error', err.message || 'Failed to generate CSV');
                    } finally {
                      setLoading(false);
                    }
                  }
                }
              ]
            );
          }}
        >
          <Ionicons name="document-text" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.statementBtnText}>Generate Statement</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Receipt Image Preview Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={receiptPreviewVisible}
        onRequestClose={() => setReceiptPreviewVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => setReceiptPreviewVisible(false)}
            style={{ position: 'absolute', top: 48, right: 20, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: 8 }}
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600', position: 'absolute', top: 54, left: 0, right: 0, textAlign: 'center' }}>Receipt</Text>
          {receiptPreviewUri ? (
            <Image
              source={{ uri: receiptPreviewUri }}
              style={{ width: '90%', height: '75%', borderRadius: 12 }}
              resizeMode="contain"
            />
          ) : null}
        </View>
      </Modal>

      {/* Admin Balance Adjustment Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={adjustModalVisible}
        onRequestClose={() => setAdjustModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { paddingBottom: modalBottomPadding }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Ionicons name="options-outline" size={20} color={colors.primary} style={{ marginRight: 6 }} />
              <Text style={styles.modalTitle}>Adjust Pending Amount</Text>
            </View>
            <Text style={styles.modalSubtitle}>Credit (+) or Debit (-) pending balance for {userName}.</Text>

            {/* Adjustment Type Switcher */}
            <View style={{ flexDirection: 'row', backgroundColor: colors.inputBg, borderRadius: 10, padding: 3, marginBottom: 16, width: '100%' }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 8,
                  alignItems: 'center',
                  backgroundColor: adjustType === 'credit' ? colors.financial.walletDeposit : 'transparent'
                }}
                onPress={() => setAdjustType('credit')}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: adjustType === 'credit' ? '#FFFFFF' : colors.textSecondary }}>
                  + Credit (Add)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 8,
                  alignItems: 'center',
                  backgroundColor: adjustType === 'debit' ? colors.financial.deficit : 'transparent'
                }}
                onPress={() => setAdjustType('debit')}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: adjustType === 'debit' ? '#FFFFFF' : colors.textSecondary }}>
                  - Debit (Deduct)
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput 
              style={[styles.modalInput, adjustError ? { borderColor: colors.error, borderWidth: 1.5 } : null]}
              placeholder="Amount (e.g. 500)"
              placeholderTextColor={colors.textSecondary}
              value={adjustAmountInput}
              onChangeText={(txt) => {
                setAdjustAmountInput(txt);
                if (adjustError) setAdjustError('');
              }}
              keyboardType="numeric"
            />

            <TextInput 
              style={styles.modalInput}
              placeholder="Reason / Note (optional)"
              placeholderTextColor={colors.textSecondary}
              value={adjustReasonInput}
              onChangeText={setAdjustReasonInput}
            />

            {adjustError ? (
              <Text style={{ color: colors.error, fontSize: 11, fontWeight: '600', marginTop: -8, marginBottom: 12, marginLeft: 4 }}>
                {adjustError}
              </Text>
            ) : null}

            <View style={styles.modalBtnRow}>
              <TouchableOpacity 
                style={[styles.modalSubmitBtnSmall, { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setAdjustModalVisible(false)}
              >
                <Text style={[styles.modalSubmitBtnTextSmall, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.modalSubmitBtnSmall, { backgroundColor: adjustType === 'credit' ? colors.financial.walletDeposit : colors.financial.deficit }]}
                onPress={handleAdminAdjustBalance}
              >
                <Text style={[styles.modalSubmitBtnTextSmall, { color: '#FFFFFF' }]}>Apply Adjustment</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Wallet Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={walletModalVisible}
        onRequestClose={() => setWalletModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { paddingBottom: modalBottomPadding }]}>
            <Text style={styles.modalTitle}>Set Wallet Balance</Text>
            <Text style={styles.modalSubtitle}>Specify the total deposit amount in this member's wallet.</Text>

            <TextInput 
              style={[styles.modalInput, walletError ? { borderColor: colors.error, borderWidth: 1.5 } : null]}
              value={walletInput}
              onChangeText={(txt) => {
                setWalletInput(txt);
                if (walletError) setWalletError('');
              }}
              keyboardType="numeric"
            />
            {walletError ? (
              <Text style={{ color: colors.error, fontSize: 11, fontWeight: '600', marginTop: -8, marginBottom: 12, marginLeft: 4 }}>
                {walletError}
              </Text>
            ) : null}

            <View style={styles.modalBtnRow}>
              <TouchableOpacity 
                style={[styles.modalSubmitBtnSmall, { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setWalletModalVisible(false)}
              >
                <Text style={[styles.modalSubmitBtnTextSmall, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.modalSubmitBtnSmall, { backgroundColor: colors.primary }]}
                onPress={handleUpdateWallet}
              >
                <Text style={[styles.modalSubmitBtnTextSmall, { color: '#FFFFFF' }]}>Update Balance</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit/Delete Expense Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={expenseModalVisible}
        onRequestClose={() => {
          setExpenseModalVisible(false);
          setSelectedExpense(null);
        }}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { paddingBottom: modalBottomPadding }]}>
            <Text style={styles.modalTitle}>Modify Expense</Text>
            <Text style={styles.modalSubtitle}>Edit the details of this logged expense.</Text>

            <TextInput 
              style={styles.modalInput}
              placeholder="Item Name"
              placeholderTextColor={colors.textSecondary}
              value={editItemName}
              onChangeText={setEditItemName}
            />

            <View style={{ flexDirection: 'row', width: '100%' }}>
              <TextInput 
                style={[styles.modalInput, { flex: 1, marginRight: 8 }]}
                placeholder="Qty (e.g. 1 kg)"
                placeholderTextColor={colors.textSecondary}
                value={editQty}
                onChangeText={setEditQty}
              />
              <TextInput 
                style={[styles.modalInput, { flex: 2 }]}
                placeholder="Price"
                placeholderTextColor={colors.textSecondary}
                value={editPrice}
                onChangeText={setEditPrice}
                keyboardType="numeric"
              />
            </View>

            {/* Member Selection for Split */}
            {members.length > 0 && (
              <View style={{ width: '100%', marginVertical: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 6 }}>
                  Split Expense Among ({editSplitUserIds.length}/{members.length}):
                </Text>
                <View style={{ gap: 6, maxHeight: 150 }}>
                  <ScrollView nestedScrollEnabled style={{ maxHeight: 140 }}>
                    {members.map((m) => {
                      const isSelected = editSplitUserIds.includes(m.id);
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: isSelected ? colors.primary + '18' : colors.inputBg,
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: isSelected ? colors.primary : colors.border,
                            marginBottom: 4
                          }}
                          onPress={() => {
                            if (isSelected) {
                              if (editSplitUserIds.length === 1) {
                                Alert.alert('Validation Error', 'At least one member must be selected for the expense split.');
                                return;
                              }
                              setEditSplitUserIds(prev => prev.filter(id => id !== m.id));
                            } else {
                              setEditSplitUserIds(prev => [...prev, m.id]);
                            }
                          }}
                        >
                          <Text style={{ flex: 1, fontSize: 12, color: colors.textPrimary, fontWeight: isSelected ? 'bold' : 'normal' }}>
                            {m.name}
                          </Text>
                          <Ionicons 
                            name={isSelected ? "checkbox" : "square-outline"} 
                            size={16} 
                            color={isSelected ? colors.primary : colors.textTertiary} 
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            )}

            {/* Display edit history list */}
            {editHistory.length > 0 && (
              <View style={{ width: '100%', marginTop: 12, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 6 }}>Modification History</Text>
                <ScrollView style={{ maxHeight: 120, width: '100%' }}>
                  {editHistory.map((hist, idx) => {
                    const prev = hist.previousData || {};
                    const curr = hist.newData || {};
                    const histDate = formatExactDateTime(hist.timestamp);

                    const changes: string[] = [];
                    if (prev.itemName && curr.itemName && prev.itemName !== curr.itemName) {
                      changes.push(`Name: "${prev.itemName}" ➔ "${curr.itemName}"`);
                    }
                    if (prev.price !== undefined && curr.price !== undefined && Number(prev.price) !== Number(curr.price)) {
                      changes.push(`Price: ${formatAmount(Number(prev.price))} ➔ ${formatAmount(Number(curr.price))}`);
                    }
                    if (prev.quantity && curr.quantity && prev.quantity !== curr.quantity) {
                      changes.push(`Qty: ${prev.quantity} ➔ ${curr.quantity}`);
                    }
                    if (prev.splitUserIds && curr.splitUserIds && JSON.stringify(prev.splitUserIds) !== JSON.stringify(curr.splitUserIds)) {
                      const prevIds: string[] = prev.splitUserIds || [];
                      const currIds: string[] = curr.splitUserIds || [];
                      const addedIds = currIds.filter(id => !prevIds.includes(id));
                      const removedIds = prevIds.filter(id => !currIds.includes(id));

                      const addedNames = addedIds.map(id => members.find(m => m.id === id)?.name || id).filter(Boolean);
                      const removedNames = removedIds.map(id => members.find(m => m.id === id)?.name || id).filter(Boolean);

                      if (addedNames.length > 0) {
                        changes.push(`Added to split: ${addedNames.join(', ')} (${currIds.length} members total)`);
                      } else if (removedNames.length > 0) {
                        changes.push(`Removed from split: ${removedNames.join(', ')} (${currIds.length} members total)`);
                      } else {
                        changes.push(`Split members: ${prevIds.length} ➔ ${currIds.length} members`);
                      }
                    }

                    const itemName = curr.itemName || prev.itemName || hist.itemName || 'Expense';
                    const qty = curr.quantity || prev.quantity;
                    const priceVal = curr.price !== undefined ? curr.price : prev.price;
                    const priceFormatted = priceVal !== undefined && !isNaN(Number(priceVal)) ? formatAmount(Number(priceVal)) : '';

                    const fallbackText = `${itemName}${qty ? ` (${qty})` : ''}${priceFormatted ? ` - ${priceFormatted}` : ''}`;

                    return (
                      <View key={hist.id || idx} style={{ paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: colors.divider }}>
                        <Text style={{ fontSize: 10, color: colors.textSecondary }}>
                          Modified by {hist.userName} on {histDate}
                        </Text>
                        {changes.length > 0 ? (
                          changes.map((c, i) => (
                            <Text key={i} style={{ fontSize: 11, color: colors.textPrimary, marginTop: 2 }}>
                              • {c}
                            </Text>
                          ))
                        ) : (
                          <Text style={{ fontSize: 11, color: colors.textPrimary, marginTop: 2 }}>
                            {fallbackText}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Action Buttons Row */}
            <View style={styles.modalBtnRow}>
              <TouchableOpacity 
                style={[styles.modalSubmitBtnSmall, { backgroundColor: colors.error }]}
                onPress={handleDeleteExpense}
              >
                <Ionicons name="trash-bin-outline" size={15} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={[styles.modalSubmitBtnTextSmall, { color: '#FFFFFF' }]}>Delete</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.modalSubmitBtnSmall, { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => {
                  setExpenseModalVisible(false);
                  setSelectedExpense(null);
                }}
              >
                <Text style={[styles.modalSubmitBtnTextSmall, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.modalSubmitBtnSmall, { backgroundColor: colors.primary }]}
                onPress={handleEditExpense}
              >
                <Ionicons name="checkmark" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={[styles.modalSubmitBtnTextSmall, { color: '#FFFFFF' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Audit History Modal */}
      <ChangeHistoryModal
        visible={historyModalVisible}
        onClose={() => setHistoryModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backBtn: {
    padding: 6,
    marginRight: 10,
  },
  headerContentHorizontal: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCompact: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginRight: 12,
  },
  avatarCompactImg: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  avatarCompactText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  userNameCompact: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerSelfLabelCompact: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.85)',
    fontStyle: 'italic',
    marginTop: 1,
  },
  monthPillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 16,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginLeft: 8,
  },
  monthPillBtn: {
    padding: 3,
  },
  monthPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    marginHorizontal: 4,
  },
  historySegmentContainer: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 20,
    padding: 3,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historySegmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 17,
  },
  historySegmentBtnActive: {
    backgroundColor: colors.primary,
  },
  historySegmentText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  historySegmentTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  container: {
    padding: 12,
    paddingBottom: 40,
  },
  financeGrid: {
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
  },
  fCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
  },
  fCard2x2: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fValue: {
    fontSize: 14,
    fontWeight: 'bold',
    marginVertical: 2,
  },
  fLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  catBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  catBreakdownNameCol: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  catBreakdownName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  catBreakdownPct: {
    fontSize: 11,
    color: colors.textSecondary,
    marginLeft: 8,
  },
  catBreakdownAmt: {
    fontSize: 13,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  gaugeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gaugeSvg: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginRight: 20,
  },
  gaugeTextOverlay: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gaugeText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  gaugeDetails: {
    flex: 1,
  },
  gaugeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  gaugeRowTotal: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 8,
  },
  gaugeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  gaugeLabel: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
  },
  gaugeValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  expenseMainCol: {
    flex: 1,
  },
  expenseName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  expenseDate: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  editedLabel: {
    fontSize: 9,
    color: '#E65100',
    fontStyle: 'italic',
    marginTop: 2,
  },
  expenseRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expenseAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
    textAlign: 'center',
    paddingVertical: 20,
  },
  statementBtn: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 12,
  },
  statementBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  globalLoader: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 24 : 20,
    alignItems: 'center',
    width: '100%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
    alignSelf: 'flex-start',
  },
  modalSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  modalInput: {
    width: '100%',
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  modalBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 8,
    marginTop: 12,
  },
  modalSubmitBtnSmall: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  modalSubmitBtnTextSmall: {
    fontWeight: '700',
    fontSize: 13,
  },
  modalSubmitBtn: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
  },
  modalSubmitBtnText: {
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontSize: 14,
  },
  modalCancelBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 6,
  },
  modalCancelBtnText: {
    fontWeight: '600',
    color: colors.textSecondary,
    fontSize: 14,
  },
});
