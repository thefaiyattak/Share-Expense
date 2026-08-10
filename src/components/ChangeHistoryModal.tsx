import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  Modal, 
  TouchableOpacity, 
  FlatList, 
  ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getThemeColors } from '../utils/theme';
import { useStore } from '../store/useStore';
import { EditHistory } from '../models/types';
import { expenseService } from '../services/expenseService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardVisible } from '../utils/useKeyboardVisible';

interface ChangeHistoryModalProps {
  visible: boolean;
  onClose: () => void;
  entityId?: string; // If provided, shows history for specific item; else shows team history
}

export default function ChangeHistoryModal({ visible, onClose, entityId }: ChangeHistoryModalProps) {
  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardVisible();
  const modalBottomPadding = isKeyboardVisible ? 14 : Math.max(insets.bottom + 6, 18);
  const { darkMode, activeTeamId, currency, members } = useStore();
  const colors = getThemeColors(darkMode);
  const styles = getStyles(colors);

  const [historyList, setHistoryList] = useState<EditHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);

    let unsub: () => void;
    if (entityId) {
      unsub = expenseService.getEditHistory(entityId, (data) => {
        setHistoryList(data);
        setLoading(false);
      });
    } else if (activeTeamId) {
      unsub = expenseService.getTeamEditHistory(activeTeamId, (data) => {
        setHistoryList(data);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }

    return () => {
      if (unsub) unsub();
    };
  }, [visible, entityId, activeTeamId]);

  const formatTime = (d: Date) => {
    if (!d || isNaN(d.getTime())) return '';
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${dateStr} at ${timeStr}`;
  };

  const getActionBadge = (item: EditHistory) => {
    const act = item.action || 'updated';
    if (act === 'created') return { label: 'Added', bg: '#E8F5E9', color: colors.primary };
    if (act === 'deleted') return { label: 'Deleted', bg: '#FFEBEE', color: colors.error };
    return { label: 'Modified', bg: '#E3F2FD', color: '#1565C0' };
  };

  const renderHistoryItem = ({ item }: { item: EditHistory }) => {
    const badge = getActionBadge(item);
    const prev = item.previousData || {};
    const curr = item.newData || {};
    const title = item.itemName || prev.itemName || curr.itemName || item.entityType.toUpperCase();

    // Compute change details summary
    const changes: string[] = [];
    if (prev.itemName && curr.itemName && prev.itemName !== curr.itemName) {
      changes.push(`Name: "${prev.itemName}" ➔ "${curr.itemName}"`);
    }
    if (prev.price !== undefined && curr.price !== undefined && prev.price !== curr.price) {
      changes.push(`Price: ${currency} ${prev.price} ➔ ${currency} ${curr.price}`);
    }
    if (prev.quantity && curr.quantity && prev.quantity !== curr.quantity) {
      changes.push(`Qty: ${prev.quantity} ➔ ${curr.quantity}`);
    }
    if (prev.walletBalance !== undefined && curr.walletBalance !== undefined && prev.walletBalance !== curr.walletBalance) {
      if (item.entityType === 'wallet_adjustment') {
        const typeLabel = curr.adjustmentType === 'debit' ? 'Debit (-)' : 'Credit (+)';
        const reasonText = curr.reason ? ` · Reason: "${curr.reason}"` : '';
        changes.push(`${typeLabel}: ${currency} ${curr.amount || Math.abs(curr.walletBalance - prev.walletBalance)}${reasonText}`);
        changes.push(`New Balance: ${currency} ${curr.walletBalance}`);
      } else if (item.entityType === 'month_end_transfer') {
        const sign = curr.isPositive ? '+' : '-';
        changes.push(`Transferred ${curr.fromMonth || 'Month'} ${sign}${currency} ${curr.transferAmount || Math.abs(curr.netTransfer || 0)} to active wallet`);
        changes.push(`New Balance: ${currency} ${curr.walletBalance}`);
      } else {
        changes.push(`Wallet Deposit: ${currency} ${prev.walletBalance} ➔ ${currency} ${curr.walletBalance}`);
      }
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
        changes.push(`Split Participants: ${prevIds.length} ➔ ${currIds.length} members`);
      }
    }

    return (
      <View style={styles.historyCard}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemNameText}>{title}</Text>
            <Text style={styles.userMetaText}>
              By <Text style={styles.userNameBold}>{item.userName}</Text> · {formatTime(item.timestamp)}
            </Text>
          </View>

          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
          </View>
        </View>

        {changes.length > 0 && (
          <View style={styles.diffContainer}>
            {changes.map((c, i) => (
              <Text key={i} style={styles.diffLine}>• {c}</Text>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalContent, { paddingBottom: modalBottomPadding }]}>
          {/* Modal Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleGroup}>
              <Ionicons name="time" size={22} color={colors.primary} />
              <Text style={styles.modalTitle}>Change Audit History</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loaderCenter}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading history log...</Text>
            </View>
          ) : historyList.length === 0 ? (
            <View style={styles.emptyCenter}>
              <Ionicons name="document-text-outline" size={48} color={colors.textTertiary} />
              <Text style={styles.emptyText}>No modification history recorded yet.</Text>
            </View>
          ) : (
            <FlatList
              data={historyList}
              keyExtractor={(item) => item.id || Math.random().toString()}
              renderItem={renderHistoryItem}
              contentContainerStyle={{ paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
            />
          )}

          <TouchableOpacity 
            style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12, width: '100%' }}
            onPress={onClose}
          >
            <Text style={{ fontWeight: 'bold', color: '#FFFFFF', fontSize: 15 }}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.cardBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginLeft: 8,
  },
  closeBtn: {
    padding: 4,
  },
  loaderCenter: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: colors.textSecondary,
    fontSize: 13,
  },
  emptyCenter: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 10,
    color: colors.textTertiary,
    fontSize: 13,
  },
  historyCard: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  itemNameText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  userMetaText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  userNameBold: {
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  diffContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: colors.divider,
  },
  diffLine: {
    fontSize: 11,
    color: colors.textSecondary,
    marginVertical: 1,
  },
});
