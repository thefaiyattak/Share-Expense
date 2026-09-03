import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Image
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../store/useStore';
import { getThemeColors } from '../../utils/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { authService } from '../../services/authService';
import { notificationService } from '../../services/notificationService';
import { db } from '../../services/firebase';
import { doc, updateDoc, deleteDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import Svg, { Circle } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GlobalLoader } from '../../components/GlobalLoader';
import { useKeyboardVisible } from '../../utils/useKeyboardVisible';
import AppTutorialModal from '../../components/AppTutorialModal';
import LoanModal from '../../components/LoanModal';
import { loanService } from '../../services/loanService';
import { PersonalLoan } from '../../models/types';

const appStorage = (AsyncStorage as any)?.default || AsyncStorage;

export default function DashboardTab() {
  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardVisible();
  const modalBottomPadding = isKeyboardVisible ? 14 : Math.max(insets.bottom + 6, 18);
  const navigation = useNavigation<any>();
  const { 
    currentAppUser, 
    activeTeamId: activeTeamIdStore,
    currency, 
    expenses, 
    members, 
    attendance, 
    userTeams,
    setCurrentAppUser, 
    setUserTeams,
    setAttendance,
    darkMode
  } = useStore();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [notifications, setNotifications] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [tutorialModalVisible, setTutorialModalVisible] = useState(false);
  const [loanModalVisible, setLoanModalVisible] = useState(false);
  const [loanModalInitialType, setLoanModalInitialType] = useState<'give' | 'borrow'>('give');
  const [personalLoans, setPersonalLoans] = useState<PersonalLoan[]>([]);

  // Load personal loans
  useEffect(() => {
    if (currentAppUser?.teamId && currentAppUser?.id) {
      loanService.getLoans(currentAppUser.teamId, currentAppUser.id)
        .then(setPersonalLoans)
        .catch(() => {});
    }
  }, [currentAppUser?.teamId, currentAppUser?.id]);

  const loanSummary = useMemo(() => {
    if (!currentAppUser?.id) return { toCollect: 0, toPay: 0, netBalance: 0 };
    return loanService.getUserLoanSummary(currentAppUser.id, personalLoans);
  }, [currentAppUser?.id, personalLoans]);

  useEffect(() => {
    if (!currentAppUser?.id) return;
    const storageKey = `@onboarding_seen_${currentAppUser.id}`;
    appStorage.getItem(storageKey).then((val: any) => {
      if (!val) {
        setOnboardingVisible(true);
      }
    }).catch(() => {});
  }, [currentAppUser?.id]);

  const handleDismissOnboarding = async () => {
    setOnboardingVisible(false);
    if (currentAppUser?.id) {
      try {
        await appStorage.setItem(`@onboarding_seen_${currentAppUser.id}`, 'true');
      } catch (e) {}
    }
  };

  const currentGroupInfo = useMemo(() => {
    if (!currentAppUser) return { name: 'Personal Workspace', role: 'Member' };
    const targetTeamId = activeTeamIdStore || currentAppUser.teamId;
    const foundTeam = (userTeams || []).find((t: any) => t.teamId === targetTeamId);

    if (foundTeam) {
      return {
        name: foundTeam.teamName || 'Group',
        role: foundTeam.role || 'Member'
      };
    }

    const userAny = currentAppUser as any;
    if (userAny.teamName) {
      return {
        name: userAny.teamName,
        role: currentAppUser.role ? (currentAppUser.role.charAt(0).toUpperCase() + currentAppUser.role.slice(1)) : 'Member'
      };
    }

    if (currentAppUser.teamId) {
      return {
        name: `Group (${currentAppUser.teamId})`,
        role: currentAppUser.role ? (currentAppUser.role.charAt(0).toUpperCase() + currentAppUser.role.slice(1)) : 'Member'
      };
    }

    return { name: 'Personal Workspace', role: 'Personal' };
  }, [userTeams, activeTeamIdStore, currentAppUser]);

  // User join date restriction logic
  const userJoinDate = useMemo(() => {
    if (!currentAppUser?.createdAt) return new Date(0);
    const d = typeof (currentAppUser.createdAt as any)?.toDate === 'function'
      ? (currentAppUser.createdAt as any).toDate()
      : new Date(currentAppUser.createdAt);
    return isNaN(d.getTime()) ? new Date(0) : d;
  }, [currentAppUser?.createdAt]);

  const userJoinMonthStart = useMemo(() => {
    return new Date(userJoinDate.getFullYear(), userJoinDate.getMonth(), 1, 0, 0, 0);
  }, [userJoinDate]);

  // Filter expenses restricted to user's join month onwards
  const userVisibleExpenses = useMemo(() => {
    return expenses.filter(e => {
      const d = new Date(e.date);
      return d >= userJoinMonthStart;
    });
  }, [expenses, userJoinMonthStart]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    const today = new Date();
    setSelectedDate(today);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const flatListRef = useRef<FlatList>(null);

  // Calendar days for 1st to last date of selectedDate's month
  const calendarDays = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    
    const list = [];
    for (let day = 1; day <= totalDaysInMonth; day++) {
      list.push(new Date(year, month, day));
    }
    return list;
  }, [selectedDate.getFullYear(), selectedDate.getMonth()]);

  const selectedIndex = useMemo(() => {
    return calendarDays.findIndex(d => 
      d.getDate() === selectedDate.getDate() &&
      d.getMonth() === selectedDate.getMonth() &&
      d.getFullYear() === selectedDate.getFullYear()
    );
  }, [calendarDays, selectedDate]);

  useEffect(() => {
    if (flatListRef.current && selectedIndex !== -1) {
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: selectedIndex,
          animated: true,
          viewPosition: 0.5
        });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedIndex]);

  useEffect(() => {
    if (!currentAppUser) return;
    const teamIdToListen = activeTeamIdStore || currentAppUser.teamId || `personal_${currentAppUser.id.split('_')[0]}`;
    if (!teamIdToListen) return;

    const q = query(collection(db, 'notifications'), where('teamId', '==', teamIdToListen));
    
    return onSnapshot(q, async (snap) => {
      let storedTs = lastReadNotifTs;
      if (!storedTs) {
        try {
          const val = await appStorage.getItem('@last_read_notif_ts');
          if (val) storedTs = Number(val);
        } catch (e) {}
      }

      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      const cutoffTs = Date.now() - SEVEN_DAYS_MS;

      let unreadCount = 0;
      snap.docs.forEach(d => {
        const data = d.data();
        let createdDate = new Date();
        if (data.createdAt) {
          createdDate = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
        }

        // Auto-delete notifications older than 7 days
        if (createdDate.getTime() < cutoffTs) {
          deleteDoc(doc(db, 'notifications', d.id)).catch(() => {});
          return;
        }

        if (createdDate.getTime() > storedTs) {
          unreadCount++;
        }
      });
      setUnreadNotifCount(unreadCount);

      let prefs: any = {
        masterEnabled: true,
        newExpense: true,
        editExpense: true,
        newMember: true,
        walletUpdates: true,
        adjustments: true,
        transfers: true,
        monthlyReports: true,
      };
      try {
        const stored = await appStorage.getItem('@app_notification_settings');
        if (stored) prefs = JSON.parse(stored);
      } catch (e) {}

      const notifs: any[] = [];
      snap.docs.forEach(d => {
        const data = d.data();
        let createdDate = new Date();
        if (data.createdAt) {
          createdDate = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
        }
        if (createdDate.getTime() < cutoffTs) return;

        const notifType = data.notifType || 'newExpense';

        // Filter based on user preferences
        if (notifType === 'newExpense' && !prefs.newExpense) return;
        if (notifType === 'editExpense' && !prefs.editExpense) return;
        if (notifType === 'newMember' && !prefs.newMember) return;
        if (notifType === 'walletUpdates' && !prefs.walletUpdates) return;
        if (notifType === 'adjustments' && !prefs.adjustments) return;
        if (notifType === 'transfers' && !prefs.transfers) return;
        if (notifType === 'monthlyReports' && !prefs.monthlyReports) return;

        let timeLabel = '';
        if (data.createdAt) {
          const dateStr = createdDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const timeStr = createdDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
          timeLabel = `${dateStr}, ${timeStr}`;
        }

        let badgeText = 'EXPENSE';
        let badgeBg = '#E8F5E9';
        let badgeColor = '#2E7D32';
        let iconName = 'cart-outline';

        if (notifType === 'walletUpdates' || (data.title && data.title.includes('Wallet'))) {
          badgeText = 'WALLET';
          badgeBg = '#E3F2FD';
          badgeColor = '#1976D2';
          iconName = 'wallet-outline';
        } else if (notifType === 'newMember' || (data.title && data.title.includes('Member'))) {
          badgeText = 'MEMBER';
          badgeBg = '#F3E5F5';
          badgeColor = '#7B1FA2';
          iconName = 'person-add-outline';
        } else if (notifType === 'transfers' || notifType === 'adjustments' || (data.title && data.title.includes('Transfer'))) {
          badgeText = 'TRANSFER';
          badgeBg = '#FFF3E0';
          badgeColor = '#E65100';
          iconName = 'swap-horizontal-outline';
        } else if (data.title === 'Expense Deleted') {
          badgeText = 'DELETED';
          badgeBg = '#FFEBEE';
          badgeColor = '#D32F2F';
          iconName = 'trash-outline';
        }

        notifs.push({
          id: d.id,
          title: data.title || 'Notification',
          desc: data.desc || '',
          time: timeLabel,
          timestampMs: createdDate.getTime(),
          notifType,
          badgeText,
          badgeBg,
          badgeColor,
          icon: iconName,
          isNew: createdDate.getTime() > storedTs
        });
      });

      // Sort newest first by timestampMs
      notifs.sort((a, b) => b.timestampMs - a.timestampMs);
      setNotifications(notifs);
    });
  }, [currentAppUser, activeTeamIdStore]);

  // Sync attendance listener dynamically with the month and year of the selectedDate
  useEffect(() => {
    if (!currentAppUser || !currentAppUser.teamId) {
      setAttendance([]);
      return;
    }

    const unsub = require('../../services/expenseService').expenseService.getMonthAttendance(
      currentAppUser.teamId,
      selectedDate,
      (data: any) => {
        setAttendance(data);
      }
    );

    return () => unsub();
  }, [currentAppUser?.teamId, selectedDate.getMonth(), selectedDate.getFullYear()]);

  const colors = getThemeColors(darkMode);
  const styles = getStyles(colors, darkMode);

  // Modals and loading states
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [walletModalVisible, setWalletModalVisible] = useState(false);
  const [notificationsModalVisible, setNotificationsModalVisible] = useState(false);
  const [isNotifSelectMode, setIsNotifSelectMode] = useState(false);
  const [selectedNotifIds, setSelectedNotifIds] = useState<string[]>([]);
  const [groupDropdownVisible, setGroupDropdownVisible] = useState(false);

  useEffect(() => {
    if (currentAppUser?.email && (!userTeams || userTeams.length === 0)) {
      authService.getUserTeams(currentAppUser.email).then(teams => {
        setUserTeams(teams);
      }).catch(err => console.log('Error fetching user teams:', err));
    }
  }, [currentAppUser?.email]);

  const handleSwitchGroup = async (team: any) => {
    if (!currentAppUser) return;
    const targetTeamId = activeTeamIdStore || currentAppUser.teamId;
    if (team.teamId === targetTeamId) {
      setGroupDropdownVisible(false);
      return;
    }
    setLoading(true);
    setGroupDropdownVisible(false);
    try {
      const switchedUser = await authService.switchActiveTeam(team.userDocId);
      setCurrentAppUser(switchedUser);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to switch group');
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchToPersonalWorkspace = async () => {
    if (!currentAppUser) return;
    if (!currentAppUser.teamId) {
      setGroupDropdownVisible(false);
      return;
    }
    setLoading(true);
    setGroupDropdownVisible(false);
    try {
      const firebaseUser = authService.getCurrentUser();
      const uid = firebaseUser?.uid || currentAppUser.id.split('_')[0];
      const personalUser = await authService.switchToPersonalWorkspace(
        uid,
        currentAppUser.email,
        currentAppUser.name
      );
      setCurrentAppUser(personalUser);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to switch to Personal Workspace');
    } finally {
      setLoading(false);
    }
  };

  const [splitModalVisible, setSplitModalVisible] = useState(false);
  const [selectedExpenseToEdit, setSelectedExpenseToEdit] = useState<any>(null);
  const [editSplitUserIds, setEditSplitUserIds] = useState<string[]>([]);
  const [savingSplit, setSavingSplit] = useState(false);
  
  const [newGroupName, setNewGroupName] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [walletAmountInput, setWalletAmountInput] = useState('');
  const [walletOperation, setWalletOperation] = useState<'add' | 'subtract'>('add');
  const [monthlyTargetInput, setMonthlyTargetInput] = useState('');
  const [createError, setCreateError] = useState('');
  const [joinError, setJoinError] = useState('');
  const [walletError, setWalletError] = useState('');
  const [loading, setLoading] = useState(false);

  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [lastReadNotifTs, setLastReadNotifTs] = useState<number>(0);

  useEffect(() => {
    appStorage.getItem('@last_read_notif_ts').then((val: any) => {
      if (val) setLastReadNotifTs(Number(val));
    });
  }, []);

  const handleOpenNotifications = async () => {
    const now = Date.now();
    setLastReadNotifTs(now);
    setUnreadNotifCount(0);
    await appStorage.setItem('@last_read_notif_ts', now.toString());
    setNotificationsModalVisible(true);
  };

  const handleClearNotifications = async () => {
    const now = Date.now();
    setLastReadNotifTs(now);
    setUnreadNotifCount(0);
    await appStorage.setItem('@last_read_notif_ts', now.toString());
  };

  const handleNotificationClick = (notif: any) => {
    setNotificationsModalVisible(false);
    const type = notif.notifType || '';
    const title = notif.title || '';

    if (type === 'walletUpdates' || title.includes('Wallet')) {
      openWalletModal();
    } else if (type === 'newMember' || title.includes('Member')) {
      navigation.navigate('Settings');
    } else if (type === 'monthlyReports' || title.includes('Report')) {
      navigation.navigate('Stats');
    } else if (type === 'adjustments' || type === 'transfers' || title.includes('Transfer')) {
      if (members && members.length > 0) {
        navigation.navigate('UserDetail', { memberId: members[0].id });
      } else {
        navigation.navigate('Expenses');
      }
    } else {
      navigation.navigate('Expenses');
    }
  };

  const handleDeleteSingleNotification = (notifId: string) => {
    Alert.alert(
      'Delete Notification',
      'Are you sure you want to delete this notification?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setNotifications(prev => prev.filter(n => n.id !== notifId));
            setSelectedNotifIds(prev => prev.filter(id => id !== notifId));
            try {
              await deleteDoc(doc(db, 'notifications', notifId));
            } catch (e) {
              console.log('Firestore delete permission ignored or failed:', e);
            }
          }
        }
      ]
    );
  };

  const toggleSelectNotif = (id: string) => {
    setSelectedNotifIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllNotifs = () => {
    if (selectedNotifIds.length === notifications.length) {
      setSelectedNotifIds([]);
    } else {
      setSelectedNotifIds(notifications.map(n => n.id));
    }
  };

  const handleDeleteSelectedNotifs = async () => {
    if (selectedNotifIds.length === 0) return;
    Alert.alert(
      'Delete Selected',
      `Are you sure you want to delete ${selectedNotifIds.length} notification(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const idsToDelete = [...selectedNotifIds];
            setNotifications(prev => prev.filter(n => !idsToDelete.includes(n.id)));
            setSelectedNotifIds([]);
            setIsNotifSelectMode(false);
            try {
              await Promise.all(
                idsToDelete.map(id => deleteDoc(doc(db, 'notifications', id)).catch(() => {}))
              );
            } catch (e) {
              console.log('Firestore batch delete permission ignored or failed:', e);
            }
          }
        }
      ]
    );
  };

  const handleDeleteAllNotifs = async () => {
    if (notifications.length === 0) return;
    Alert.alert(
      'Clear All Notifications',
      'Are you sure you want to delete all notifications?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            const allIds = notifications.map(n => n.id);
            setNotifications([]);
            setSelectedNotifIds([]);
            setIsNotifSelectMode(false);
            try {
              await Promise.all(
                allIds.map(id => deleteDoc(doc(db, 'notifications', id)).catch(() => {}))
              );
            } catch (e) {
              console.log('Firestore clear all permission ignored or failed:', e);
            }
          }
        }
      ]
    );
  };

  const handleMarkSingleAsRead = async (notifId: string) => {
    try {
      const now = Date.now();
      await appStorage.setItem('@last_read_notif_ts', now.toString());
      setLastReadNotifTs(now);
      setUnreadNotifCount(0);
      setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, isNew: false } : n));
    } catch (e) {
      console.error('Failed to mark notification as read:', e);
    }
  };

  const handleMarkSelectedAsRead = async () => {
    if (selectedNotifIds.length === 0) return;
    try {
      const now = Date.now();
      await appStorage.setItem('@last_read_notif_ts', now.toString());
      setLastReadNotifTs(now);
      setUnreadNotifCount(0);
      setNotifications(prev => prev.map(n => selectedNotifIds.includes(n.id) ? { ...n, isNew: false } : n));
      setSelectedNotifIds([]);
      setIsNotifSelectMode(false);
    } catch (e) {
      console.error('Failed to mark selected notifications as read:', e);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (notifications.length === 0) return;
    try {
      const now = Date.now();
      await appStorage.setItem('@last_read_notif_ts', now.toString());
      setLastReadNotifTs(now);
      setUnreadNotifCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, isNew: false })));
      setSelectedNotifIds([]);
      setIsNotifSelectMode(false);
    } catch (e) {
      console.error('Failed to mark all notifications as read:', e);
    }
  };

  const openWalletModal = () => {
    setWalletAmountInput('');
    setMonthlyTargetInput(currentAppUser?.monthlyTarget ? String(currentAppUser.monthlyTarget) : '');
    setWalletError('');
    setWalletModalVisible(true);
  };

  const openEditSplitModal = (exp: any) => {
    setSelectedExpenseToEdit(exp);
    const initial = (exp.splitUserIds && exp.splitUserIds.length > 0)
      ? exp.splitUserIds
      : members.map(m => m.id);
    setEditSplitUserIds(initial);
    setSplitModalVisible(true);
  };

  const handleCloseWalletModal = () => {
    const isAmountEntered = walletAmountInput.trim() !== '';
    const originalTarget = currentAppUser?.monthlyTarget ? String(currentAppUser.monthlyTarget) : '';
    const isTargetChanged = monthlyTargetInput.trim() !== originalTarget.trim();

    if (isAmountEntered || isTargetChanged) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved wallet changes. What would you like to do?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { 
            text: 'Discard', 
            style: 'destructive',
            onPress: () => {
              setWalletAmountInput('');
              setMonthlyTargetInput('');
              setWalletModalVisible(false);
            }
          },
          { 
            text: 'Save', 
            onPress: () => handleAddWalletMoney()
          }
        ]
      );
    } else {
      setWalletModalVisible(false);
    }
  };

  const handleCloseSplitModal = () => {
    if (!selectedExpenseToEdit) {
      setSplitModalVisible(false);
      return;
    }
    const originalUserIds = (selectedExpenseToEdit.splitUserIds && selectedExpenseToEdit.splitUserIds.length > 0)
      ? selectedExpenseToEdit.splitUserIds
      : members.map((m: any) => m.id);

    const isChanged = JSON.stringify([...editSplitUserIds].sort()) !== JSON.stringify([...originalUserIds].sort());

    if (isChanged) {
      Alert.alert(
        'Unsaved Changes',
        'You have modified member split selections. What would you like to do?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { 
            text: 'Discard', 
            style: 'destructive',
            onPress: () => {
              setSelectedExpenseToEdit(null);
              setSplitModalVisible(false);
            }
          },
          { 
            text: 'Save', 
            onPress: () => handleSaveExpenseSplit()
          }
        ]
      );
    } else {
      setSplitModalVisible(false);
    }
  };

  const handleCloseCreateModal = () => {
    if (newGroupName.trim()) {
      Alert.alert(
        'Unsaved Changes',
        'You have entered a group name. What would you like to do?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { 
            text: 'Discard', 
            style: 'destructive',
            onPress: () => {
              setNewGroupName('');
              setCreateModalVisible(false);
            }
          },
          { 
            text: 'Save / Create', 
            onPress: () => handleCreateGroup()
          }
        ]
      );
    } else {
      setCreateModalVisible(false);
    }
  };

  const handleCloseJoinModal = () => {
    if (inviteCodeInput.trim()) {
      Alert.alert(
        'Unsaved Changes',
        'You have entered an invite code. What would you like to do?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { 
            text: 'Discard', 
            style: 'destructive',
            onPress: () => {
              setInviteCodeInput('');
              setJoinModalVisible(false);
            }
          },
          { 
            text: 'Save / Join', 
            onPress: () => handleJoinGroup()
          }
        ]
      );
    } else {
      setJoinModalVisible(false);
    }
  };

  const handleSaveExpenseSplit = async () => {
    if (!selectedExpenseToEdit || !currentAppUser) return;
    if (editSplitUserIds.length === 0) {
      Alert.alert('Validation Error', 'At least one member must be selected for the expense split.');
      return;
    }
    setSplitModalVisible(false);
    setSavingSplit(true);
    try {
      const previousState = {
        itemName: selectedExpenseToEdit.itemName,
        price: selectedExpenseToEdit.price,
        quantity: selectedExpenseToEdit.quantity,
        category: selectedExpenseToEdit.category,
        splitUserIds: selectedExpenseToEdit.splitUserIds || [],
      };
      await require('../../services/expenseService').expenseService.updateExpense(
        selectedExpenseToEdit.id,
        { splitUserIds: editSplitUserIds },
        currentAppUser.id,
        currentAppUser.name,
        previousState
      );
      setSelectedExpenseToEdit(null);
      Alert.alert('Success', 'Expense split updated successfully.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update expense split');
    } finally {
      setSavingSplit(false);
    }
  };

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
      setCreateError('Group name is required');
      return;
    }
    setCreateModalVisible(false);
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
      setCreateError('');
      Alert.alert('Success', 'Group created successfully!');
    } catch (e: any) {
      setCreateError(e.message || 'Failed to create group');
      setCreateModalVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGroup = async () => {
    if (!inviteCodeInput.trim()) {
      setJoinError('Invite code is required');
      return;
    }
    setJoinModalVisible(false);
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
      setJoinError('');
      setJoinModalVisible(false);
      Alert.alert('Success', 'Joined group successfully!');
    } catch (e: any) {
      setJoinError(e.message || 'Failed to join group');
    } finally {
      setLoading(false);
    }
  };

  const handleAddWalletMoney = async () => {
    if (!currentAppUser) return;

    const hasWalletInput = walletAmountInput.trim().length > 0;
    let addedVal = 0;

    if (hasWalletInput) {
      addedVal = Number(walletAmountInput.trim());
      if (isNaN(addedVal) || addedVal < 0) {
        setWalletError('Please enter a valid positive number');
        return;
      }
    }

    const parsedTarget = monthlyTargetInput.trim() ? parseFloat(monthlyTargetInput.trim()) : 0;
    const targetVal = isNaN(parsedTarget) || parsedTarget < 0 ? 0 : parsedTarget;

    setWalletModalVisible(false);
    setLoading(true);
    try {
      const viewingMonthKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;
      const existingMonthlyWallets = currentAppUser.monthlyWallets || {};
      const currentMonthWallet = existingMonthlyWallets[viewingMonthKey] !== undefined
        ? existingMonthlyWallets[viewingMonthKey]
        : (viewingMonthKey === '2026-08' ? (currentAppUser.walletBalance || 0) : 0);

      const newBal = walletOperation === 'add' 
        ? currentMonthWallet + addedVal 
        : Math.max(0, currentMonthWallet - addedVal);

      const updatedMonthlyWallets = {
        ...existingMonthlyWallets,
        [viewingMonthKey]: newBal
      };

      const now = new Date();
      const isViewingCurrentCalendarMonth = selectedDate.getFullYear() === now.getFullYear() && selectedDate.getMonth() === now.getMonth();

      await updateDoc(doc(db, 'users', currentAppUser.id), {
        monthlyWallets: updatedMonthlyWallets,
        monthlyTarget: targetVal,
        ...(isViewingCurrentCalendarMonth ? { walletBalance: newBal } : {})
      });

      // LOG AUDIT HISTORY
      if (addedVal > 0) {
        await require('../../services/expenseService').expenseService.logAuditLog({
          teamId: activeTeamIdStore || currentAppUser.teamId || '',
          entityId: currentAppUser.id,
          entityType: 'wallet_adjustment',
          action: 'updated',
          itemName: `${currentAppUser.name}'s Wallet ${walletOperation === 'add' ? 'Added (+)' : 'Subtracted (-)'} for ${viewingMonthKey}`,
          userId: currentAppUser.id,
          userName: currentAppUser.name,
          previousData: { walletBalance: currentMonthWallet, monthKey: viewingMonthKey },
          newData: { walletBalance: newBal, operation: walletOperation, amount: addedVal, monthKey: viewingMonthKey }
        });

        // PUSH REAL-TIME NOTIFICATION
        const targetTeamId = activeTeamIdStore || currentAppUser.teamId;
        if (targetTeamId) {
          const notifTitle = `Wallet ${walletOperation === 'add' ? 'Added (+)' : 'Subtracted (-)'}`;
          const notifDesc = `${currentAppUser.name} ${walletOperation === 'add' ? 'added' : 'subtracted'} ${formatAmount(addedVal)} ${walletOperation === 'add' ? 'to' : 'from'} ${selectedDate.toLocaleDateString('en-US', { month: 'short' })} wallet.`;
          await notificationService.notify(targetTeamId, notifTitle, notifDesc, 'walletUpdates');
        }
      }

      setCurrentAppUser({
        ...currentAppUser,
        monthlyWallets: updatedMonthlyWallets,
        monthlyTarget: targetVal,
        ...(isViewingCurrentCalendarMonth ? { walletBalance: newBal } : {})
      });

      setWalletAmountInput('');
      setMonthlyTargetInput('');
      setWalletError('');
      setWalletModalVisible(false);

      if (addedVal > 0) {
        Alert.alert('Success', `Successfully ${walletOperation === 'add' ? 'added' : 'subtracted'} ${formatAmount(addedVal)} ${walletOperation === 'add' ? 'to' : 'from'} your wallet.`);
      } else {
        Alert.alert('Success', `Monthly target updated to ${formatAmount(targetVal)}.`);
      }
    } catch (e: any) {
      setWalletError(e.message || 'Failed to update wallet details');
    } finally {
      setLoading(false);
    }
  };

  // Calculations for current month total spending
  const currentMonthExpenses = useMemo(() => {
    const selMonth = selectedDate.getMonth();
    const selYear = selectedDate.getFullYear();
    return userVisibleExpenses.filter(e => {
      const d = new Date(e.date);
      return d.getMonth() === selMonth && d.getFullYear() === selYear;
    });
  }, [userVisibleExpenses, selectedDate]);
  
  const totalSpending = useMemo(() => {
    return currentMonthExpenses.reduce((sum, e) => {
      const price = Number(e.price) || 0;
      const quantity = Number(e.quantity) || 0;
      return sum + (price * quantity);
    }, 0);
  }, [currentMonthExpenses]);

  const isCurrentMonth = useMemo(() => {
    const today = new Date();
    return selectedDate.getFullYear() === today.getFullYear() && selectedDate.getMonth() === today.getMonth();
  }, [selectedDate]);

  // Re-calculate user share and wallet balance
  const memberIds = useMemo(() => members.map(m => m.id), [members]);
  const shares = useMemo(() => {
    if (memberIds.length === 0) return {};
    return require('../../services/expenseService').expenseService.calculateShares({
      expenses: currentMonthExpenses,
      attendance: attendance, 
      allIds: memberIds
    });
  }, [currentMonthExpenses, attendance, memberIds]);

  const myShare = useMemo(() => shares[currentAppUser?.id || ''] || 0, [shares, currentAppUser?.id]);

  const viewingMonthKey = useMemo(() => {
    return `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;
  }, [selectedDate]);

  const { myWallet, totalWallet } = useMemo(() => {
    const getMemberMonthWallet = (m: any) => {
      if (m?.monthlyWallets && m.monthlyWallets[viewingMonthKey] !== undefined) {
        return m.monthlyWallets[viewingMonthKey];
      }
      if (viewingMonthKey === '2026-08' && (!m?.monthlyWallets || Object.keys(m.monthlyWallets).length === 0)) {
        return m?.walletBalance || 0;
      }
      return 0;
    };

    const mw = getMemberMonthWallet(currentAppUser);
    const tw = members.reduce((sum: number, m: any) => sum + getMemberMonthWallet(m), 0);
    return { myWallet: mw, totalWallet: tw };
  }, [viewingMonthKey, currentAppUser, members]);

  // Selected date attendance states
  const selectedDateStr = useMemo(() => selectedDate.toISOString().substring(0, 10), [selectedDate]);
  const myAttendance = useMemo(() => {
    return attendance.find(a => {
      try {
        const aDateStr = new Date(a.date).toISOString().substring(0, 10);
        return a.userId === currentAppUser?.id && aDateStr === selectedDateStr;
      } catch {
        return false;
      }
    });
  }, [attendance, currentAppUser?.id, selectedDateStr]);

  const attendedBreakfast = myAttendance ? myAttendance.attendedBreakfast : false;
  const attendedLunch = myAttendance ? myAttendance.attendedLunch : false;
  const attendedDinner = myAttendance ? myAttendance.attendedDinner : false;

  const handleToggleMealAttendance = async (meal: 'breakfast' | 'lunch' | 'dinner') => {
    if (!currentAppUser) return;
    const teamIdToUse = currentAppUser.teamId || `personal_${currentAppUser.id.split('_')[0]}`;
    
    const currentMeals: any[] = [];
    if (attendedBreakfast) currentMeals.push('breakfast');
    if (attendedLunch) currentMeals.push('lunch');
    if (attendedDinner) currentMeals.push('dinner');
    
    const prevMeals = [...currentMeals];
    
    let newMeals: any[] = [];
    if (currentMeals.includes(meal)) {
      newMeals = currentMeals.filter(m => m !== meal);
    } else {
      newMeals = [...currentMeals, meal];
    }
    
    const isPresent = newMeals.length > 0;

    // OPTIMISTIC LOCAL STATE UPDATE (0ms instant response)
    const updatedAttendance = [...attendance];
    const existingIndex = updatedAttendance.findIndex(a => {
      try {
        const aDateStr = new Date(a.date).toISOString().substring(0, 10);
        return a.userId === currentAppUser.id && aDateStr === selectedDateStr;
      } catch {
        return false;
      }
    });

    if (existingIndex > -1) {
      updatedAttendance[existingIndex] = {
        ...updatedAttendance[existingIndex],
        isPresent,
        attendedBreakfast: newMeals.includes('breakfast'),
        attendedLunch: newMeals.includes('lunch'),
        attendedDinner: newMeals.includes('dinner')
      };
    } else {
      updatedAttendance.push({
        id: `temp_${Date.now()}`,
        userId: currentAppUser.id,
        userName: currentAppUser.name,
        date: selectedDate,
        teamId: teamIdToUse,
        isPresent,
        attendedBreakfast: newMeals.includes('breakfast'),
        attendedLunch: newMeals.includes('lunch'),
        attendedDinner: newMeals.includes('dinner'),
        createdAt: new Date()
      } as any);
    }
    setAttendance(updatedAttendance);
    
    // Save in background
    require('../../services/expenseService').expenseService.markAttendance({
      userId: currentAppUser.id,
      userName: currentAppUser.name,
      date: selectedDate,
      isPresent,
      meals: newMeals,
      teamId: teamIdToUse,
      prevMeals
    }).catch((e: any) => {
      Alert.alert('Error', e?.message || 'Failed to update attendance');
    });
  };

  const handlePrevMonth = () => {
    const prev = new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1);
    if (prev < userJoinMonthStart && (prev.getFullYear() < userJoinMonthStart.getFullYear() || prev.getMonth() < userJoinMonthStart.getMonth())) {
      return;
    }
    setSelectedDate(prev);
  };

  const handleNextMonth = () => {
    const today = new Date();
    const next = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1);
    if (next.getFullYear() > today.getFullYear() || (next.getFullYear() === today.getFullYear() && next.getMonth() > today.getMonth())) {
      return;
    }
    setSelectedDate(next);
  };



  // Calendar setup (1st to end date of month)
  const renderCalendar = () => {
    const labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    return (
      <View style={styles.calendarContainer}>
        <View style={styles.calendarHeaderRow}>
          <TouchableOpacity onPress={handlePrevMonth} style={styles.monthNavBtn}>
            <Ionicons name="chevron-back" size={18} color={colors.primary} />
          </TouchableOpacity>

          <Text style={styles.calendarTitle}>
            {selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>

          <TouchableOpacity onPress={handleNextMonth} style={styles.monthNavBtn}>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <FlatList
          ref={flatListRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          data={calendarDays}
          keyExtractor={(item, index) => index.toString()}
          getItemLayout={(data, index) => (
            { length: 44, offset: 44 * index, index }
          )}
          onScrollToIndexFailed={(info) => {
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
            }, 100);
          }}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          renderItem={({ item, index }) => {
            const now = new Date();
            const isToday = item.getDate() === now.getDate() && item.getMonth() === now.getMonth() && item.getFullYear() === now.getFullYear();
            const isSelected = item.getDate() === selectedDate.getDate() && item.getMonth() === selectedDate.getMonth() && item.getFullYear() === selectedDate.getFullYear();
            const dayLabel = labels[item.getDay()];

            const isFuture = item > today;
            const isBeforeJoin = item < userJoinMonthStart;
            const isDisabled = isFuture || isBeforeJoin;

            return (
              <TouchableOpacity 
                disabled={isDisabled}
                style={[styles.dayCol, { width: 44, opacity: isDisabled ? 0.35 : 1 }]} 
                onPress={() => {
                  if (!isDisabled) {
                    setSelectedDate(item);
                    flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
                  }
                }}
              >
                <Text style={[styles.dayLabel, isToday && styles.todayLabel, isDisabled && { color: colors.textTertiary }]}>{dayLabel}</Text>
                <View style={[styles.dateCircle, isSelected && styles.dateCircleSelected, isDisabled && { backgroundColor: 'transparent' }]}>
                  <Text style={[styles.dateText, isSelected && styles.dateTextSelected, isDisabled && { color: colors.textTertiary }]}>{item.getDate()}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    );
  };

  // Grouped category expenses for today/selectedDate
  const categoryTotalsMap = useMemo(() => {
    const totals: Record<string, number> = { breakfast: 0, lunch: 0, dinner: 0, utility: 0 };
    const selDay = selectedDate.getDate();
    const selMonth = selectedDate.getMonth();
    const selYear = selectedDate.getFullYear();

    userVisibleExpenses.forEach(e => {
      const d = new Date(e.date);
      if (d.getDate() === selDay && d.getMonth() === selMonth && d.getFullYear() === selYear) {
        const cat = e.category || 'utility';
        const price = Number(e.price) || 0;
        const qty = Number(e.quantity) || 1;
        totals[cat] = (totals[cat] || 0) + (price * qty);
      }
    });

    return totals;
  }, [userVisibleExpenses, selectedDate]);

  const getCategoryTotal = (cat: string) => {
    return categoryTotalsMap[cat] || 0;
  };

  const mealCategories = [
    { name: 'Breakfast', key: 'breakfast', icon: 'cafe-outline' },
    { name: 'Lunch', key: 'lunch', icon: 'fast-food-outline' },
    { name: 'Dinner', key: 'dinner', icon: 'restaurant-outline' },
    { name: 'Utilities', key: 'utility', icon: 'flash-outline' },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <GlobalLoader message="Processing..." visible={loading} />
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
        {/* Header Greeting */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greetingText}>Good {getGreeting()}!</Text>
            <Text style={styles.userName}>{currentAppUser?.name || 'User'}</Text>
            
            {/* Active Group Name & Role below name (Clickable Dropdown Trigger) */}
            <TouchableOpacity 
              style={styles.activeGroupRowBtn} 
              onPress={() => setGroupDropdownVisible(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="people-outline" size={13} color={colors.primary} style={{ marginRight: 4 }} />
              <Text style={styles.activeGroupName} numberOfLines={1}>
                {currentGroupInfo.name}
              </Text>
              <Text style={styles.activeGroupDot}>{"\u2022"}</Text>
              <View style={[
                styles.groupRoleBadge, 
                (currentGroupInfo.role || 'Member').toLowerCase() === 'admin' ? styles.groupRoleBadgeAdmin : styles.groupRoleBadgeMember
              ]}>
                <Text style={[
                  styles.groupRoleBadgeText, 
                  (currentGroupInfo.role || 'Member').toLowerCase() === 'admin' ? styles.groupRoleBadgeTextAdmin : styles.groupRoleBadgeTextMember
                ]}>
                  {currentGroupInfo.role || 'Member'}
                </Text>
              </View>
              <Ionicons name="chevron-down-outline" size={13} color={colors.primary} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={[styles.iconBtn, { marginRight: 8 }]} 
              onPress={() => setTutorialModalVisible(true)} 
              activeOpacity={0.75}
            >
              <Ionicons name="book-outline" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={handleOpenNotifications} activeOpacity={0.75}>
              <Ionicons name="notifications-outline" size={21} color={colors.textPrimary} />
              {unreadNotifCount > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>
                    {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                  </Text>
                </View>
              )}
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

        {/* Progress Card (Only shown if monthlyTarget is set) */}
        {(() => {
          const targetLimit = currentAppUser?.monthlyTarget || 0;
          if (!targetLimit || targetLimit <= 0) return null;

          const spendingPercentage = Math.min(Math.round((totalSpending / targetLimit) * 100), 100);
          const radius = 24;
          const circumference = 2 * Math.PI * radius;
          const strokeDashoffset = circumference - (spendingPercentage / 100) * circumference;

          return (
            <View style={styles.progressCard}>
              <View>
                <Text style={styles.progressLabel}>Total spending</Text>
                <Text style={styles.progressValue}>{formatAmount(totalSpending)}</Text>
                <Text style={styles.progressPeriod}>This month (Target: {formatAmount(targetLimit)})</Text>
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
          {/* My Wallet Card (Green Background) */}
          <TouchableOpacity 
            style={[
              styles.statCard, 
              { 
                backgroundColor: darkMode ? '#1A3323' : '#E8F5E9',
                borderColor: darkMode ? '#2E7D32' : '#C8E6C9',
              }
            ]}
            onPress={openWalletModal}
            activeOpacity={0.8}
          >
            <View style={styles.statHeader}>
              <Ionicons name="wallet-outline" size={18} color={darkMode ? '#81C784' : '#2E7D32'} />
              <Text style={[styles.statLabel, { color: darkMode ? '#81C784' : '#2E7D32', fontWeight: '700' }]}>My Wallet</Text>
              <Ionicons name="add-circle" size={16} color={darkMode ? '#81C784' : '#2E7D32'} style={{ marginLeft: 'auto' }} />
            </View>
            <Text style={[styles.statValue, { color: darkMode ? '#FFFFFF' : '#2E7D32' }]}>
              {formatAmount(myWallet)}
            </Text>
            <View style={[styles.statSubRow, { borderTopColor: darkMode ? 'rgba(129, 199, 132, 0.25)' : 'rgba(46, 125, 50, 0.25)', paddingTop: 6 }]}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: darkMode ? '#FF8A80' : '#D32F2F', marginVertical: 1 }}>
                Spent: {formatAmount(myShare)}
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: darkMode ? '#FFB74D' : '#E65100', marginVertical: 1 }}>
                Left: {formatAmount(myWallet - myShare)}
              </Text>
            </View>
          </TouchableOpacity>
          
          {/* Collective Wallet Card (Orange Background) */}
          <View 
            style={[
              styles.statCard, 
              { 
                backgroundColor: darkMode ? '#33261A' : '#FFF3E0',
                borderColor: darkMode ? '#E65100' : '#FFE0B2',
              }
            ]}
          >
            <View style={styles.statHeader}>
              <Ionicons name="people-outline" size={18} color={darkMode ? '#FFB74D' : '#E65100'} />
              <Text style={[styles.statLabel, { color: darkMode ? '#FFB74D' : '#E65100', fontWeight: '700' }]}>Collective Wallet</Text>
            </View>
            <Text style={[styles.statValue, { color: darkMode ? '#FFFFFF' : '#E65100' }]}>
              {formatAmount(totalWallet)}
            </Text>
            <View style={[styles.statSubRow, { borderTopColor: darkMode ? 'rgba(255, 183, 77, 0.25)' : 'rgba(230, 81, 0, 0.25)', paddingTop: 6 }]}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: darkMode ? '#FF8A80' : '#D32F2F', marginVertical: 1 }}>
                Spent: {formatAmount(totalSpending)}
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: darkMode ? '#FFB74D' : '#E65100', marginVertical: 1 }}>
                Left: {formatAmount(totalWallet - totalSpending)}
              </Text>
            </View>
          </View>
        </View>

        {/* Money Circle Button Card */}
        {currentAppUser?.teamId && members.length > 1 && (
          <TouchableOpacity
            style={styles.moneyCircleBtnCard}
            onPress={() => navigation.navigate('MoneyCircle')}
            activeOpacity={0.82}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={styles.moneyCircleIconBadge}>
                <Ionicons name="repeat" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.loanQuickTitle}>Money Circle</Text>
                  <View style={styles.loanPrivateTag}>
                    <Ionicons name="lock-closed" size={9} color={colors.textSecondary} />
                    <Text style={styles.loanPrivateTagText}>Private</Text>
                  </View>
                </View>
                <Text style={styles.loanQuickSubDesc}>Give & Borrow personal ledger</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {loanSummary.netBalance !== 0 && (
                <View style={[
                  styles.loanSummaryPill, 
                  { backgroundColor: loanSummary.netBalance > 0 ? colors.financial.walletDepositLight : colors.financial.spentLight }
                ]}>
                  <Text style={[
                    styles.loanSummaryPillText,
                    { color: loanSummary.netBalance > 0 ? colors.financial.walletDeposit : colors.financial.spent }
                  ]}>
                    {loanSummary.netBalance > 0 
                      ? `+${currency} ${loanSummary.netBalance.toLocaleString()}` 
                      : `-${currency} ${Math.abs(loanSummary.netBalance).toLocaleString()}`}
                  </Text>
                </View>
              )}
              <View style={styles.openCircleBtnCircle}>
                <Ionicons name="chevron-forward" size={16} color={colors.primary} />
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* Week Calendar */}
        {renderCalendar()}

        {/* Categories list */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Daily Breakdown</Text>
        </View>

        {mealCategories.map((m) => {
          const categoryTotal = getCategoryTotal(m.key);

          return (
            <View key={m.key} style={{ marginBottom: 10 }}>
              <View style={styles.categoryRow}>
                <View style={styles.catIconBox}>
                  <Ionicons name={m.icon as any} size={20} color={colors.primary} />
                </View>
                <View style={styles.catInfo}>
                  <Text style={styles.catName}>{m.name}</Text>
                  <Text style={styles.catSpent}>{formatAmount(categoryTotal)}</Text>
                </View>
                <TouchableOpacity 
                  style={styles.addBtn}
                  onPress={() => navigation.navigate('AddExpense', { 
                    defaultCategory: m.key,
                    selectedDate: selectedDate.toISOString()
                  })}
                >
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Create Group Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={createModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { paddingBottom: modalBottomPadding }]}>
            <Text style={styles.modalTitle}>Create a new group</Text>
            <Text style={styles.modalSubtitle}>You will be the administrator of this group.</Text>

            <TextInput 
              style={[styles.modalInput, createError ? { borderColor: colors.error, borderWidth: 1.5 } : null]}
              placeholder="Group Name (e.g. My Family)"
              placeholderTextColor={colors.textSecondary}
              value={newGroupName}
              onChangeText={(txt) => {
                setNewGroupName(txt);
                if (createError) setCreateError('');
              }}
            />
            {createError ? (
              <Text style={{ color: colors.error, fontSize: 11, fontWeight: '600', marginTop: -8, marginBottom: 12, marginLeft: 4 }}>
                {createError}
              </Text>
            ) : null}

            <TouchableOpacity 
              style={styles.modalSubmitBtn}
              onPress={handleCreateGroup}
            >
              <Text style={styles.modalSubmitBtnText}>Create Group</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalCancelBtn}
              onPress={() => {
                setCreateError('');
                setCreateModalVisible(false);
              }}
            >
              <Text style={styles.modalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Join Group Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={joinModalVisible}
        onRequestClose={() => setJoinModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { paddingBottom: modalBottomPadding }]}>
            <Text style={styles.modalTitle}>Join a group</Text>
            <Text style={styles.modalSubtitle}>Enter the invite code (Team ID) provided by the group admin.</Text>

            <TextInput 
              style={[styles.modalInput, joinError ? { borderColor: colors.error, borderWidth: 1.5 } : null]}
              placeholder="Invite Code (e.g. A1B2C3D4)"
              placeholderTextColor={colors.textSecondary}
              value={inviteCodeInput}
              onChangeText={(txt) => {
                setInviteCodeInput(txt);
                if (joinError) setJoinError('');
              }}
              autoCapitalize="characters"
            />
            {joinError ? (
              <Text style={{ color: colors.error, fontSize: 11, fontWeight: '600', marginTop: -8, marginBottom: 12, marginLeft: 4 }}>
                {joinError}
              </Text>
            ) : null}

            <TouchableOpacity 
              style={[styles.modalSubmitBtn, { backgroundColor: '#2E7D32' }]}
              onPress={handleJoinGroup}
            >
              <Text style={styles.modalSubmitBtnText}>Join Group</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalCancelBtn}
              onPress={() => {
                setJoinError('');
                setJoinModalVisible(false);
              }}
            >
              <Text style={styles.modalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Group Switcher Dropdown Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={groupDropdownVisible}
        onRequestClose={() => setGroupDropdownVisible(false)}
      >
        <TouchableOpacity 
          style={styles.dropdownOverlay} 
          activeOpacity={1} 
          onPress={() => setGroupDropdownVisible(false)}
        >
          <View style={styles.groupDropdownCard} onStartShouldSetResponder={() => true}>
            <View style={styles.dropdownCaret} />
            {/* Header */}
            <View style={styles.dropdownHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="people" size={18} color={colors.primary} style={{ marginRight: 6 }} />
                <Text style={styles.dropdownTitle}>Switch Group</Text>
              </View>
              <TouchableOpacity onPress={() => setGroupDropdownVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
              {/* Personal Workspace Option */}
              <TouchableOpacity
                style={[
                  styles.dropdownGroupItem,
                  !currentAppUser?.teamId && styles.dropdownGroupItemSelected
                ]}
                onPress={handleSwitchToPersonalWorkspace}
              >
                <View style={styles.dropdownGroupIconBox}>
                  <Ionicons 
                    name="person" 
                    size={18} 
                    color={!currentAppUser?.teamId ? colors.primary : colors.textSecondary} 
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[
                    styles.dropdownGroupName,
                    !currentAppUser?.teamId && { color: colors.primary, fontWeight: 'bold' }
                  ]} numberOfLines={1}>
                    Personal Workspace
                  </Text>
                  <Text style={styles.dropdownGroupSub}>
                    Individual tracking
                  </Text>
                </View>

                <View style={[
                  styles.groupRoleBadge,
                  styles.groupRoleBadgeMember,
                  { marginRight: 8 }
                ]}>
                  <Text style={[styles.groupRoleBadgeText, styles.groupRoleBadgeTextMember]}>
                    Personal
                  </Text>
                </View>

                {!currentAppUser?.teamId ? (
                  <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                ) : (
                  <Ionicons name="ellipse-outline" size={20} color={colors.textTertiary} />
                )}
              </TouchableOpacity>

              {userTeams && userTeams.length > 0 ? (
                userTeams.map((team: any) => {
                  const targetTeamId = activeTeamIdStore || currentAppUser?.teamId;
                  const isSelected = team.teamId === targetTeamId;
                  return (
                    <TouchableOpacity
                      key={team.teamId}
                      style={[
                        styles.dropdownGroupItem,
                        isSelected && styles.dropdownGroupItemSelected
                      ]}
                      onPress={() => handleSwitchGroup(team)}
                    >
                      <View style={styles.dropdownGroupIconBox}>
                        <Ionicons 
                          name="people" 
                          size={18} 
                          color={isSelected ? colors.primary : colors.textSecondary} 
                        />
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[
                          styles.dropdownGroupName,
                          isSelected && { color: colors.primary, fontWeight: 'bold' }
                        ]} numberOfLines={1}>
                          {team.teamName}
                        </Text>
                        <Text style={styles.dropdownGroupSub}>
                          Code: {team.teamId}
                        </Text>
                      </View>

                      <View style={[
                        styles.groupRoleBadge,
                        (team.role || 'Member').toLowerCase() === 'admin' ? styles.groupRoleBadgeAdmin : styles.groupRoleBadgeMember,
                        { marginRight: 8 }
                      ]}>
                        <Text style={[
                          styles.groupRoleBadgeText,
                          (team.role || 'Member').toLowerCase() === 'admin' ? styles.groupRoleBadgeTextAdmin : styles.groupRoleBadgeTextMember
                        ]}>
                          {team.role || 'Member'}
                        </Text>
                      </View>

                      {isSelected ? (
                        <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                      ) : (
                        <Ionicons name="ellipse-outline" size={20} color={colors.textTertiary} />
                      )}
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: colors.textSecondary }}>No groups found</Text>
                </View>
              )}
            </ScrollView>

            {/* Quick Actions Footer */}
            <View style={styles.dropdownFooter}>
              <TouchableOpacity 
                style={styles.dropdownFooterBtn}
                onPress={() => {
                  setGroupDropdownVisible(false);
                  setCreateModalVisible(true);
                }}
              >
                <Ionicons name="add-circle-outline" size={16} color={colors.primary} style={{ marginRight: 4 }} />
                <Text style={styles.dropdownFooterBtnText}>Create Group</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.dropdownFooterBtn, { borderColor: colors.primary }]}
                onPress={() => {
                  setGroupDropdownVisible(false);
                  setJoinModalVisible(true);
                }}
              >
                <Ionicons name="key-outline" size={16} color={colors.primary} style={{ marginRight: 4 }} />
                <Text style={styles.dropdownFooterBtnText}>Join Group</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add Wallet Money Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={walletModalVisible}
        onRequestClose={handleCloseWalletModal}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { paddingBottom: modalBottomPadding }]}>
            <Text style={styles.modalTitle}>Update My Wallet</Text>
            <Text style={styles.modalSubtitle}>Add or subtract money from your personal wallet balance, or configure your monthly spending target.</Text>

            {/* Operation Selector: Add (+) vs Subtract (-) */}
            <View style={{ flexDirection: 'row', width: '100%', marginBottom: 14, backgroundColor: colors.inputBg, borderRadius: 10, padding: 4 }}>
              <TouchableOpacity 
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  alignItems: 'center',
                  borderRadius: 8,
                  backgroundColor: walletOperation === 'add' ? '#2E7D32' : 'transparent'
                }}
                onPress={() => setWalletOperation('add')}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: walletOperation === 'add' ? '#FFFFFF' : colors.textSecondary }}>
                  + Add Funds
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  alignItems: 'center',
                  borderRadius: 8,
                  backgroundColor: walletOperation === 'subtract' ? '#D32F2F' : 'transparent'
                }}
                onPress={() => setWalletOperation('subtract')}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: walletOperation === 'subtract' ? '#FFFFFF' : colors.textSecondary }}>
                  - Subtract Funds
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput 
              style={[styles.modalInput, walletError ? { borderColor: colors.error, borderWidth: 1.5 } : null]}
              placeholder={`Amount to ${walletOperation === 'add' ? 'Add' : 'Subtract'} (e.g. 5000)`}
              placeholderTextColor={colors.textSecondary}
              value={walletAmountInput}
              onChangeText={(txt) => {
                setWalletAmountInput(txt);
                if (walletError) setWalletError('');
              }}
              keyboardType="numeric"
            />
            {walletError ? (
              <Text style={{ color: colors.error, fontSize: 11, fontWeight: '600', marginTop: -8, marginBottom: 12, marginLeft: 4 }}>
                {walletError}
              </Text>
            ) : null}

            <TextInput 
              style={styles.modalInput}
              placeholder="Monthly Target Amount (Optional)"
              placeholderTextColor={colors.textSecondary}
              value={monthlyTargetInput}
              onChangeText={setMonthlyTargetInput}
              keyboardType="numeric"
            />

            <TouchableOpacity 
              style={styles.modalSubmitBtn}
              onPress={handleAddWalletMoney}
            >
              <Text style={styles.modalSubmitBtnText}>Save</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalCancelBtn}
              onPress={handleCloseWalletModal}
            >
              <Text style={styles.modalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Notifications Modal (Full Page View) */}
      <Modal
        animationType="slide"
        transparent={false}
        visible={notificationsModalVisible}
        onRequestClose={() => {
          setIsNotifSelectMode(false);
          setSelectedNotifIds([]);
          setNotificationsModalVisible(false);
        }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: colors.divider,
            backgroundColor: colors.surface
          }}>
            <TouchableOpacity onPress={() => {
              setIsNotifSelectMode(false);
              setSelectedNotifIds([]);
              setNotificationsModalVisible(false);
            }} style={{ padding: 4 }}>
              <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>

            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary }}>
              {isNotifSelectMode ? `${selectedNotifIds.length} Selected` : 'Notifications'}
            </Text>

            {notifications.length > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {isNotifSelectMode ? (
                  <>
                    <TouchableOpacity onPress={handleSelectAllNotifs} style={{ padding: 4 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>
                        {selectedNotifIds.length === notifications.length ? 'Deselect All' : 'Select All'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setIsNotifSelectMode(false); setSelectedNotifIds([]); }} style={{ padding: 4 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>Cancel</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity onPress={handleMarkAllAsRead} style={{ padding: 4 }}>
                      <Ionicons name="mail-open-outline" size={20} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setIsNotifSelectMode(true)} style={{ padding: 4 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>Select</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleDeleteAllNotifs} style={{ padding: 4 }}>
                      <Ionicons name="trash-outline" size={20} color="#D32F2F" />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ) : (
              <View style={{ width: 40 }} />
            )}
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {notifications.length === 0 ? (
              <View style={{ alignItems: 'center', justifyContent: 'center', marginTop: 100 }}>
                <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <Ionicons name="notifications-off-outline" size={40} color={colors.textTertiary} />
                </View>
                <Text style={{ textAlign: 'center', color: colors.textPrimary, fontWeight: '600', fontSize: 16 }}>
                  No notifications yet
                </Text>
                <Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 6, fontSize: 13, paddingHorizontal: 32 }}>
                  Updates on expenses, wallet changes, and group activity will appear here (auto-cleared after 7 days).
                </Text>
              </View>
            ) : (
              notifications.map((notif) => {
                const isSelected = selectedNotifIds.includes(notif.id);
                return (
                  <TouchableOpacity
                    key={notif.id}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (isNotifSelectMode) {
                        toggleSelectNotif(notif.id);
                      } else {
                        handleNotificationClick(notif);
                      }
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      backgroundColor: isSelected ? colors.primary + '10' : colors.surface,
                      borderRadius: 14,
                      padding: 14,
                      marginBottom: 10,
                      borderWidth: 1,
                      borderColor: isSelected ? colors.primary : (notif.isNew ? colors.primary + '40' : colors.divider),
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.04,
                      shadowRadius: 3,
                      elevation: 1,
                    }}
                  >
                    {isNotifSelectMode && (
                      <View style={{ marginRight: 12, marginTop: 10 }}>
                        <Ionicons 
                          name={isSelected ? "checkbox" : "square-outline"} 
                          size={22} 
                          color={isSelected ? colors.primary : colors.textTertiary} 
                        />
                      </View>
                    )}

                    <View style={{
                      width: 42,
                      height: 42,
                      borderRadius: 12,
                      backgroundColor: notif.badgeBg,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                      marginTop: 2
                    }}>
                      <Ionicons name={notif.icon as any} size={20} color={notif.badgeColor} />
                    </View>

                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary, flex: 1, marginRight: 8 }}>
                          {notif.title}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {notif.isNew && (
                            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary }} />
                          )}
                          <View style={{ backgroundColor: notif.badgeBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: notif.badgeColor }}>
                              {notif.badgeText}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: 6 }}>
                        {notif.desc}
                      </Text>

                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                          {notif.time}
                        </Text>

                        {!isNotifSelectMode && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            {notif.isNew && (
                              <TouchableOpacity 
                                onPress={() => handleMarkSingleAsRead(notif.id)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                style={{ padding: 2 }}
                              >
                                <Ionicons name="mail-open-outline" size={16} color={colors.primary} />
                              </TouchableOpacity>
                            )}

                            <TouchableOpacity 
                              onPress={() => handleDeleteSingleNotification(notif.id)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              style={{ padding: 2 }}
                            >
                              <Ionicons name="trash-outline" size={16} color={colors.textTertiary} />
                            </TouchableOpacity>

                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.primary, marginRight: 2 }}>Open</Text>
                              <Ionicons name="chevron-forward" size={12} color={colors.primary} />
                            </View>
                          </View>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          {isNotifSelectMode && selectedNotifIds.length > 0 && (
            <View style={{
              padding: 16,
              borderTopWidth: 1,
              borderTopColor: colors.divider,
              backgroundColor: colors.surface,
              flexDirection: 'row',
              gap: 10
            }}>
              <TouchableOpacity
                onPress={handleMarkSelectedAsRead}
                style={{
                  flex: 1,
                  backgroundColor: colors.primary + '18',
                  borderWidth: 1,
                  borderColor: colors.primary,
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row'
                }}
              >
                <Ionicons name="mail-open-outline" size={18} color={colors.primary} style={{ marginRight: 6 }} />
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 14 }}>
                  Mark Read ({selectedNotifIds.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleDeleteSelectedNotifs}
                style={{
                  flex: 1,
                  backgroundColor: '#D32F2F',
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row'
                }}
              >
                <Ionicons name="trash-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
                  Delete ({selectedNotifIds.length})
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* Manage Expense Split Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={splitModalVisible}
        onRequestClose={handleCloseSplitModal}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { paddingBottom: modalBottomPadding }]}>
            <Text style={styles.modalTitle}>Manage Expense Split</Text>
            {selectedExpenseToEdit && (
              <Text style={styles.modalSubtitle}>
                {selectedExpenseToEdit.itemName} ({formatAmount((Number(selectedExpenseToEdit.price) || 0) * (Number(selectedExpenseToEdit.quantity) || 1))})
              </Text>
            )}

            {members.length > 0 && (
              <View style={{ width: '100%', marginVertical: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 8 }}>
                  Include Members in Split ({editSplitUserIds.length}/{members.length}):
                </Text>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 200, width: '100%' }}>
                  {members.map((m) => {
                    const isSelected = editSplitUserIds.includes(m.id);
                    return (
                      <TouchableOpacity
                        key={m.id}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          backgroundColor: isSelected ? colors.primary + '18' : colors.inputBg,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: isSelected ? colors.primary : colors.border,
                          marginBottom: 6
                        }}
                        onPress={() => {
                          if (isSelected) {
                            if (editSplitUserIds.length === 1) {
                              Alert.alert('Validation Error', 'At least one member must be included in the expense split.');
                              return;
                            }
                            setEditSplitUserIds(prev => prev.filter(id => id !== m.id));
                          } else {
                            setEditSplitUserIds(prev => [...prev, m.id]);
                          }
                        }}
                      >
                        <Text style={{ flex: 1, fontSize: 13, color: colors.textPrimary, fontWeight: isSelected ? 'bold' : 'normal' }}>
                          {m.name}
                        </Text>
                        <Ionicons 
                          name={isSelected ? "checkbox" : "square-outline"} 
                          size={18} 
                          color={isSelected ? colors.primary : colors.textTertiary} 
                        />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <TouchableOpacity 
              style={styles.modalSubmitBtn}
              onPress={handleSaveExpenseSplit}
              disabled={savingSplit}
            >
              {savingSplit ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.modalSubmitBtnText}>Save Split</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalCancelBtn}
              onPress={handleCloseSplitModal}
            >
              <Text style={styles.modalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Welcome & Dashboard Quick Guide Onboarding Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={onboardingVisible}
        onRequestClose={handleDismissOnboarding}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: '88%', paddingBottom: modalBottomPadding }]}>
            {/* Header */}
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="sparkles" size={22} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={styles.modalTitle}>Welcome to Share Expense!</Text>
              </View>
              <TouchableOpacity onPress={handleDismissOnboarding}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ width: '100%', flex: 1 }} contentContainerStyle={{ alignItems: 'center', paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
              {/* Feature Image */}
              <View style={{ width: '100%', height: 340, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface, marginBottom: 14, borderWidth: 1, borderColor: colors.border }}>
                <Image 
                  source={require('../../../assets/tutorials/01_dashboard_screen.png')} 
                  style={{ width: '100%', height: '100%' }} 
                  resizeMode="contain" 
                />
              </View>

              {/* Title */}
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: colors.textPrimary, textAlign: 'center', marginBottom: 6 }}>
                01. Dashboard Screen
              </Text>

              {/* Description */}
              <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19, marginBottom: 16, paddingHorizontal: 4 }}>
                Your Home for Smart Expense Tracking — Workspace/Group selector, Role badge, Notification bell, My Wallet & Collective Wallet cards, Date selector calendar, and Daily category quick-add buttons (+).
              </Text>

              {/* Location Hint Card for full tutorial */}
              <View style={{ 
                width: '100%', 
                backgroundColor: colors.primary + '12', 
                borderRadius: 14, 
                padding: 14, 
                borderWidth: 1, 
                borderColor: colors.primary + '30',
                flexDirection: 'row',
                alignItems: 'center'
              }}>
                <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Ionicons name="book" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 }}>
                    Full App Tutorial & Guides
                  </Text>
                  <Text style={{ fontSize: 11.5, color: colors.textSecondary, lineHeight: 16 }}>
                    You can view the full step-by-step guide anytime under <Text style={{ fontWeight: '700', color: colors.primary }}>Settings Tab → Tutorial & Guide</Text>.
                  </Text>
                </View>
              </View>
            </ScrollView>

            {/* Action Button */}
            <TouchableOpacity
              style={[styles.modalSubmitBtn, { backgroundColor: colors.primary, marginTop: 12, width: '100%' }]}
              onPress={handleDismissOnboarding}
            >
              <Text style={styles.modalSubmitBtnText}>Get Started</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* App Tutorial Modal */}
      <AppTutorialModal
        visible={tutorialModalVisible}
        onClose={() => setTutorialModalVisible(false)}
        modalBottomPadding={modalBottomPadding}
      />

      {/* Personal Loan (Khata) Modal */}
      <LoanModal
        visible={loanModalVisible}
        onClose={() => setLoanModalVisible(false)}
        members={members}
        currentAppUser={currentAppUser}
        currency={currency}
        darkMode={darkMode}
        initialType={loanModalInitialType}
        onSaveLoan={async (loanData) => {
          const newL = await loanService.addLoan(loanData);
          setPersonalLoans(prev => [newL, ...prev]);
          Alert.alert(
            'Recorded Successfully',
            loanData.lenderId === currentAppUser?.id
              ? `Personal loan of ${currency} ${loanData.amount.toLocaleString()} given to ${loanData.borrowerName}.`
              : `Personal loan of ${currency} ${loanData.amount.toLocaleString()} borrowed from ${loanData.lenderName}.`
          );
        }}
        existingLoans={personalLoans}
      />
    </SafeAreaView>
  );
}

const getStyles = (colors: any, darkMode: boolean) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  appBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.divider,
    paddingHorizontal: 16,
  },
  appBarTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  backBtn: {
    padding: 4,
  },
  container: {
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
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
  activeGroupRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginLeft: -6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    backgroundColor: colors.primary + '10',
  },
  activeGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  activeGroupName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    maxWidth: 180,
  },
  activeGroupDot: {
    fontSize: 13,
    color: colors.textTertiary,
    marginHorizontal: 6,
  },
  groupRoleBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  groupRoleBadgeAdmin: {
    backgroundColor: colors.primary + '20',
  },
  groupRoleBadgeMember: {
    backgroundColor: darkMode ? '#ffffff15' : '#e0e0e0',
  },
  groupRoleBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  groupRoleBadgeTextAdmin: {
    color: colors.primary,
  },
  groupRoleBadgeTextMember: {
    color: colors.textSecondary,
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  dropdownCaret: {
    position: 'absolute',
    top: -8,
    left: 120,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.surface,
    zIndex: 10,
  },
  groupDropdownCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    width: '93%',
    maxWidth: 380,
    position: 'absolute',
    top: Platform.OS === 'ios' ? 165 : 145,
    left: 12,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    marginBottom: 8,
  },
  dropdownTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  dropdownGroupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    marginVertical: 3,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dropdownGroupItemSelected: {
    backgroundColor: colors.primary + '14',
    borderColor: colors.primary + '40',
  },
  dropdownGroupIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownGroupName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  dropdownGroupSub: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 1,
  },
  dropdownFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  dropdownFooterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.primary + '12',
    marginHorizontal: 4,
  },
  dropdownFooterBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  headerActions: {
    flexDirection: 'row',
  },
  iconBtn: {
    width: 40,
    height: 40,
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  workspaceBanner: {
    backgroundColor: darkMode ? '#152C3E' : '#E3F2FD',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: darkMode ? '#0D47A1' : '#BBDEFB',
  },
  bannerTextCol: {
    marginBottom: 8,
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
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressLabel: {
    fontSize: 12,
    color: colors.primaryDark,
  },
  progressValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
    marginVertical: 2,
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
    marginBottom: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.cardBg,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 3,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 6,
  },
  statValue: {
    fontSize: 17,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  statSubRow: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 4,
  },
  statSubLabel: {
    fontSize: 9,
    color: colors.textSecondary,
    marginVertical: 1,
  },
  moneyCircleBtnCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  moneyCircleIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  loanIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loanQuickTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  loanQuickSubDesc: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 1,
  },
  loanPrivateTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  loanPrivateTagText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  loanSummaryPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  loanSummaryPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  openCircleBtnCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loanActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  giveLoanBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.financial.walletDepositLight,
    borderWidth: 1.5,
    borderColor: colors.financial.walletDeposit,
    borderRadius: 13,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  loanBtnIconCircleGreen: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.financial.walletDeposit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  giveLoanBtnTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.financial.walletDeposit,
  },
  loanBtnSubtitle: {
    fontSize: 9.5,
    color: colors.textSecondary,
    marginTop: 1,
  },
  borrowLoanBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.financial.spentLight,
    borderWidth: 1.5,
    borderColor: colors.financial.spent,
    borderRadius: 13,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  loanBtnIconCircleRed: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.financial.spent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  borrowLoanBtnTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.financial.spent,
  },
  calendarContainer: {
    backgroundColor: colors.cardBg,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  calendarTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  monthNavBtn: {
    padding: 4,
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
    marginBottom: 4,
  },
  todayLabel: {
    color: colors.primary,
    fontWeight: 'bold',
  },
  dateCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateCircleSelected: {
    backgroundColor: colors.primary,
  },
  dateText: {
    fontSize: 12,
    color: colors.textPrimary,
  },
  dateTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  sectionHeader: {
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  attendanceContainer: {
    backgroundColor: colors.cardBg,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
    marginTop: 2,
  },
  attendanceTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  mealsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mealCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 6,
    flex: 1,
    justifyContent: 'center',
    marginHorizontal: 3,
  },
  mealCheckboxActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  mealText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginLeft: 4,
  },
  mealTextActive: {
    color: colors.primaryDark,
  },
  categoryRow: {
    flexDirection: 'row',
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    marginBottom: 6,
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
    ...StyleSheet.absoluteFill,
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
    paddingBottom: Platform.OS === 'ios' ? 24 : 20,
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
  unreadBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.cardBg,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 4,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
    textAlign: 'center',
    includeFontPadding: false,
  },
});
