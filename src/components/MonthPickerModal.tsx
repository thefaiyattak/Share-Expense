import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getThemeColors, AppColors } from '../utils/theme';

interface MonthPickerModalProps {
  visible: boolean;
  selectedDate: Date;
  minDate?: Date;
  maxDate?: Date;
  onSelect: (date: Date) => void;
  onClose: () => void;
  darkMode?: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function MonthPickerModal({
  visible,
  selectedDate,
  minDate,
  maxDate,
  onSelect,
  onClose,
  darkMode = false,
}: MonthPickerModalProps) {
  const colors = getThemeColors(darkMode);
  const [viewYear, setViewYear] = useState<number>(() => selectedDate.getFullYear());

  React.useEffect(() => {
    if (visible) {
      setViewYear(selectedDate.getFullYear());
    }
  }, [visible, selectedDate]);

  if (!visible) return null;

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  const isMonthDisabled = (monthIndex: number) => {
    const d = new Date(viewYear, monthIndex, 1);
    const endOfMonth = new Date(viewYear, monthIndex + 1, 0, 23, 59, 59);

    if (maxDate && d > maxDate) return true;
    if (minDate && endOfMonth < minDate) return true;
    return false;
  };

  const handleSelectMonth = (monthIndex: number) => {
    const newDate = new Date(viewYear, monthIndex, 1);
    onSelect(newDate);
    onClose();
  };

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.dialogCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              {/* Header */}
              <View style={[styles.header, { backgroundColor: AppColors.primaryDark }]}>
                <Text style={styles.headerSubtitle}>SELECT SETTLEMENT MONTH</Text>
                <Text style={styles.headerTitle}>
                  {MONTH_NAMES[selectedDate.getMonth()]} {selectedDate.getFullYear()}
                </Text>
              </View>

              {/* Year Navigation */}
              <View style={styles.yearRow}>
                <TouchableOpacity
                  onPress={() => setViewYear(prev => prev - 1)}
                  style={styles.yearNavBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.yearText, { color: colors.textPrimary }]}>{viewYear}</Text>
                <TouchableOpacity
                  onPress={() => setViewYear(prev => prev + 1)}
                  style={styles.yearNavBtn}
                  disabled={maxDate && viewYear >= maxDate.getFullYear()}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={maxDate && viewYear >= maxDate.getFullYear() ? colors.textTertiary : colors.textPrimary}
                  />
                </TouchableOpacity>
              </View>

              {/* Months Grid */}
              <View style={styles.monthsGrid}>
                {MONTH_NAMES.map((name, index) => {
                  const isSelected = selectedDate.getFullYear() === viewYear && selectedDate.getMonth() === index;
                  const isCurrent = currentYear === viewYear && currentMonth === index;
                  const disabled = isMonthDisabled(index);

                  return (
                    <TouchableOpacity
                      key={name}
                      style={[
                        styles.monthCell,
                        isSelected && { backgroundColor: AppColors.primaryDark },
                        !isSelected && isCurrent && { borderColor: AppColors.primaryDark, borderWidth: 1.5 },
                        disabled && { opacity: 0.35 }
                      ]}
                      disabled={disabled}
                      onPress={() => handleSelectMonth(index)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.monthText,
                          { color: colors.textPrimary },
                          isSelected && { color: '#FFFFFF', fontWeight: 'bold' },
                          !isSelected && isCurrent && { color: AppColors.primaryDark, fontWeight: '700' },
                        ]}
                      >
                        {name.substring(0, 3)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Footer */}
              <View style={styles.footerRow}>
                <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
                  <Text style={[styles.cancelBtnText, { color: AppColors.primaryDark }]}>CANCEL</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialogCard: {
    width: '90%',
    maxWidth: 340,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 8,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E8F5E9',
    letterSpacing: 0.6,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 4,
  },
  yearRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  yearNavBtn: {
    padding: 6,
  },
  yearText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  monthsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  monthCell: {
    width: '30%',
    margin: '1.66%',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthText: {
    fontSize: 13,
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
});
