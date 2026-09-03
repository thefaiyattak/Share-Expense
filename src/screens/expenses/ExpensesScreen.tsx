import React, { useState } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  Alert, 
  Share, 
  Modal, 
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Image,
  LayoutAnimation,
  Platform,
  UIManager,
  KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../store/useStore';
import { getThemeColors } from '../../utils/theme';
import { Ionicons } from '@expo/vector-icons';
import { authService } from '../../services/authService';
import { pdfService } from '../../services/pdfService';
import { useNavigation } from '@react-navigation/native';
import Svg, { G, Circle } from 'react-native-svg';
import { calculateIntegerPercentages } from '../../utils/math';
import ChangeHistoryModal from '../../components/ChangeHistoryModal';
import MonthPickerModal from '../../components/MonthPickerModal';
import { useKeyboardVisible } from '../../utils/useKeyboardVisible';
import SettlementModal from '../../components/SettlementModal';
import { settlementService } from '../../services/settlementService';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental && !(globalThis as any).nativeFabricUIManager && !(globalThis as any).__turboModuleProxy) {
  try {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  } catch (e) {}
}

export default function ExpensesScreen() {
  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardVisible();
  const modalBottomPadding = isKeyboardVisible ? 14 : Math.max(insets.bottom + 6, 18);
  const navigation = useNavigation<any>();
  const { currentAppUser, currency, members, expenses, activeTeamId, darkMode } = useStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [settlementModalVisible, setSettlementModalVisible] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);

  // Selected Month State
  const [selectedMonthDate, setSelectedMonthDate] = useState<Date>(() => new Date());

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

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const colors = getThemeColors(darkMode);
  const styles = getStyles(colors, darkMode);

  const isAdmin = currentAppUser?.role === 'admin';

  // User join date restriction logic
  const userJoinDate = React.useMemo(() => {
    if (!currentAppUser?.createdAt) return new Date(0);
    const d = typeof (currentAppUser.createdAt as any)?.toDate === 'function'
      ? (currentAppUser.createdAt as any).toDate()
      : new Date(currentAppUser.createdAt);
    return isNaN(d.getTime()) ? new Date(0) : d;
  }, [currentAppUser?.createdAt]);

  const selectedMonthStart = React.useMemo(() => {
    return new Date(selectedMonthDate.getFullYear(), selectedMonthDate.getMonth(), 1, 0, 0, 0);
  }, [selectedMonthDate]);

  const selectedMonthEnd = React.useMemo(() => {
    return new Date(selectedMonthDate.getFullYear(), selectedMonthDate.getMonth() + 1, 0, 23, 59, 59);
  }, [selectedMonthDate]);

  const visibleExpenses = React.useMemo(() => {
    return expenses.filter(e => {
      const d = new Date(e.date);
      return d >= selectedMonthStart && d <= selectedMonthEnd;
    });
  }, [expenses, selectedMonthStart, selectedMonthEnd]);

  const currentMonthKey = React.useMemo(() => {
    return `${selectedMonthDate.getFullYear()}-${String(selectedMonthDate.getMonth() + 1).padStart(2, '0')}`;
  }, [selectedMonthDate]);

  const getMemberCurrentMonthWallet = React.useCallback((m: any) => {
    if (m?.monthlyWallets && m.monthlyWallets[currentMonthKey] !== undefined) {
      return m.monthlyWallets[currentMonthKey];
    }
    if (currentMonthKey === '2026-08' && (!m?.monthlyWallets || Object.keys(m.monthlyWallets).length === 0)) {
      return m?.walletBalance || 0;
    }
    return 0;
  }, [currentMonthKey]);

  // Dynamic calculations
  const totalWallet = React.useMemo(() => {
    return members.reduce((sum, m) => sum + getMemberCurrentMonthWallet(m), 0);
  }, [members, getMemberCurrentMonthWallet]);
  
  // Calculate total spent by each user in a single pass
  const { memberSpentMap, totalSpent } = React.useMemo(() => {
    const map: Record<string, number> = {};
    members.forEach(m => { map[m.id] = 0; });
    visibleExpenses.forEach(e => {
      if (map[e.userId] !== undefined) {
        const p = Number(e.price) || 0;
        const q = parseFloat(e.quantity) || 1;
        map[e.userId] += (p * q);
      }
    });
    const spent = Object.values(map).reduce((sum, val) => sum + val, 0);
    return { memberSpentMap: map, totalSpent: spent };
  }, [members, visibleExpenses]);

  const totalLeft = React.useMemo(() => totalWallet - totalSpent, [totalWallet, totalSpent]);

  // Calculate dynamic split shares
  const memberIds = React.useMemo(() => members.map(m => m.id), [members]);
  const shares = React.useMemo(() => {
    if (memberIds.length === 0) return {};
    return require('../../services/expenseService').expenseService.calculateShares({
      expenses: visibleExpenses,
      attendance: [],
      allIds: memberIds
    });
  }, [visibleExpenses, memberIds]);

  const settlementSummary = React.useMemo(() => {
    return settlementService.calculateSettlement({
      members,
      memberSpentMap,
      shares,
      monthKey: currentMonthKey,
    });
  }, [members, memberSpentMap, shares, currentMonthKey]);

  const handleShareTeamId = () => {
    if (activeTeamId) {
      Share.share({
        message: `Join my team on Share Expense!\nTeam ID: ${activeTeamId}`,
      });
    }
  };

  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');

  const handleAddMember = async () => {
    let hasErr = false;
    if (!newMemberName.trim()) {
      setNameError('Name is required');
      hasErr = true;
    }
    if (!newMemberEmail.trim()) {
      setEmailError('Email is required');
      hasErr = true;
    } else if (!newMemberEmail.includes('@')) {
      setEmailError('Enter a valid email address');
      hasErr = true;
    }

    if (hasErr || !activeTeamId) return;

    setModalVisible(false);
    setAdding(true);
    try {
      await authService.addMemberByEmail({
        email: newMemberEmail.trim(),
        name: newMemberName.trim(),
        teamId: activeTeamId,
      });
      Alert.alert('Success', `${newMemberName} has been added!`);
      setNewMemberName('');
      setNewMemberEmail('');
      setNameError('');
      setEmailError('');
    } catch (e: any) {
      setEmailError(e.message || 'Failed to add member.');
    } finally {
      setAdding(false);
    }
  };

  const handleExportPdf = async () => {
    if (!currentAppUser) return;
    
    const selectedMonthLabel = selectedMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const runPdfExport = async (targetUserId?: string, userList?: any[]) => {
      try {
        const uri = await pdfService.generatePdf({
          users: userList || members,
          expenses: visibleExpenses,
          dateRange: selectedMonthLabel,
          teamName: (currentAppUser as any)?.teamName || 'Share Expense',
          currency,
          targetUserId,
          skipShare: true,
          monthKey: currentMonthKey
        });
        const reportLabel = targetUserId ? `Individual_${targetUserId}` : 'Collective';
        setTimeout(() => {
          Alert.alert(
            'PDF Statement Ready',
            'What would you like to do?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Save to Device',
                onPress: () => pdfService.saveFileToDevice(uri, `ShareExpense_${reportLabel}_${currentMonthKey}.pdf`, 'application/pdf')
              },
              {
                text: 'Share',
                onPress: () => pdfService.shareFile(uri, 'application/pdf', 'Share PDF Statement')
              }
            ]
          );
        }, 100);
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed to generate PDF');
      }
    };

    if (currentAppUser.role === 'admin') {
      Alert.alert(
        'Export PDF Statement',
        `Choose report scope for ${selectedMonthLabel}:`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Collective Report', 
            onPress: () => runPdfExport() 
          },
          { 
            text: 'My Own Report', 
            onPress: () => runPdfExport(currentAppUser.id, [currentAppUser]) 
          },
          { 
            text: 'Member Report...', 
            onPress: () => {
              const otherMembers = members.filter(m => m.id !== currentAppUser.id);
              if (otherMembers.length === 0) {
                Alert.alert('Info', 'No other group members found.');
                return;
              }
              const buttons = otherMembers.slice(0, 5).map(m => ({
                text: m.name,
                onPress: () => runPdfExport(m.id, [m])
              }));
              buttons.push({ text: 'Cancel', style: 'cancel' } as any);
              Alert.alert('Select Member', 'Choose a member to export:', buttons as any);
            }
          }
        ]
      );
    } else {
      await runPdfExport(currentAppUser.id, [currentAppUser]);
    }
  };

  const handleExportCsv = async () => {
    if (!currentAppUser) return;
    const selectedMonthLabel = selectedMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    const runCsvExport = async (targetUserId?: string) => {
      try {
        const uri = await pdfService.generateCsv({
          expenses: visibleExpenses,
          dateRange: selectedMonthLabel,
          teamName: (currentAppUser as any)?.teamName || 'Share Expense',
          currency,
          targetUserId,
          skipShare: true
        });
        const reportLabel = targetUserId ? `Individual_${targetUserId}` : 'Collective';
        setTimeout(() => {
          Alert.alert(
            'CSV Report Ready',
            'What would you like to do?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Save to Device',
                onPress: () => pdfService.saveFileToDevice(uri, `ShareExpense_${reportLabel}_${currentMonthKey}.csv`, 'text/csv')
              },
              {
                text: 'Share',
                onPress: () => pdfService.shareFile(uri, 'text/csv', 'Share CSV Report')
              }
            ]
          );
        }, 100);
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed to export CSV');
      }
    };

    if (currentAppUser.role === 'admin') {
      Alert.alert(
        'Export CSV Report',
        'Choose report type:',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Collective Report', 
            onPress: () => runCsvExport() 
          },
          { 
            text: 'My Own Report', 
            onPress: () => runCsvExport(currentAppUser.id) 
          },
          { 
            text: 'Member Report...', 
            onPress: () => {
              const otherMembers = members.filter(m => m.id !== currentAppUser.id);
              if (otherMembers.length === 0) {
                Alert.alert('Info', 'No other group members found.');
                return;
              }
              const buttons = otherMembers.slice(0, 5).map(m => ({
                text: m.name,
                onPress: () => runCsvExport(m.id)
              }));
              buttons.push({ text: 'Cancel', style: 'cancel' } as any);
              Alert.alert('Select Member', 'Choose a member to export:', buttons as any);
            }
          }
        ]
      );
    } else {
      await runCsvExport(currentAppUser.id);
    }
  };

  const toggleMemberSelection = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedMemberId(prev => prev === id ? null : id);
  };

  const formatAmount = (val: number) => {
    return `${currency} ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(val)}`;
  };

  // Render a custom visual SVG Pie / Donut Chart for distribution
  const renderPieChart = () => {
    if (totalSpent === 0) return null;
    let accumulatedPercent = 0;
    const radius = 35;
    const circumference = 2 * Math.PI * radius;

    const memberPctMap = calculateIntegerPercentages(members, m => memberSpentMap[m.id] || 0);

    const selectedMember = members.find(m => m.id === selectedMemberId);
    const selectedSpent = selectedMember ? (memberSpentMap[selectedMember.id] || 0) : 0;
    const selectedPct = selectedMember ? (memberPctMap[selectedMember.id] || 0) : 0;

    return (
      <View style={styles.chartCard}>
        <View style={styles.cardHeaderRow}>
          <View>
            <Text style={styles.chartTitle}>Spending distribution</Text>
            <Text style={styles.chartSubHint}>Tap any slice or member to inspect</Text>
          </View>
          <View style={styles.headerIconBadge}>
            <Ionicons name="pie-chart" size={16} color={colors.primary} />
          </View>
        </View>

        <View style={styles.chartContent}>
          <View style={styles.pieContainer}>
            <View style={{ position: 'relative', width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
              <Svg height="120" width="120" viewBox="0 0 100 100">
                <G transform="rotate(-90, 50, 50)">
                  {members.map((m, idx) => {
                    const spent = memberSpentMap[m.id] || 0;
                    const percent = totalSpent > 0 ? spent / totalSpent : 0;
                    if (percent === 0) return null;

                    const strokeDashoffset = circumference - percent * circumference;
                    const rotation = accumulatedPercent * 360;
                    accumulatedPercent += percent;
                    const colorPalette = ['#4CAF50', '#E65100', '#1565C0', '#C62828', '#9C27B0'];
                    const color = colorPalette[idx % colorPalette.length];
                    const isSelected = selectedMemberId === m.id;

                    return (
                      <Circle
                        key={m.id}
                        cx="50"
                        cy="50"
                        r={radius}
                        fill="transparent"
                        stroke={color}
                        strokeWidth={isSelected ? "18" : "13"}
                        strokeDasharray={`${circumference} ${circumference}`}
                        strokeDashoffset={strokeDashoffset}
                        transform={`rotate(${rotation}, 50, 50)`}
                        onPress={() => toggleMemberSelection(m.id)}
                      />
                    );
                  })}
                </G>
              </Svg>

              <View style={styles.donutCenterOverlay} pointerEvents="none">
                <Text style={styles.donutCenterLabel}>{selectedMember ? selectedMember.name.split(' ')[0].toUpperCase() : 'TOTAL'}</Text>
                <Text style={styles.donutCenterVal} numberOfLines={1}>{formatAmount(selectedMember ? selectedSpent : totalSpent)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.chartLegend}>
            {members.map((m, idx) => {
              const pct = memberPctMap[m.id] || 0;
              const colorPalette = ['#4CAF50', '#E65100', '#1565C0', '#C62828', '#9C27B0'];
              const color = colorPalette[idx % colorPalette.length];
              const isSelected = selectedMemberId === m.id;

              return (
                <TouchableOpacity 
                  key={m.id} 
                  style={[styles.legendRow, isSelected && { backgroundColor: color + '14', borderRadius: 8, paddingHorizontal: 6 }]}
                  onPress={() => toggleMemberSelection(m.id)}
                >
                  <View style={[styles.legendDot, { backgroundColor: color }]} />
                  <Text style={[styles.legendText, isSelected && { fontWeight: 'bold', color }]} numberOfLines={1}>{m.name}</Text>
                  <Text style={styles.legendAmt}>{pct}%</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {selectedMember && (
          <View style={[styles.interactiveCalloutCard, { borderColor: colors.primary }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.textPrimary }}>{selectedMember.name}</Text>
              <Text style={{ fontSize: 15, fontWeight: 'bold', color: colors.primary }}>{formatAmount(selectedSpent)}</Text>
            </View>
            <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 3 }}>
              {selectedPct}% of Total Team Spending ({formatAmount(totalSpent)})
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView 
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
            progressBackgroundColor={colors.surface}
          />
        }
      >
        {/* Modern Header Bar with Month Selector */}
        <View style={styles.headerBar}>
          <Text style={styles.screenHeader}>Expenses</Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* Month Selector Pill */}
            <View style={styles.monthPillContainer}>
              <TouchableOpacity onPress={handlePrevMonth} style={styles.monthPillBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="chevron-back" size={15} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMonthPickerVisible(true)} style={styles.monthPillCenterBtn}>
                <Ionicons name="calendar-outline" size={13} color={colors.primary} style={{ marginRight: 4 }} />
                <Text style={styles.monthPillText}>
                  {selectedMonthDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleNextMonth} style={styles.monthPillBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="chevron-forward" size={15} color={colors.primary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={styles.historyBtnPill}
              onPress={() => setHistoryModalVisible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="time-outline" size={15} color={colors.primary} style={{ marginRight: 4 }} />
              <Text style={styles.historyBtnText}>History</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Collective Wallet Hero Card */}
        <View style={styles.summaryCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={styles.summarySub}>Collective Wallet Deposit</Text>
              <Text style={styles.summaryVal}>{formatAmount(totalWallet)}</Text>
            </View>
            <View style={styles.summaryIconBadge}>
              <Ionicons name="wallet" size={20} color="#FFFFFF" />
            </View>
          </View>
          
          <View style={styles.summaryChipsRow}>
            <View style={[styles.summaryChip, { backgroundColor: '#D32F2F' }]}>
              <Ionicons name="trending-down" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
              <View style={styles.summaryChipTextCol}>
                <Text style={styles.summaryChipLabel}>Spent</Text>
                <Text style={styles.summaryChipVal}>{formatAmount(totalSpent)}</Text>
              </View>
            </View>

            <View style={[styles.summaryChip, { backgroundColor: '#F57F17' }]}>
              <Ionicons name="wallet-outline" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
              <View style={styles.summaryChipTextCol}>
                <Text style={styles.summaryChipLabel}>Left</Text>
                <Text style={styles.summaryChipVal}>{formatAmount(totalLeft)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Admin Team controls */}
        {isAdmin && activeTeamId && (
          <View style={styles.adminControlBox}>
            <View style={styles.teamIdBox}>
              <View style={styles.teamIdIconCircle}>
                <Ionicons name="key-outline" size={18} color="#E65100" />
              </View>
              <View style={styles.teamIdTextCol}>
                <Text style={styles.teamIdLabel}>Team ID (Invite Code)</Text>
                <Text style={styles.teamIdVal}>{activeTeamId}</Text>
              </View>
              <TouchableOpacity onPress={handleShareTeamId} style={styles.shareButton}>
                <Ionicons name="share-social-outline" size={18} color="#E65100" />
              </TouchableOpacity>
            </View>

            <View style={styles.adminActionRow}>
              <TouchableOpacity 
                style={styles.adminBtn}
                onPress={() => setModalVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="person-add-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.adminBtnText}>Add Member</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Chart View */}
        {renderPieChart()}

        {/* Members Section */}
        <View style={styles.membersSectionHeader}>
          <Text style={styles.membersSectionTitle}>Members</Text>
          <View style={styles.membersCountBadge}>
            <Text style={styles.membersCountText}>{members.length} member(s)</Text>
          </View>
        </View>

        {members.map((m, idx) => {
          const spent = memberSpentMap[m.id] || 0;
          const share = shares[m.id] || 0;
          const wallet = getMemberCurrentMonthWallet(m);
          
          const totalContribution = wallet + spent;
          const netPosition = totalContribution - share;
          
          let displayBalance = 0;
          let isPositive = false;

          if (netPosition >= 0) {
            isPositive = true;
            displayBalance = netPosition;
          } else {
            isPositive = false;
            displayBalance = Math.abs(netPosition);
          }

          const badgeBgColor = isPositive ? colors.financial.walletDepositLight : colors.financial.deficitLight;
          const badgeTextColor = isPositive ? colors.financial.walletDeposit : colors.financial.deficit;
          const initials = m.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

          const cardColors = ['#E8F5E9', '#FFF3E0', '#E3F2FD', '#FCE4EC', '#F3E5F5'];
          const textColors = [colors.primaryDark, '#E65100', '#1565C0', '#C62828', '#8E24AA'];

          const avatarBg = cardColors[idx % cardColors.length];
          const avatarText = textColors[idx % textColors.length];

          const progressVal = wallet > 0 ? Math.min(share / wallet, 1) : (share > 0 ? 1 : 0);

          let displayName = m.name;
          if (m.deleted && m.deleteAt) {
            const deleteAtDate = m.deleteAt.toDate ? m.deleteAt.toDate() : new Date(m.deleteAt);
            const remainingDays = Math.ceil((deleteAtDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            if (remainingDays > 0) {
              displayName = `${m.name} (Deleting in ${remainingDays}d)`;
            }
          }

          return (
            <TouchableOpacity 
              key={m.id} 
              style={styles.memberCard}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('UserDetail', { 
                userId: m.id,
                userName: displayName, 
                userInitials: initials, 
                spent, 
                wallet, 
                balance: isPositive ? displayBalance : -displayBalance,
                avatarBg,
                avatarText,
                profileImageUrl: m.profileImageUrl,
                initialMonthDate: selectedMonthDate.toISOString()
              })}
            >
              <View style={styles.memberMainRow}>
                <View style={[styles.avatar, { backgroundColor: avatarBg, overflow: 'hidden' }]}>
                  {m.profileImageUrl ? (
                    <Image source={{ uri: m.profileImageUrl }} style={{ width: '100%', height: '100%', borderRadius: 20 }} />
                  ) : (
                    <Text style={[styles.avatarText, { color: avatarText }]}>{initials}</Text>
                  )}
                </View>
                
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{displayName}</Text>
                  <Text style={styles.memberSubInfo}>
                    Share: <Text style={{ color: colors.financial.calculatedShare, fontWeight: '700' }}>{formatAmount(share)}</Text>  ·  Wallet: <Text style={{ color: colors.financial.walletDeposit, fontWeight: '700' }}>{formatAmount(wallet)}</Text>
                  </Text>
                </View>

                <View style={[styles.balanceBadge, { backgroundColor: badgeBgColor }]}>
                  <Ionicons name={isPositive ? "arrow-up" : "arrow-down"} size={12} color={badgeTextColor} />
                  <Text style={[styles.balanceText, { color: badgeTextColor }]}>
                    {isPositive ? '+' : '-'} {formatAmount(displayBalance)}
                  </Text>
                </View>
              </View>

              {/* Budget Progress Bar / Net Status Indicator */}
              <View style={styles.progressBarBg}>
                <View style={[
                  styles.progressBarFill, 
                  { 
                    width: '100%',
                    backgroundColor: badgeTextColor 
                  }
                ]} />
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Settlement Plan Button */}
        <TouchableOpacity 
          style={styles.settlementBannerBtn} 
          onPress={() => setSettlementModalVisible(true)}
          activeOpacity={0.85}
        >
          <View style={styles.settlementBannerIconCircle}>
            <Ionicons name="git-network-outline" size={20} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.settlementBannerTitle}>Settlement Plan</Text>
            <Text style={styles.settlementBannerSubtitle}>
              Wallet Pool Refunds · Direct Peer-to-Peer Settlement
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </TouchableOpacity>

        {/* Document Exporting Buttons */}
        <View style={styles.exportRow}>
          <TouchableOpacity style={styles.exportBtn} onPress={handleExportPdf} activeOpacity={0.8}>
            <Ionicons name="document-text-outline" size={18} color={colors.primary} style={{ marginRight: 6 }} />
            <Text style={styles.exportBtnText}>PDF Report</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.exportBtn} onPress={handleExportCsv} activeOpacity={0.8}>
            <Ionicons name="download-outline" size={18} color={colors.primary} style={{ marginRight: 6 }} />
            <Text style={styles.exportBtnText}>CSV Report</Text>
          </TouchableOpacity>
        </View>

        {/* Add Member Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}
        >
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <View style={[styles.modalContent, { paddingBottom: modalBottomPadding }]}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Add member</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalSubHint}>Enter member name and email to add to team.</Text>

              <TextInput 
                style={[styles.modalInput, nameError ? { borderColor: colors.error, borderWidth: 1.5 } : null]}
                placeholder="Member name"
                placeholderTextColor={colors.textSecondary}
                value={newMemberName}
                onChangeText={(txt) => {
                  setNewMemberName(txt);
                  if (nameError) setNameError('');
                }}
              />
              {nameError ? (
                <Text style={{ color: colors.error, fontSize: 11, fontWeight: '600', marginTop: -8, marginBottom: 12, marginLeft: 4 }}>
                  {nameError}
                </Text>
              ) : null}

              <TextInput 
                style={[styles.modalInput, emailError ? { borderColor: colors.error, borderWidth: 1.5 } : null]}
                placeholder="Member email"
                placeholderTextColor={colors.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                value={newMemberEmail}
                onChangeText={(txt) => {
                  setNewMemberEmail(txt);
                  if (emailError) setEmailError('');
                }}
              />
              {emailError ? (
                <Text style={{ color: colors.error, fontSize: 11, fontWeight: '600', marginTop: -8, marginBottom: 12, marginLeft: 4 }}>
                  {emailError}
                </Text>
              ) : null}

              <View style={styles.modalBtnRow}>
                <TouchableOpacity 
                  style={[styles.modalSubmitBtnSmall, { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border }]} 
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={[styles.modalSubmitBtnTextSmall, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.modalSubmitBtnSmall, { backgroundColor: colors.primary }]} 
                  onPress={handleAddMember}
                  disabled={adding}
                >
                  {adding ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={[styles.modalSubmitBtnTextSmall, { color: '#FFFFFF' }]}>Add Member</Text>
                  )}
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

        {/* Smart Settlement Modal */}
        <SettlementModal
          visible={settlementModalVisible}
          onClose={() => setSettlementModalVisible(false)}
          teamName={(currentAppUser as any)?.teamName || (activeTeamId ? `Group (${activeTeamId})` : 'Group')}
          currency={currency}
          modalBottomPadding={modalBottomPadding}
          initialMonthDate={selectedMonthDate}
        />

        {/* Month Picker Modal */}
        <MonthPickerModal
          visible={monthPickerVisible}
          selectedDate={selectedMonthDate}
          onSelect={(d) => {
            setSelectedMonthDate(d);
            setMonthPickerVisible(false);
          }}
          onClose={() => setMonthPickerVisible(false)}
          darkMode={darkMode}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: any, darkMode: boolean) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  screenHeader: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  monthPillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 16,
    paddingHorizontal: 4,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  monthPillBtn: {
    paddingHorizontal: 5,
    paddingVertical: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthPillCenterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  monthPillText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  historyBtnPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  historyBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.primary,
  },
  summaryCard: {
    padding: 14,
    backgroundColor: '#1B5E20',
    borderRadius: 16,
    marginBottom: 14,
    elevation: 3,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  summarySub: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '600',
  },
  summaryVal: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 2,
  },
  summaryIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  summaryChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  summaryChipTextCol: {
    flex: 1,
  },
  summaryChipLabel: {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
  },
  summaryChipVal: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 1,
  },
  adminControlBox: {
    backgroundColor: colors.cardBg,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  teamIdBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamIdIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(230, 81, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  teamIdTextCol: {
    flex: 1,
    marginLeft: 10,
  },
  teamIdLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#E65100',
  },
  teamIdVal: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginTop: 1,
  },
  shareButton: {
    padding: 6,
  },
  adminActionRow: {
    marginTop: 10,
  },
  adminBtn: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  adminBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  chartCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  chartSubHint: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 2,
  },
  headerIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pieContainer: {
    marginRight: 16,
  },
  donutCenterOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
  },
  donutCenterLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: colors.textTertiary,
  },
  donutCenterVal: {
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginTop: 1,
  },
  chartLegend: {
    flex: 1,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    marginRight: 8,
  },
  legendText: {
    flex: 1,
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  legendAmt: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.textSecondary,
  },
  interactiveCalloutCard: {
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    borderWidth: 1.5,
  },
  membersSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  membersSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  membersCountBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  membersCountText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.primaryDark,
  },
  memberCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  memberMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  memberSubInfo: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  balanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  balanceText: {
    fontSize: 11,
    fontWeight: 'bold',
    marginLeft: 2,
  },
  progressBarBg: {
    height: 5,
    backgroundColor: colors.border,
    borderRadius: 2.5,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2.5,
  },
  settlementBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBg,
    borderRadius: 16,
    padding: 14,
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: colors.primary + '40',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  settlementBannerIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settlementBannerTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  settlementBannerPill: {
    backgroundColor: colors.primary + '18',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 6,
  },
  settlementBannerPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  settlementBannerSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  exportRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 10,
  },
  exportBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 44,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.cardBg,
  },
  exportBtnText: {
    color: colors.primary,
    fontWeight: 'bold',
    fontSize: 13,
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
    width: '100%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  modalSubHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 12,
    width: '100%',
  },
  modalBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 10,
    marginTop: 8,
  },
  modalSubmitBtnSmall: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  modalSubmitBtnTextSmall: {
    fontWeight: '700',
    fontSize: 13,
  },
});
