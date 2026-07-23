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
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../../store/useStore';
import { getThemeColors } from '../../utils/theme';
import { Ionicons } from '@expo/vector-icons';
import { authService } from '../../services/authService';
import { pdfService } from '../../services/pdfService';
import { useNavigation } from '@react-navigation/native';
import Svg, { G, Circle } from 'react-native-svg';

export default function ExpensesScreen() {
  const navigation = useNavigation<any>();
  const { currentAppUser, currency, members, expenses, activeTeamId, darkMode } = useStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const colors = getThemeColors(darkMode);
  const styles = getStyles(colors);

  const isAdmin = currentAppUser?.role === 'admin';

  // Dynamic calculations
  const totalWallet = members.reduce((sum, m) => sum + m.walletBalance, 0);
  
  // Calculate total spent by each user
  const memberSpentMap: Record<string, number> = {};
  members.forEach(m => {
    memberSpentMap[m.id] = expenses
      .filter(e => e.userId === m.id)
      .reduce((sum, e) => sum + e.price, 0);
  });

  const totalSpent = Object.values(memberSpentMap).reduce((sum, val) => sum + val, 0);
  const totalLeft = totalWallet - totalSpent;

  // Calculate dynamic split shares
  const memberIds = members.map(m => m.id);
  const shares = memberIds.length > 0 ? require('../../services/expenseService').expenseService.calculateShares({
    expenses: expenses,
    attendance: [], // simple fallback
    allIds: memberIds
  }) : {};

  const handleShareTeamId = () => {
    if (activeTeamId) {
      Share.share({
        message: `Join my team on Share Expense!\nTeam ID: ${activeTeamId}`,
      });
    }
  };

  const handleAddMember = async () => {
    if (!newMemberName.trim() || !newMemberEmail.trim()) {
      Alert.alert('Validation Error', 'Please fill in both name and email.');
      return;
    }
    if (!activeTeamId) return;

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
      setModalVisible(false);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add member.');
    } finally {
      setAdding(false);
    }
  };

  const handleExportPdf = async () => {
    if (!currentAppUser) return;
    
    const runPdfExport = async (targetUserId?: string, userList?: any[]) => {
      try {
        const uri = await pdfService.generatePdf({
          users: userList || members,
          expenses: expenses,
          dateRange: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
          teamName: currentAppUser.teamName || 'Share Expense',
          currency,
          targetUserId,
          skipShare: true
        });

        const reportName = targetUserId 
          ? `Statement_${(userList || members).find(u => u.id === targetUserId)?.name || targetUserId}`
          : 'Statement_Collective';

        setTimeout(() => {
          Alert.alert(
            'PDF Report Ready',
            'What would you like to do?',
            [
              { text: 'Cancel', style: 'cancel' },
              { 
                text: 'Save to Device', 
                onPress: () => pdfService.saveFileToDevice(uri, `${reportName}_${Date.now()}.pdf`, 'application/pdf') 
              },
              { 
                text: 'Share', 
                onPress: () => pdfService.shareFile(uri, 'application/pdf', 'Share PDF Statement') 
              }
            ]
          );
        }, 100);
      } catch (e: any) {
        Alert.alert('PDF Export Failed', e.message);
      }
    };

    if (currentAppUser.role === 'admin') {
      Alert.alert(
        'Export PDF Report',
        'Choose report type:',
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

    const runCsvExport = async (targetUserId?: string) => {
      try {
        const uri = await pdfService.generateCsv({
          expenses: expenses,
          currency,
          targetUserId,
          skipShare: true
        });

        const reportName = targetUserId
          ? `Statement_${members.find(u => u.id === targetUserId)?.name || targetUserId}`
          : 'Statement_Collective';

        setTimeout(() => {
          Alert.alert(
            'CSV Report Ready',
            'What would you like to do?',
            [
              { text: 'Cancel', style: 'cancel' },
              { 
                text: 'Save to Device', 
                onPress: () => pdfService.saveFileToDevice(uri, `${reportName}_${Date.now()}.csv`, 'text/csv') 
              },
              { 
                text: 'Share', 
                onPress: () => pdfService.shareFile(uri, 'text/csv', 'Share CSV Statement') 
              }
            ]
          );
        }, 100);
      } catch (e: any) {
        Alert.alert('CSV Export Failed', e.message);
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

  const formatAmount = (val: number) => {
    return `${currency} ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(val)}`;
  };

  // Render a custom visual SVG Pie Chart for distribution
  const renderPieChart = () => {
    if (totalSpent === 0) return null;
    let accumulatedPercent = 0;
    const radius = 35;
    const circumference = 2 * Math.PI * radius;

    return (
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Spending distribution</Text>
        <View style={styles.chartContent}>
          <View style={styles.pieContainer}>
            <Svg height="120" width="120" viewBox="0 0 100 100">
              <G transform="rotate(-90, 50, 50)">
                {members.map((m, idx) => {
                  const spent = memberSpentMap[m.id] || 0;
                  const percent = spent / totalSpent;
                  if (percent === 0) return null;

                  const strokeDashoffset = circumference - percent * circumference;
                  const rotation = accumulatedPercent * 360;
                  accumulatedPercent += percent;

                  const colorPalette = ['#4CAF50', '#E65100', '#1565C0', '#C62828', '#9C27B0'];
                  const color = colorPalette[idx % colorPalette.length];

                  return (
                    <Circle
                      key={m.id}
                      cx="50"
                      cy="50"
                      r={radius}
                      fill="transparent"
                      stroke={color}
                      strokeWidth="15"
                      strokeDasharray={`${circumference} ${circumference}`}
                      strokeDashoffset={strokeDashoffset}
                      transform={`rotate(${rotation}, 50, 50)`}
                    />
                  );
                })}
              </G>
            </Svg>
          </View>
          <View style={styles.chartLegend}>
            {members.map((m, idx) => {
              const spent = memberSpentMap[m.id] || 0;
              const pct = totalSpent > 0 ? Math.round((spent / totalSpent) * 100) : 0;
              const colorPalette = ['#4CAF50', '#E65100', '#1565C0', '#C62828', '#9C27B0'];
              const color = colorPalette[idx % colorPalette.length];

              return (
                <View key={m.id} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: color }]} />
                  <Text style={styles.legendText} numberOfLines={1}>{m.name}</Text>
                  <Text style={styles.legendAmt}>{pct}%</Text>
                </View>
              );
            })}
          </View>
        </View>
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
          />
        }
      >
        <Text style={styles.screenHeader}>Expenses</Text>

        {/* Collective Wallet Card */}
        <View style={styles.summaryCard}>
          <Text style={styles.summarySub}>Collective Wallet</Text>
          <Text style={styles.summaryVal}>{formatAmount(totalWallet)}</Text>
          
          <View style={styles.summaryChipsRow}>
            <View style={styles.summaryChip}>
              <Ionicons name="trending-down" size={16} color="#FFFFFF" />
              <View style={styles.summaryChipTextCol}>
                <Text style={styles.summaryChipLabel}>Spent</Text>
                <Text style={styles.summaryChipVal}>{formatAmount(totalSpent)}</Text>
              </View>
            </View>

            <View style={styles.summaryChip}>
              <Ionicons name="wallet-outline" size={16} color="#FFFFFF" />
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
              <Ionicons name="key-outline" size={20} color="#E65100" />
              <View style={styles.teamIdTextCol}>
                <Text style={styles.teamIdLabel}>Team ID</Text>
                <Text style={styles.teamIdVal}>{activeTeamId}</Text>
              </View>
              <TouchableOpacity onPress={handleShareTeamId} style={styles.shareButton}>
                <Ionicons name="share-social-outline" size={20} color="#E65100" />
              </TouchableOpacity>
            </View>

            <View style={styles.adminActionRow}>
              <TouchableOpacity 
                style={styles.adminBtn}
                onPress={() => setModalVisible(true)}
              >
                <Ionicons name="person-add-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.adminBtnText}>Add Member</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Chart View */}
        {renderPieChart()}

        {/* Members List */}
        <View style={styles.membersSectionHeader}>
          <Text style={styles.membersSectionTitle}>Members</Text>
          <Text style={styles.membersCount}>{members.length} people</Text>
        </View>

        {members.map((m, idx) => {
          const spent = memberSpentMap[m.id] || 0;
          const share = shares[m.id] || 0;
          const bal = spent - share;
          const over = bal >= 0;
          const bColor = over ? colors.primary : colors.error;
          const initials = m.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

          const cardColors = ['#E8F5E9', '#FFF3E0', '#E3F2FD', '#FCE4EC', '#F3E5F5'];
          const textColors = [colors.primaryDark, '#E65100', '#1565C0', '#C62828', '#8E24AA'];

          const avatarBg = cardColors[idx % cardColors.length];
          const avatarText = textColors[idx % textColors.length];

          const progressVal = m.walletBalance > 0 ? Math.min(spent / m.walletBalance, 1) : 0;

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
              onPress={() => navigation.navigate('UserDetail', { 
                userId: m.id,
                userName: displayName, 
                userInitials: initials, 
                spent, 
                wallet: m.walletBalance, 
                balance: bal,
                avatarBg,
                avatarText,
                profileImageUrl: m.profileImageUrl
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
                    Spent: {formatAmount(spent)}  |  Wallet: {formatAmount(m.walletBalance)}
                  </Text>
                </View>

                <View style={[styles.balanceBadge, { backgroundColor: bColor + '19' }]}>
                  <Ionicons name={over ? "arrow-up" : "arrow-down"} size={12} color={bColor} />
                  <Text style={[styles.balanceText, { color: bColor }]}>
                    {over ? '+' : '-'} {formatAmount(Math.abs(bal))}
                  </Text>
                </View>
              </View>

              {/* Budget Progress Bar */}
              <View style={styles.progressBarBg}>
                <View style={[
                  styles.progressBarFill, 
                  { 
                    width: `${progressVal * 100}%`,
                    backgroundColor: progressVal > 0.8 ? colors.error : colors.primary 
                  }
                ]} />
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Document Exporting Buttons */}
        <View style={styles.exportRow}>
          <TouchableOpacity style={styles.exportBtn} onPress={handleExportPdf}>
            <Ionicons name="document-text-outline" size={18} color={colors.primary} style={{ marginRight: 6 }} />
            <Text style={styles.exportBtnText}>PDF Report</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.exportBtn} onPress={handleExportCsv}>
            <Ionicons name="grid-outline" size={18} color={colors.primary} style={{ marginRight: 6 }} />
            <Text style={styles.exportBtnText}>CSV Sheet</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Add Member Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add member</Text>

            <TextInput 
              style={styles.modalInput}
              placeholder="Member name"
              placeholderTextColor={colors.textSecondary}
              value={newMemberName}
              onChangeText={setNewMemberName}
            />

            <TextInput 
              style={styles.modalInput}
              placeholder="Member email"
              placeholderTextColor={colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              value={newMemberEmail}
              onChangeText={setNewMemberEmail}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalBtn, { backgroundColor: '#EEEEEE' }]} 
                onPress={() => setModalVisible(false)}
              >
                <Text style={[styles.modalBtnText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalBtn, { backgroundColor: colors.primary }]} 
                onPress={handleAddMember}
                disabled={adding}
              >
                {adding ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: '#FFFFFF' }]}>Add</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  screenHeader: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  summaryCard: {
    padding: 20,
    backgroundColor: colors.primary,
    borderRadius: 20,
    marginBottom: 16,
  },
  summarySub: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
  },
  summaryVal: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginVertical: 8,
  },
  summaryChipsRow: {
    flexDirection: 'row',
    marginTop: 12,
  },
  summaryChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginHorizontal: 4,
  },
  summaryChipTextCol: {
    marginLeft: 8,
  },
  summaryChipLabel: {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  summaryChipVal: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  adminControlBox: {
    backgroundColor: '#FFF3E0',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  teamIdBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamIdTextCol: {
    flex: 1,
    marginLeft: 12,
  },
  teamIdLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#E65100',
  },
  teamIdVal: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2D2D2D',
  },
  shareButton: {
    padding: 8,
  },
  adminActionRow: {
    marginTop: 12,
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
    fontWeight: '600',
    fontSize: 13,
  },
  chartCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  chartContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pieContainer: {
    marginRight: 16,
  },
  chartLegend: {
    flex: 1,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  legendText: {
    flex: 1,
    fontSize: 12,
    color: colors.textPrimary,
  },
  legendAmt: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
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
  membersCount: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  memberCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  memberMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  memberInfo: {
    flex: 1,
    marginLeft: 14,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  memberSubInfo: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 4,
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
    height: 4,
    backgroundColor: colors.divider,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  exportRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  exportBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 48,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  exportBtnText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    width: '100%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
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
  modalActions: {
    flexDirection: 'row',
    marginTop: 8,
    width: '100%',
  },
  modalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 6,
  },
  modalBtnText: {
    fontWeight: 'bold',
  },
});
