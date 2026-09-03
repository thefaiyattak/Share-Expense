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
  // Give (Lent) = Green (Wallet Deposit theme color), Borrow = Red (Spent/Deficit theme color)
  const activeColor = isGive ? colors.financial.walletDeposit : colors.financial.spent;
  const activeBg = isGive ? colors.financial.walletDepositLight : colors.financial.spentLight;
  const activeBorder = isGive ? colors.financial.walletDeposit : colors.financial.spent;

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
              <View style={[styles.headerBadge, { backgroundColor: activeBg, borderColor: activeBorder }]}>
                <Ionicons
                  name={isGive ? 'arrow-up-circle' : 'arrow-down-circle'}
                  size={20}
                  color={activeColor}
                />
              </View>
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.modalTitle}>Money Circle</Text>
                <Text style={styles.modalSubtitle}>Strictly private between you and the member</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ width: '100%' }} showsVerticalScrollIndicator={false}>
            {/* Member Picker */}
            <Text style={styles.fieldLabel}>
              {isGive ? 'WHO DID YOU GIVE MONEY TO?' : 'WHO DID YOU BORROW FROM?'}
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
                      isSelected && { borderColor: activeColor, backgroundColor: activeBg },
                    ]}
                    onPress={() => setSelectedMemberId(m.id)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.memberAvatar, { backgroundColor: isSelected ? activeColor : colors.primary + '20' }]}>
                      <Text style={[styles.memberAvatarText, { color: isSelected ? '#FFFFFF' : colors.primary }]}>
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
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Current Balance Banner with selected member */}
            {selectedMember && currentNetBalanceWithSelected !== 0 && (
              <View style={[
                styles.balancePill, 
                { backgroundColor: currentNetBalanceWithSelected > 0 ? colors.financial.walletDepositLight : colors.financial.spentLight }
              ]}>
                <Ionicons
                  name="information-circle-outline"
                  size={15}
                  color={currentNetBalanceWithSelected > 0 ? colors.financial.walletDeposit : colors.financial.spent}
                  style={{ marginRight: 6 }}
                />
                <Text style={[
                  styles.balancePillText, 
                  { color: currentNetBalanceWithSelected > 0 ? colors.financial.walletDeposit : colors.financial.spent }
                ]}>
                  Current ledger:{' '}
                  <Text style={{ fontWeight: '800' }}>
                    {currentNetBalanceWithSelected > 0
                      ? `${selectedMember.name} owes you ${currency} ${currentNetBalanceWithSelected.toLocaleString()}`
                      : `You owe ${selectedMember.name} ${currency} ${Math.abs(currentNetBalanceWithSelected).toLocaleString()}`}
                  </Text>
                </Text>
              </View>
            )}

            {/* Amount Field */}
            <Text style={styles.fieldLabel}>AMOUNT ({currency})</Text>
            <View style={[styles.inputBox, { borderColor: activeColor + '60' }]}>
              <Text style={[styles.currencyPrefix, { color: activeColor }]}>{currency}</Text>
              <TextInput
                style={styles.amountInput}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textTertiary}
                value={amount}
                onChangeText={setAmount}
                autoFocus={false}
              />
            </View>

            {/* Date and Note Row */}
            <View style={styles.rowTwo}>
              {/* Date button */}
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.fieldLabel}>DATE</Text>
                <TouchableOpacity
                  style={styles.datePickerBtn}
                  onPress={() => setDatePickerVisible(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="calendar-outline" size={15} color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.dateText}>
                    {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Note input */}
              <View style={{ flex: 1.5 }}>
                <Text style={styles.fieldLabel}>NOTE (OPTIONAL)</Text>
                <TextInput
                  style={styles.noteInput}
                  placeholder="e.g. Travel loan"
                  placeholderTextColor={colors.textTertiary}
                  value={note}
                  onChangeText={setNote}
                />
              </View>
            </View>

            {/* Privacy Guarantee Pill */}
            <View style={styles.privacyGuarantee}>
              <Ionicons name="lock-closed" size={13} color={colors.textSecondary} style={{ marginRight: 6 }} />
              <Text style={styles.privacyGuaranteeText}>
                Visible only to you and <Text style={{ fontWeight: '700' }}>{selectedMember?.name || 'the recipient'}</Text>.
              </Text>
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
              name={isGive ? 'checkmark-circle' : 'checkmark-circle'}
              size={18}
              color="#FFFFFF"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.saveBtnText}>
              {saving
                ? 'Recording...'
                : isGive
                ? `Confirm Lent (${currency} ${amount || '0'})`
                : `Confirm Borrowed (${currency} ${amount || '0'})`}
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
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      marginTop: 10,
      marginBottom: 6,
    },
    balancePillText: {
      fontSize: 11.5,
      flex: 1,
    },
    inputBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.inputBg,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderWidth: 1.5,
      marginBottom: 10,
    },
    currencyPrefix: {
      fontSize: 18,
      fontWeight: '800',
      marginRight: 8,
    },
    amountInput: {
      flex: 1,
      fontSize: 22,
      fontWeight: '800',
      color: colors.textPrimary,
      padding: 0,
    },
    rowTwo: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    datePickerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.inputBg,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    dateText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    noteInput: {
      backgroundColor: colors.inputBg,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: colors.border,
      fontSize: 12.5,
      color: colors.textPrimary,
    },
    privacyGuarantee: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      marginBottom: 10,
    },
    privacyGuaranteeText: {
      fontSize: 11.5,
      color: colors.textSecondary,
    },
    saveBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      paddingVertical: 14,
      borderRadius: 16,
      marginTop: 8,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.3,
      shadowRadius: 5,
      elevation: 3,
    },
    saveBtnText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '800',
    },
  });
