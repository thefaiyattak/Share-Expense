import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getThemeColors } from '../utils/theme';
import { AppUser, PersonalLoan } from '../models/types';
import AppDatePickerModal from './AppDatePickerModal';

interface LoanModalProps {
  visible: boolean;
  onClose: () => void;
  members: AppUser[];
  currentAppUser: AppUser | null;
  currency: string;
  darkMode?: boolean;
  initialType?: 'give' | 'borrow';
  initialMemberId?: string;
  onSaveLoan: (loan: Omit<PersonalLoan, 'id' | 'createdAt'>) => Promise<void>;
  existingLoans?: PersonalLoan[];
}

export default function LoanModal({
  visible,
  onClose,
  members,
  currentAppUser,
  currency,
  darkMode = false,
  initialType = 'give',
  initialMemberId,
  onSaveLoan,
  existingLoans = [],
}: LoanModalProps) {
  const colors = getThemeColors(darkMode);
  const styles = getStyles(colors, darkMode);

  // Form State
  const [loanType, setLoanType] = useState<'give' | 'borrow'>(initialType);
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [date, setDate] = useState<Date>(new Date());
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // Available group members (excluding current user)
  const otherMembers = useMemo(() => {
    return members.filter(m => m.id !== currentAppUser?.id);
  }, [members, currentAppUser]);

  React.useEffect(() => {
    if (visible) {
      setLoanType(initialType);
      if (initialMemberId && otherMembers.some(m => m.id === initialMemberId)) {
        setSelectedMemberId(initialMemberId);
      } else if (otherMembers.length > 0) {
        setSelectedMemberId(otherMembers[0].id);
      }
      setAmount('');
      setNote('');
      setDate(new Date());
    }
  }, [visible, initialType, initialMemberId, otherMembers]);

  const selectedMember = useMemo(() => {
    return otherMembers.find(m => m.id === selectedMemberId);
  }, [otherMembers, selectedMemberId]);

  // Current balance between current user & selected member
  const currentNetBalanceWithSelected = useMemo(() => {
    if (!currentAppUser || !selectedMemberId) return 0;
    let net = 0;
    existingLoans.forEach(l => {
      if (l.status === 'SETTLED') return;
      if (l.lenderId === currentAppUser.id && l.borrowerId === selectedMemberId) {
        net += l.amount;
      } else if (l.borrowerId === currentAppUser.id && l.lenderId === selectedMemberId) {
        net -= l.amount;
      }
    });
    return net;
  }, [currentAppUser, selectedMemberId, existingLoans]);

  const handleSave = async () => {
    if (!currentAppUser) {
      Alert.alert('Error', 'You must be logged in to record a loan.');
      return;
    }
    if (!selectedMember) {
      Alert.alert('Select Member', 'Please select which member you are lending to or borrowing from.');
      return;
    }
    const numAmount = parseFloat(amount.trim());
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid loan amount.');
      return;
    }

    setSaving(true);
    try {
      const isGive = loanType === 'give';
      const lenderId = isGive ? currentAppUser.id : selectedMember.id;
      const lenderName = isGive ? currentAppUser.name : selectedMember.name;
      const borrowerId = isGive ? selectedMember.id : currentAppUser.id;
      const borrowerName = isGive ? selectedMember.name : currentAppUser.name;

      await onSaveLoan({
        teamId: currentAppUser.teamId,
        lenderId,
        lenderName,
        borrowerId,
        borrowerName,
        amount: Math.round(numAmount),
        date: date.toISOString(),
        note: note.trim() || (isGive ? 'Personal loan given' : 'Personal loan borrowed'),
        status: 'PENDING',
      });

      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save personal loan.');
    } finally {
      setSaving(false);
    }
  };

  const isGive = loanType === 'give';
  // Use app UI theme primary (#4CAF50) and error (#D32F2F)
  const activeColor = isGive ? colors.primary : colors.error;
  const activeBg = isGive ? colors.primaryLight : '#FFEBEE';
  const activeBorder = isGive ? colors.primary : colors.error;

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.modalContent}>
          <View style={styles.handleBar} />

          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={[styles.headerBadge, { backgroundColor: activeBg, borderColor: activeColor + '40' }]}>
                <Ionicons
                  name={isGive ? 'arrow-up' : 'arrow-down'}
                  size={20}
                  color={activeColor}
                />
              </View>
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.modalTitle}>
                  {isGive ? 'Lend Money' : 'Borrow Money'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <Ionicons name="lock-closed" size={10} color={colors.textSecondary} />
                  <Text style={styles.modalSubtitle}>Private · Visible only to both members</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ width: '100%' }} showsVerticalScrollIndicator={false}>
            {/* Amount Hero Card */}
            <View style={[styles.amountHeroCard, { borderColor: activeColor + '35' }]}>
              <Text style={styles.amountHeroLabel}>
                {isGive ? 'YOU ARE LENDING' : 'YOU ARE BORROWING'}
              </Text>
              <View style={styles.amountInputRow}>
                <Text style={[styles.amountCurrencyPrefix, { color: activeColor }]}>{currency}</Text>
                <TextInput
                  style={[styles.heroAmountInput, { color: colors.textPrimary }]}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.textTertiary}
                  value={amount}
                  onChangeText={setAmount}
                  autoFocus={true}
                />
              </View>
            </View>

            {/* Member Picker */}
            <Text style={styles.fieldLabel}>
              {isGive ? 'LEND TO WHOM?' : 'BORROW FROM WHOM?'}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.memberList}
            >
              {otherMembers.map(m => {
                const isSelected = m.id === selectedMemberId;
                const initials = m.name.substring(0, 2).toUpperCase();
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[
                      styles.memberChip,
                      isSelected && { 
                        borderColor: activeColor, 
                        backgroundColor: activeBg,
                        shadowColor: activeColor,
                        shadowOpacity: 0.15,
                        shadowRadius: 6,
                        elevation: 2,
                      },
                    ]}
                    onPress={() => setSelectedMemberId(m.id)}
                    activeOpacity={0.8}
                  >
                    <View style={[
                      styles.memberAvatar, 
                      { backgroundColor: isSelected ? activeColor : colors.inputBg }
                    ]}>
                      <Text style={[styles.memberAvatarText, { color: isSelected ? '#FFFFFF' : colors.textPrimary }]}>
                        {initials}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.memberChipName,
                        isSelected && { color: activeColor, fontWeight: '800' },
                      ]}
                      numberOfLines={1}
                    >
                      {m.name}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={15} color={activeColor} style={{ marginLeft: 4 }} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Current Balance Ledger Pill */}
            {selectedMember && currentNetBalanceWithSelected !== 0 && (
              <View style={[
                styles.balancePill, 
                { 
                  backgroundColor: currentNetBalanceWithSelected > 0 ? colors.financial.walletDepositLight : colors.financial.spentLight,
                  borderColor: (currentNetBalanceWithSelected > 0 ? colors.financial.walletDeposit : colors.financial.spent) + '30'
                }
              ]}>
                <Ionicons
                  name="swap-horizontal"
                  size={15}
                  color={currentNetBalanceWithSelected > 0 ? colors.financial.walletDeposit : colors.financial.spent}
                  style={{ marginRight: 8 }}
                />
                <Text style={[
                  styles.balancePillText, 
                  { color: currentNetBalanceWithSelected > 0 ? colors.financial.walletDeposit : colors.financial.spent }
                ]}>
                  Ledger:{' '}
                  <Text style={{ fontWeight: '800' }}>
                    {currentNetBalanceWithSelected > 0
                      ? `${selectedMember.name} owes you ${currency} ${currentNetBalanceWithSelected.toLocaleString()}`
                      : `You owe ${selectedMember.name} ${currency} ${Math.abs(currentNetBalanceWithSelected).toLocaleString()}`}
                  </Text>
                </Text>
              </View>
            )}

            {/* Details Card (Date & Note) */}
            <View style={styles.detailsCard}>
              {/* Date button */}
              <TouchableOpacity
                style={styles.datePickerBtn}
                onPress={() => setDatePickerVisible(true)}
                activeOpacity={0.8}
              >
                <View style={styles.detailIconCircle}>
                  <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.detailMiniLabel}>DATE</Text>
                  <Text style={styles.dateText}>
                    {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
                <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
              </TouchableOpacity>

              <View style={styles.detailDivider} />

              {/* Note input */}
              <View style={styles.noteRow}>
                <View style={styles.detailIconCircle}>
                  <Ionicons name="document-text-outline" size={16} color={colors.textSecondary} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.detailMiniLabel}>NOTE (OPTIONAL)</Text>
                  <TextInput
                    style={styles.noteInput}
                    placeholder="e.g. Travel loan, food split"
                    placeholderTextColor={colors.textTertiary}
                    value={note}
                    onChangeText={setNote}
                  />
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Action Button */}
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: activeColor, shadowColor: activeColor }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Ionicons
              name={isGive ? 'arrow-up' : 'arrow-down'}
              size={18}
              color="#FFFFFF"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.saveBtnText}>
              {saving
                ? 'Recording...'
                : isGive
                ? `Confirm Lent (${currency} ${amount ? parseFloat(amount || '0').toLocaleString() : '0'})`
                : `Confirm Borrowed (${currency} ${amount ? parseFloat(amount || '0').toLocaleString() : '0'})`}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Date Picker Modal */}
      <AppDatePickerModal
        visible={datePickerVisible}
        initialDate={date}
        maximumDate={new Date()}
        onConfirm={(newD) => {
          setDate(newD);
          setDatePickerVisible(false);
        }}
        onCancel={() => setDatePickerVisible(false)}
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
      paddingBottom: Platform.OS === 'ios' ? 36 : 24,
      maxHeight: '90%',
      alignItems: 'center',
    },
    handleBar: {
      width: 40,
      height: 4.5,
      borderRadius: 3,
      backgroundColor: darkMode ? '#475569' : '#CBD5E1',
      marginBottom: 12,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
      marginBottom: 16,
    },
    headerBadge: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.textPrimary,
      letterSpacing: -0.2,
    },
    modalSubtitle: {
      fontSize: 11.5,
      color: colors.textSecondary,
      marginTop: 2,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.inputBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fieldLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.textTertiary,
      letterSpacing: 0.6,
      marginBottom: 8,
      marginTop: 6,
    },
    memberList: {
      flexDirection: 'row',
      gap: 10,
      paddingBottom: 4,
    },
    memberChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderWidth: 1.5,
      borderColor: colors.border,
      marginRight: 8,
    },
    memberAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },
    memberAvatarText: {
      fontSize: 11,
      fontWeight: '800',
    },
    memberChipName: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    balancePill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      marginTop: 10,
      marginBottom: 6,
      borderWidth: 1,
    },
    balancePillText: {
      fontSize: 12,
      flex: 1,
    },
    amountHeroCard: {
      backgroundColor: colors.cardBg,
      borderRadius: 20,
      paddingHorizontal: 18,
      paddingVertical: 16,
      alignItems: 'center',
      borderWidth: 1.5,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    amountHeroLabel: {
      fontSize: 10.5,
      fontWeight: '800',
      color: colors.textTertiary,
      letterSpacing: 0.8,
      marginBottom: 6,
    },
    amountInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    amountCurrencyPrefix: {
      fontSize: 26,
      fontWeight: '900',
      marginRight: 6,
    },
    heroAmountInput: {
      fontSize: 36,
      fontWeight: '900',
      letterSpacing: -0.5,
      padding: 0,
      minWidth: 70,
      textAlign: 'center',
    },
    detailsCard: {
      backgroundColor: colors.cardBg,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 12,
      marginBottom: 12,
    },
    datePickerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
    },
    detailIconCircle: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: colors.inputBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    detailMiniLabel: {
      fontSize: 9.5,
      fontWeight: '800',
      color: colors.textTertiary,
      letterSpacing: 0.5,
    },
    dateText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
      marginTop: 2,
    },
    detailDivider: {
      height: 1,
      backgroundColor: colors.divider,
      marginHorizontal: 4,
    },
    noteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
    },
    noteInput: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textPrimary,
      padding: 0,
      marginTop: 2,
    },
    saveBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      paddingVertical: 15,
      borderRadius: 18,
      marginTop: 10,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 4,
    },
    saveBtnText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
  });
