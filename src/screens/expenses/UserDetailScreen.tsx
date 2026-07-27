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
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../../store/useStore';
import { getThemeColors } from '../../utils/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import Svg, { Circle } from 'react-native-svg';
import { db } from '../../services/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { expenseService } from '../../services/expenseService';
import { pdfService } from '../../services/pdfService';

export default function UserDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { currency, expenses, currentAppUser, setCurrentAppUser, setExpenses, setMembers, members, darkMode } = useStore();

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

  // Modal states
  const [walletModalVisible, setWalletModalVisible] = useState(false);
  const [walletInput, setWalletInput] = useState(wallet.toString());

  const [expenseModalVisible, setExpenseModalVisible] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<any>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editHistory, setEditHistory] = useState<any[]>([]);

  // Access Controls
  const isAuthorized = currentAppUser?.role === 'admin' || currentAppUser?.id === userId;

  const left = wallet - spent;
  const over = balance >= 0;
  const bColor = over ? colors.primary : colors.error;

  const formatAmount = (val: number) => {
    return `${currency} ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(val)}`;
  };

  // Filter user specific expenses
  const userExpenses = expenses.filter((e) => e.userId === userId);

  // Math for category totals
  const categoryTotals: Record<string, number> = {
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    utility: 0,
  };
  userExpenses.forEach(e => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.price;
  });

  const totalCatSpent = Object.values(categoryTotals).reduce((a, b) => a + b, 0);

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
  const spentPct = wallet > 0 ? Math.max(0, Math.min(spent / wallet, 1)) : 0;
  const leftPct = wallet > 0 ? Math.max(0, Math.min(left / wallet, 1)) : 0;
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  
  const gap = 8; 
  const totalGaps = spentPct > 0 && leftPct > 0 ? 2 * gap : 0;
  const availableLength = circumference - totalGaps;
  
  const spentLength = spentPct * availableLength;
  const leftLength = leftPct * availableLength;
  
  const spentStrokeDashoffset = - (gap / 2);
  const leftStrokeDashoffset = - (spentLength + gap + (gap / 2));
  const usagePct = spentPct;

  // Handle Wallet Update
  const handleUpdateWallet = async () => {
    if (!walletInput.trim() || isNaN(Number(walletInput))) {
      Alert.alert('Error', 'Please enter a valid amount.');
      return;
    }
    setLoading(true);
    try {
      const newWalletAmount = parseFloat(walletInput);
      await updateDoc(doc(db, 'users', userId), {
        walletBalance: newWalletAmount
      });

      // Update local state if updating own wallet
      if (currentAppUser && currentAppUser.id === userId) {
        setCurrentAppUser({
          ...currentAppUser,
          walletBalance: newWalletAmount
        });
      }

      setWalletModalVisible(false);
      Alert.alert('Success', 'Wallet balance updated successfully.');
      navigation.goBack(); // go back to reload balances from database listener
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update wallet balance');
    } finally {
      setLoading(false);
    }
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
    setLoading(true);
    try {
      const previousState = {
        itemName: selectedExpense.itemName,
        price: selectedExpense.price,
        quantity: selectedExpense.quantity,
        category: selectedExpense.category,
      };

      await expenseService.updateExpense(
        selectedExpense.id,
        {
          itemName: editItemName.trim(),
          price: parseFloat(editPrice) || 0,
          quantity: editQty.trim() || '1',
        },
        currentAppUser?.id || '',
        currentAppUser?.name || 'Unknown',
        previousState
      );

      setExpenseModalVisible(false);
      setSelectedExpense(null);
      Alert.alert('Success', 'Expense modified successfully.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to modify expense');
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
            setLoading(true);
            try {
              await expenseService.deleteExpense(selectedExpense.id);
              setExpenseModalVisible(false);
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
      {loading && (
        <View style={styles.globalLoader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      <View style={[styles.header, { backgroundColor: avatarText }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <View style={styles.avatarLarge}>
            {profileImageUrl ? (
              <Image source={{ uri: profileImageUrl }} style={styles.avatarLargeImg} />
            ) : (
              <Text style={styles.avatarLargeText}>{userInitials}</Text>
            )}
          </View>
          <Text style={styles.userName}>{userName}</Text>
          {userId === currentAppUser?.id && (
            <Text style={styles.headerSelfLabel}>Viewing your profile</Text>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {/* Finance Cards Grid */}
        <View style={styles.financeGrid}>
          <View style={styles.row}>
            {/* Wallet Balance Card (Clickable to Edit if Authorized) */}
            <TouchableOpacity 
              disabled={!isAuthorized}
              style={[styles.fCard, { backgroundColor: colors.primaryLight }]}
              onPress={() => setWalletModalVisible(true)}
            >
              <View style={styles.cardHeaderRow}>
                <Ionicons name="wallet" size={20} color={colors.primaryDark} />
                {isAuthorized && <Ionicons name="create-outline" size={14} color={colors.primaryDark} style={{ marginLeft: 'auto' }} />}
              </View>
              <Text style={[styles.fValue, { color: colors.primaryDark }]} numberOfLines={1}>{formatAmount(wallet)}</Text>
              <Text style={[styles.fLabel, { color: colors.primaryDark }]}>Wallet</Text>
            </TouchableOpacity>

            <View style={[styles.fCard, { backgroundColor: '#FFEBEE', marginLeft: 8 }]}>
              <Ionicons name="cart" size={20} color={colors.error} />
              <Text style={[styles.fValue, { color: colors.error }]} numberOfLines={1}>{formatAmount(spent)}</Text>
              <Text style={[styles.fLabel, { color: colors.error }]}>Spent</Text>
            </View>

            <View style={[styles.fCard, { backgroundColor: '#FFF9C4', marginLeft: 8 }]}>
              <Ionicons name="save" size={20} color="#F57F17" />
              <Text style={[styles.fValue, { color: '#F57F17' }]} numberOfLines={1}>{formatAmount(left)}</Text>
              <Text style={[styles.fLabel, { color: '#F57F17' }]}>Left</Text>
            </View>
          </View>
        </View>

        {/* Category Breakdown */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Category breakdown</Text>
          {Object.entries(categoryTotals).map(([cat, amount]) => {
            const pct = totalCatSpent > 0 ? Math.round((amount / totalCatSpent) * 100) : 0;
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
          })}
        </View>

        {/* Wallet usage Gauge */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Wallet usage</Text>
          <View style={styles.gaugeContainer}>
            <View style={styles.gaugeSvg}>
              <Svg height="100" width="100" viewBox="0 0 100 100">
                {/* Background base circle (Added - Green) */}
                <Circle
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="transparent"
                  stroke={colors.primary}
                  strokeWidth="8"
                  opacity={0.2}
                />
                {/* Spent Segment (Red) */}
                {spentPct > 0 && (
                  <Circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="transparent"
                    stroke={colors.error}
                    strokeWidth="8"
                    strokeDasharray={`${spentLength} ${circumference}`}
                    strokeDashoffset={spentStrokeDashoffset}
                    strokeLinecap="round"
                    transform="rotate(-90, 50, 50)"
                  />
                )}
                {/* Left Segment (Yellow) */}
                {leftPct > 0 && (
                  <Circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="transparent"
                    stroke="#F57F17"
                    strokeWidth="8"
                    strokeDasharray={`${leftLength} ${circumference}`}
                    strokeDashoffset={leftStrokeDashoffset}
                    strokeLinecap="round"
                    transform="rotate(-90, 50, 50)"
                  />
                )}
              </Svg>
              <View style={styles.gaugeTextOverlay}>
                <Text style={styles.gaugeText}>{Math.round(usagePct * 100)}%</Text>
              </View>
            </View>
            
            <View style={styles.gaugeDetails}>
              <View style={styles.gaugeRow}>
                <View style={[styles.gaugeDot, { backgroundColor: colors.primary }]} />
                <Text style={styles.gaugeLabel}>Added (100%)</Text>
                <Text style={styles.gaugeValue}>{formatAmount(wallet)}</Text>
              </View>
              <View style={styles.gaugeRow}>
                <View style={[styles.gaugeDot, { backgroundColor: colors.error }]} />
                <Text style={styles.gaugeLabel}>Spent ({Math.round(spentPct * 100)}%)</Text>
                <Text style={styles.gaugeValue}>{formatAmount(spent)}</Text>
              </View>
              <View style={[styles.gaugeRow, styles.gaugeRowTotal]}>
                <View style={[styles.gaugeDot, { backgroundColor: left >= 0 ? '#F57F17' : colors.error }]} />
                <Text style={styles.gaugeLabel}>Left ({Math.round(leftPct * 100)}%)</Text>
                <Text style={[styles.gaugeValue, { fontWeight: 'bold', color: left >= 0 ? '#F57F17' : colors.error }]}>{formatAmount(left)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Expense History Section (Interactive details list) */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Expense History</Text>
          {userExpenses.length === 0 ? (
            <Text style={styles.emptyText}>No expenses logged yet.</Text>
          ) : (
            userExpenses.map((exp) => (
              <TouchableOpacity
                key={exp.id}
                style={styles.expenseRow}
                disabled={!isAuthorized}
                onPress={() => {
                  setSelectedExpense(exp);
                  setEditItemName(exp.itemName);
                  setEditQty(exp.quantity.toString());
                  setEditPrice(exp.price.toString());
                  setExpenseModalVisible(true);
                }}
              >
                <View style={styles.expenseMainCol}>
                  <Text style={styles.expenseName}>{exp.itemName}</Text>
                  <Text style={styles.expenseDate}>
                    {new Date(exp.date).toLocaleDateString()} · Qty: {exp.quantity}
                  </Text>
                  {exp.isEdited && (
                    <Text style={styles.editedLabel}>Edited by {exp.lastEditedBy}</Text>
                  )}
                </View>
                <View style={styles.expenseRightCol}>
                  <Text style={styles.expenseAmount}>
                    {formatAmount(exp.price)}
                  </Text>
                  {isAuthorized && (
                    <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} style={{ marginLeft: 8 }} />
                  )}
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Generate Statement */}
        <TouchableOpacity 
          style={styles.statementBtn}
          onPress={async () => {
            if (currentAppUser?.role !== 'admin' && currentAppUser?.id !== userId) {
              Alert.alert('Access Denied', 'Standard members can only generate their own statement.');
              return;
            }
            
            const userObj = members.find(m => m.id === userId) || (currentAppUser?.id === userId ? currentAppUser : null);
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
                        teamName: currentAppUser?.teamName || 'Share Expense',
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
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Set Wallet Balance</Text>
            <Text style={styles.modalSubtitle}>Specify the total deposit amount in this member's wallet.</Text>

            <TextInput 
              style={styles.modalInput}
              value={walletInput}
              onChangeText={setWalletInput}
              keyboardType="numeric"
            />

            <TouchableOpacity 
              style={styles.modalSubmitBtn}
              onPress={handleUpdateWallet}
            >
              <Text style={styles.modalSubmitBtnText}>Update Balance</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalCancelBtn}
              onPress={() => setWalletModalVisible(false)}
            >
              <Text style={styles.modalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
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
          <View style={styles.modalContent}>
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

            <TouchableOpacity 
              style={styles.modalSubmitBtn}
              onPress={handleEditExpense}
            >
              <Text style={styles.modalSubmitBtnText}>Save Changes</Text>
            </TouchableOpacity>

            {/* Display edit history list */}
            {editHistory.length > 0 && (
              <View style={{ width: '100%', marginTop: 16, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 8 }}>Modification History</Text>
                <ScrollView style={{ maxHeight: 120, width: '100%' }}>
                  {editHistory.map((hist, idx) => {
                    const prev = hist.previousData || {};
                    const histDate = hist.timestamp ? new Date(hist.timestamp).toLocaleDateString() : '';
                    return (
                      <View key={hist.id || idx} style={{ paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: colors.divider }}>
                        <Text style={{ fontSize: 10, color: colors.textSecondary }}>
                          Modified by {hist.userName} on {histDate}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.textPrimary, marginTop: 2 }}>
                          {prev.itemName} ({prev.quantity}) - {formatAmount(prev.price)} ➔ {hist.newData?.itemName} ({hist.newData?.quantity}) - {formatAmount(hist.newData?.price)}
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <TouchableOpacity 
              style={[styles.modalSubmitBtn, { backgroundColor: colors.error, marginTop: 8 }]}
              onPress={handleDeleteExpense}
            >
              <Text style={styles.modalSubmitBtnText}>Delete Expense</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalCancelBtn}
              onPress={() => {
                setExpenseModalVisible(false);
                setSelectedExpense(null);
              }}
            >
              <Text style={styles.modalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: 20,
    paddingBottom: 24,
    alignItems: 'center',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    top: 20,
    padding: 4,
  },
  headerContent: {
    alignItems: 'center',
    marginTop: 20,
  },
  avatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarLargeImg: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarLargeText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  userName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 10,
  },
  headerSelfLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.8)',
    fontStyle: 'italic',
    marginTop: 2,
  },
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  financeGrid: {
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
  },
  fCard: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fValue: {
    fontSize: 15,
    fontWeight: 'bold',
    marginVertical: 4,
  },
  fLabel: {
    fontSize: 11,
    opacity: 0.8,
  },
  sectionCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  catBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
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
    color: colors.textTertiary,
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
    paddingBottom: 40,
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
  modalSubmitBtn: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
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
  },
  modalCancelBtnText: {
    fontWeight: '600',
    color: colors.textSecondary,
    fontSize: 14,
  },
});
