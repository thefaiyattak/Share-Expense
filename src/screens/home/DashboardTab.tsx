import React, { useState } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  Alert,
  Modal,
  TextInput,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../../store/useStore';
import { getThemeColors } from '../../utils/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { authService } from '../../services/authService';
import { db } from '../../services/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import Svg, { Circle } from 'react-native-svg';

export default function DashboardTab() {
  const navigation = useNavigation<any>();
  const { 
    currentAppUser, 
    currency, 
    expenses, 
    members, 
    attendance, 
    setCurrentAppUser, 
    setUserTeams,
    darkMode
  } = useStore();
  const [selectedDate, setSelectedDate] = useState(new Date());

  const colors = getThemeColors(darkMode);
  const styles = getStyles(colors, darkMode);

  // Modals and loading states
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [walletModalVisible, setWalletModalVisible] = useState(false);
  const [notificationsModalVisible, setNotificationsModalVisible] = useState(false);
  
  const [newGroupName, setNewGroupName] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [walletAmountInput, setWalletAmountInput] = useState('');
  const [loading, setLoading] = useState(false);

  // Mock notifications list
  const mockNotifications = [
    { id: '1', title: 'New Expense Added', desc: 'Usman Gemini added Rs. 500 for Lunch', time: '10m ago', icon: 'card-outline' },
    { id: '2', title: 'Wallet Updated', desc: 'John Doe deposited Rs. 2,000 to their wallet', time: '1h ago', icon: 'wallet-outline' },
    { id: '3', title: 'Group split calculated', desc: 'Monthly splits are fully calculated for July 2026', time: '1d ago', icon: 'calculator-outline' },
  ];

  const getGreeting = () => {
    const hrs = new Date().getHours();
    if (hrs < 12) return 'morning';
    if (hrs < 17) return 'afternoon';
    return 'evening';
  };

  const formatAmount = (val: number) => {
    return `${currency} ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(val)}`;
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      Alert.alert('Error', 'Please enter a group name.');
      return;
    }
    setLoading(true);
    try {
      const teamId = await authService.createTeam(newGroupName.trim());
      const email = currentAppUser?.email;
      if (email) {
        const teams = await authService.getUserTeams(email);
        setUserTeams(teams);
        
        const newTeam = teams.find(t => t.teamId === teamId);
        if (newTeam) {
          const switchedUser = await authService.switchActiveTeam(newTeam.userDocId);
          setCurrentAppUser(switchedUser);
        }
      }
      setNewGroupName('');
      setCreateModalVisible(false);
      Alert.alert('Success', 'Group created successfully!');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGroup = async () => {
    if (!inviteCodeInput.trim()) {
      Alert.alert('Error', 'Please enter an invite code.');
      return;
    }
    setLoading(true);
    try {
      const joinedUser = await authService.joinTeam(inviteCodeInput.trim().toUpperCase());
      const email = currentAppUser?.email;
      if (email) {
        const teams = await authService.getUserTeams(email);
        setUserTeams(teams);
        
        const newTeam = teams.find(t => t.teamId === inviteCodeInput.trim().toUpperCase());
        if (newTeam) {
          const switchedUser = await authService.switchActiveTeam(newTeam.userDocId);
          setCurrentAppUser(switchedUser);
        }
      }
      setInviteCodeInput('');
      setJoinModalVisible(false);
      Alert.alert('Success', 'Joined group successfully!');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to join group');
    } finally {
      setLoading(false);
    }
  };

  const handleAddWalletMoney = async () => {
    if (!walletAmountInput.trim() || isNaN(Number(walletAmountInput))) {
      Alert.alert('Error', 'Please enter a valid amount.');
      return;
    }
    if (!currentAppUser) return;
    setLoading(true);
    try {
      const addedVal = parseFloat(walletAmountInput);
      const newBal = (currentAppUser.walletBalance || 0) + addedVal;
      await updateDoc(doc(db, 'users', currentAppUser.id), {
        walletBalance: newBal
      });
      setCurrentAppUser({
        ...currentAppUser,
        walletBalance: newBal
      });
      setWalletAmountInput('');
      setWalletModalVisible(false);
      Alert.alert('Success', `Successfully deposited ${formatAmount(addedVal)} to your wallet.`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update wallet balance');
    } finally {
      setLoading(false);
    }
  };

  // Calculations for current month total spending
  const currentMonthExpenses = expenses.filter(e => {
    const d = new Date(e.date);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  
  const totalSpending = currentMonthExpenses.reduce((sum, e) => sum + e.price * e.quantity, 0);

  // Re-calculate user share and wallet balance
  const memberIds = members.map(m => m.id);
  const shares = memberIds.length > 0 ? require('../../services/expenseService').expenseService.calculateShares({
    expenses: currentMonthExpenses,
    attendance: attendance, 
    allIds: memberIds
  }) : {};

  const myShare = shares[currentAppUser?.id || ''] || 0;
  const myWallet = currentAppUser?.walletBalance || 0;

  const totalWallet = members.reduce((sum, m) => sum + (m.walletBalance || 0), 0);

  // Calendar setup (7 days of current week)
  const renderCalendar = () => {
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(d.getDate() + i);
      return d;
    });
    const labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    return (
      <View style={styles.calendarContainer}>
        <View style={styles.calendarHeader}>
          <Text style={styles.calendarTitle}>
            {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
        </View>
        <View style={styles.calendarDaysRow}>
          {days.map((day, i) => {
            const isToday = day.getDate() === new Date().getDate() && day.getMonth() === new Date().getMonth();
            const isSelected = day.getDate() === selectedDate.getDate() && day.getMonth() === selectedDate.getMonth();
            return (
              <TouchableOpacity 
                key={i} 
                style={styles.dayCol} 
                onPress={() => setSelectedDate(day)}
              >
                <Text style={[styles.dayLabel, isToday && styles.todayLabel]}>{labels[i]}</Text>
                <View style={[styles.dateCircle, isSelected && styles.dateCircleSelected]}>
                  <Text style={[styles.dateText, isSelected && styles.dateTextSelected]}>{day.getDate()}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  // Grouped category expenses for today/selectedDate
  const getCategoryTotal = (cat: string) => {
    const dayExpenses = expenses.filter(e => {
      const d = new Date(e.date);
      return d.getDate() === selectedDate.getDate() && 
             d.getMonth() === selectedDate.getMonth() &&
             d.getFullYear() === selectedDate.getFullYear() &&
             e.category === cat;
    });
    return dayExpenses.reduce((sum, e) => sum + e.price * e.quantity, 0);
  };

  const mealCategories = [
    { name: 'Breakfast', key: 'breakfast', icon: 'cafe-outline' },
    { name: 'Lunch', key: 'lunch', icon: 'fast-food-outline' },
    { name: 'Dinner', key: 'dinner', icon: 'restaurant-outline' },
    { name: 'Utilities', key: 'utility', icon: 'flash-outline' },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {loading && (
        <View style={styles.globalLoader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header Greeting */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greetingText}>Good {getGreeting()}!</Text>
            <View style={styles.userRow}>
              <Text style={styles.userName}>{currentAppUser?.name || 'User'}</Text>
              {currentAppUser?.role === 'admin' && (
                <View style={styles.adminBadge}>
                  <Text style={styles.adminBadgeText}>Admin</Text>
                </View>
              )}
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setNotificationsModalVisible(true)}>
              <Ionicons name="notifications-outline" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Workspace Banner for Personal Expenses */}
        {!currentAppUser?.teamId && (
          <View style={styles.workspaceBanner}>
            <View style={styles.bannerTextCol}>
              <Text style={styles.bannerTitle}>Personal Expenses</Text>
              <Text style={styles.bannerDesc}>You are currently tracking personal expenses. Create or join a group to share splits.</Text>
            </View>
            <View style={styles.bannerActionsCol}>
              <TouchableOpacity style={styles.bannerBtn} onPress={() => setCreateModalVisible(true)}>
                <Text style={styles.bannerBtnText}>Create</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.bannerBtn, styles.bannerBtnSec]} onPress={() => setJoinModalVisible(true)}>
                <Text style={[styles.bannerBtnText, styles.bannerBtnTextSec]}>Join</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Progress Card */}
        {(() => {
          const budgetLimit = 30000;
          const spendingPercentage = budgetLimit > 0 ? Math.min(Math.round((totalSpending / budgetLimit) * 100), 100) : 0;
          const radius = 24;
          const circumference = 2 * Math.PI * radius;
          const strokeDashoffset = circumference - (spendingPercentage / 100) * circumference;

          return (
            <View style={styles.progressCard}>
              <View>
                <Text style={styles.progressLabel}>Total spending</Text>
                <Text style={styles.progressValue}>{formatAmount(totalSpending)}</Text>
                <Text style={styles.progressPeriod}>This month (Target: {formatAmount(budgetLimit)})</Text>
              </View>
              <View style={styles.progressCircleContainer}>
                <Svg height="64" width="64" viewBox="0 0 64 64">
                  <Circle
                    cx="32"
                    cy="32"
                    r={radius}
                    fill="transparent"
                    stroke={colors.primaryDark + '33'}
                    strokeWidth="5"
                  />
                  <Circle
                    cx="32"
                    cy="32"
                    r={radius}
                    fill="transparent"
                    stroke={colors.primary}
                    strokeWidth="5"
                    strokeDasharray={`${circumference} ${circumference}`}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    transform="rotate(-90, 32, 32)"
                  />
                </Svg>
                <View style={styles.progressCircleOverlay}>
                  <Text style={styles.progressPctText}>{spendingPercentage}%</Text>
                </View>
              </View>
            </View>
          );
        })()}

        {/* Dynamic Cards Grid */}
        <View style={styles.statsRow}>
          {/* My Wallet Card */}
          <TouchableOpacity 
            style={styles.statCard}
            onPress={() => setWalletModalVisible(true)}
          >
            <View style={styles.statHeader}>
              <Ionicons name="wallet-outline" size={18} color={colors.primary} />
              <Text style={styles.statLabel}>My Wallet</Text>
              <Ionicons name="add-circle" size={16} color={colors.primary} style={{ marginLeft: 'auto' }} />
            </View>
            <Text style={[styles.statValue, { color: colors.primary }]}>
              {formatAmount(myWallet)}
            </Text>
            <View style={styles.statSubRow}>
              <Text style={styles.statSubLabel}>Spent: {formatAmount(myShare)}</Text>
              <Text style={styles.statSubLabel}>Left: {formatAmount(myWallet - myShare)}</Text>
            </View>
          </TouchableOpacity>
          
          {/* Collective Wallet Card */}
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <Ionicons name="people-outline" size={18} color="#E65100" />
              <Text style={styles.statLabel}>Collective Wallet</Text>
            </View>
            <Text style={[styles.statValue, { color: '#E65100' }]}>
              {formatAmount(totalWallet)}
            </Text>
            <View style={styles.statSubRow}>
              <Text style={styles.statSubLabel}>Spent: {formatAmount(totalSpending)}</Text>
              <Text style={styles.statSubLabel}>Left: {formatAmount(totalWallet - totalSpending)}</Text>
            </View>
          </View>
        </View>

        {/* Week Calendar */}
        {renderCalendar()}

        {/* Categories list */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Daily Breakdown</Text>
        </View>

        {mealCategories.map((m) => (
          <View key={m.key} style={styles.categoryRow}>
            <View style={styles.catIconBox}>
              <Ionicons name={m.icon as any} size={20} color={colors.primary} />
            </View>
            <View style={styles.catInfo}>
              <Text style={styles.catName}>{m.name}</Text>
              <Text style={styles.catSpent}>{formatAmount(getCategoryTotal(m.key))}</Text>
            </View>
            <TouchableOpacity 
              style={styles.addBtn}
              onPress={() => navigation.navigate('AddExpense', { defaultCategory: m.key })}
            >
              <Ionicons name="add" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      {/* Create Group Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={createModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create a new group</Text>
            <Text style={styles.modalSubtitle}>You will be the administrator of this group.</Text>

            <TextInput 
              style={styles.modalInput}
              placeholder="Group Name (e.g. My Family)"
              placeholderTextColor={colors.textSecondary}
              value={newGroupName}
              onChangeText={setNewGroupName}
            />

            <TouchableOpacity 
              style={styles.modalSubmitBtn}
              onPress={handleCreateGroup}
            >
              <Text style={styles.modalSubmitBtnText}>Create Group</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalCancelBtn}
              onPress={() => setCreateModalVisible(false)}
            >
              <Text style={styles.modalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Join Group Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={joinModalVisible}
        onRequestClose={() => setJoinModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Join a group</Text>
            <Text style={styles.modalSubtitle}>Enter the invite code (Team ID) provided by the group admin.</Text>

            <TextInput 
              style={styles.modalInput}
              placeholder="Invite Code (e.g. A1B2C3D4)"
              placeholderTextColor={colors.textSecondary}
              value={inviteCodeInput}
              onChangeText={setInviteCodeInput}
              autoCapitalize="characters"
            />

            <TouchableOpacity 
              style={[styles.modalSubmitBtn, { backgroundColor: '#2E7D32' }]}
              onPress={handleJoinGroup}
            >
              <Text style={styles.modalSubmitBtnText}>Join Group</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalCancelBtn}
              onPress={() => setJoinModalVisible(false)}
            >
              <Text style={styles.modalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add Wallet Money Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={walletModalVisible}
        onRequestClose={() => setWalletModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add money to wallet</Text>
            <Text style={styles.modalSubtitle}>Type the amount you want to add to your personal wallet deposit.</Text>

            <TextInput 
              style={styles.modalInput}
              placeholder="Amount (e.g. 5000)"
              placeholderTextColor={colors.textSecondary}
              value={walletAmountInput}
              onChangeText={setWalletAmountInput}
              keyboardType="numeric"
            />

            <TouchableOpacity 
              style={styles.modalSubmitBtn}
              onPress={handleAddWalletMoney}
            >
              <Text style={styles.modalSubmitBtnText}>Add Money</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalCancelBtn}
              onPress={() => setWalletModalVisible(false)}
            >
              <Text style={styles.modalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Notifications Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={notificationsModalVisible}
        onRequestClose={() => setNotificationsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '75%' }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Notifications</Text>
              <TouchableOpacity onPress={() => setNotificationsModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ width: '100%' }} contentContainerStyle={{ paddingBottom: 20 }}>
              {mockNotifications.map((notif) => (
                <View key={notif.id} style={styles.notificationItem}>
                  <View style={styles.notifIconBox}>
                    <Ionicons name={notif.icon as any} size={20} color={colors.primary} />
                  </View>
                  <View style={styles.notifDetails}>
                    <Text style={styles.notifTitle}>{notif.title}</Text>
                    <Text style={styles.notifDesc}>{notif.desc}</Text>
                    <Text style={styles.notifTime}>{notif.time}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  greetingText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  adminBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
  adminBadgeText: {
    fontSize: 10,
    color: colors.primaryDark,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
  },
  iconBtn: {
    padding: 8,
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  workspaceBanner: {
    backgroundColor: darkMode ? '#152C3E' : '#E3F2FD',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: darkMode ? '#0D47A1' : '#BBDEFB',
  },
  bannerTextCol: {
    marginBottom: 12,
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 4,
  },
  bannerDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  bannerActionsCol: {
    flexDirection: 'row',
  },
  bannerBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginRight: 8,
  },
  bannerBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  bannerBtnSec: {
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  bannerBtnTextSec: {
    color: colors.primary,
  },
  progressCard: {
    backgroundColor: colors.primaryLight,
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressLabel: {
    fontSize: 12,
    color: colors.primaryDark,
  },
  progressValue: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.primary,
    marginVertical: 4,
  },
  progressPeriod: {
    fontSize: 11,
    color: colors.primaryDark,
  },
  progressCircleContainer: {
    position: 'relative',
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressCircleOverlay: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressPctText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.primaryDark,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.cardBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 4,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 6,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  statSubRow: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 6,
  },
  statSubLabel: {
    fontSize: 9,
    color: colors.textSecondary,
    marginVertical: 1,
  },
  calendarContainer: {
    backgroundColor: colors.cardBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  calendarHeader: {
    marginBottom: 12,
  },
  calendarTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  calendarDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  dayCol: {
    alignItems: 'center',
  },
  dayLabel: {
    fontSize: 11,
    color: colors.textTertiary,
    marginBottom: 6,
  },
  todayLabel: {
    color: colors.primary,
    fontWeight: 'bold',
  },
  dateCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateCircleSelected: {
    backgroundColor: colors.primary,
  },
  dateText: {
    fontSize: 13,
    color: colors.textPrimary,
  },
  dateTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  categoryRow: {
    flexDirection: 'row',
    backgroundColor: colors.cardBg,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    marginBottom: 8,
  },
  catIconBox: {
    backgroundColor: colors.primaryLight,
    padding: 8,
    borderRadius: 10,
  },
  catInfo: {
    flex: 1,
    marginLeft: 12,
  },
  catName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  catSpent: {
    fontSize: 12,
    color: colors.primary,
    marginTop: 2,
  },
  addBtn: {
    backgroundColor: colors.primary,
    padding: 6,
    borderRadius: 8,
  },
  globalLoader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
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
    paddingBottom: 40,
    width: '100%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  modalSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 20,
    alignSelf: 'flex-start',
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
    marginBottom: 16,
    width: '100%',
  },
  modalSubmitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    width: '100%',
  },
  modalSubmitBtnText: {
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontSize: 15,
  },
  modalCancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 10,
    width: '100%',
  },
  modalCancelBtnText: {
    fontWeight: '600',
    color: colors.textSecondary,
    fontSize: 14,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    width: '100%',
  },
  notifIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifDetails: {
    flex: 1,
    marginLeft: 12,
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  notifDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  notifTime: {
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: 4,
  },
});
