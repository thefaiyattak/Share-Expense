import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TouchableWithoutFeedback
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getThemeColors, AppColors } from '../utils/theme';
import { useStore } from '../store/useStore';

interface AppDatePickerModalProps {
  visible: boolean;
  initialDate?: Date;
  maximumDate?: Date;
  minimumDate?: Date;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
  darkMode?: boolean;
}

export default function AppDatePickerModal({
  visible,
  initialDate = new Date(),
  maximumDate = new Date(),
  minimumDate,
  onConfirm,
  onCancel,
  darkMode = false
}: AppDatePickerModalProps) {
  const colors = getThemeColors(darkMode);
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate);
  const [viewDate, setViewDate] = useState<Date>(initialDate);

  useEffect(() => {
    if (visible) {
      setSelectedDate(initialDate || new Date());
      setViewDate(initialDate || new Date());
    }
  }, [visible, initialDate]);

  if (!visible) return null;

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const dayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const monthNameFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });

  const handlePrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const isSameDay = (d1: Date, d2: Date) => {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  const isDateDisabled = (targetDate: Date) => {
    if (maximumDate) {
      const maxEnd = new Date(maximumDate);
      maxEnd.setHours(23, 59, 59, 999);
      if (targetDate > maxEnd) return true;
    }
    if (minimumDate) {
      const minStart = new Date(minimumDate);
      minStart.setHours(0, 0, 0, 0);
      if (targetDate < minStart) return true;
    }
    return false;
  };

  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  // Build grid slots
  const gridSlots: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    gridSlots.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    gridSlots.push(d);
  }

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onCancel}
    >
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.dialogCard, { backgroundColor: colors.cardBg }]}>
              {/* Green Header */}
              <View style={[styles.header, { backgroundColor: AppColors.primaryDark }]}>
                <Text style={styles.headerYear}>{selectedDate.getFullYear()}</Text>
                <Text style={styles.headerDateText}>
                  {dayFormatter.format(selectedDate)}
                </Text>
              </View>

              {/* Month Selector Row */}
              <View style={styles.monthRow}>
                <TouchableOpacity onPress={handlePrevMonth} style={styles.navBtn}>
                  <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.monthTitle, { color: colors.textPrimary }]}>
                  {monthNameFormatter.format(viewDate)}
                </Text>
                <TouchableOpacity onPress={handleNextMonth} style={styles.navBtn}>
                  <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>

              {/* Weekday Labels */}
              <View style={styles.weekRow}>
                {weekDays.map((wd, i) => (
                  <Text key={i} style={[styles.weekDayText, { color: colors.textTertiary }]}>
                    {wd}
                  </Text>
                ))}
              </View>

              {/* Days Grid */}
              <View style={styles.daysGrid}>
                {gridSlots.map((dayNum, idx) => {
                  if (dayNum === null) {
                    return <View key={idx} style={styles.daySlot} />;
                  }

                  const slotDate = new Date(year, month, dayNum);
                  const selected = isSameDay(slotDate, selectedDate);
                  const disabled = isDateDisabled(slotDate);
                  const isToday = isSameDay(slotDate, new Date());

                  return (
                    <TouchableOpacity
                      key={idx}
                      disabled={disabled}
                      style={styles.daySlot}
                      onPress={() => setSelectedDate(slotDate)}
                    >
                      <View
                        style={[
                          styles.dayCircle,
                          selected && { backgroundColor: AppColors.primaryDark },
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayText,
                            { color: colors.textPrimary },
                            selected && { color: '#FFFFFF', fontWeight: 'bold' },
                            isToday && !selected && { color: AppColors.primaryDark, fontWeight: 'bold' },
                            disabled && { color: colors.textTertiary, opacity: 0.35 },
                          ]}
                        >
                          {dayNum}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Footer Actions */}
              <View style={styles.footerRow}>
                <TouchableOpacity onPress={onCancel} style={styles.actionBtn}>
                  <Text style={[styles.actionBtnText, { color: AppColors.primaryDark }]}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onConfirm(selectedDate)}
                  style={styles.actionBtn}
                >
                  <Text style={[styles.actionBtnText, { color: AppColors.primaryDark, fontWeight: 'bold' }]}>OK</Text>
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerYear: {
    fontSize: 14,
    color: '#E8F5E9',
    fontWeight: '500',
  },
  headerDateText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 4,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  monthTitle: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  navBtn: {
    padding: 6,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  weekDayText: {
    width: '14.2%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  daySlot: {
    width: '14.2%',
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayText: {
    fontSize: 13,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
