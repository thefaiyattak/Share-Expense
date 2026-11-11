import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useStore } from '../../store/useStore';
import { useNetworkStore } from '../../offline/network';
import { outbox, OutboxOp } from '../../offline/outbox';
import { syncEngine } from '../../offline/syncEngine';
import { localDb } from '../../offline/localDb';
import { getThemeColors } from '../../utils/theme';

export default function SyncOfflineScreen() {
  const navigation = useNavigation<any>();
  const { currentAppUser, darkMode } = useStore();
  const colors = getThemeColors(darkMode);
  const styles = getStyles(colors, darkMode);

  const isOnline = useNetworkStore((state) => state.isOnline);
  const syncing = useNetworkStore((state) => state.syncing);
  const lastSyncedAt = useNetworkStore((state) => state.lastSyncedAt);

  const [ops, setOps] = useState<OutboxOp[]>([]);
  const [cacheRowCount, setCacheRowCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const loadData = async () => {
    if (!currentAppUser?.id) return;
    try {
      const allOps = await outbox.getAllOps(currentAppUser.id);
      setOps(allOps);

      // Estimate cache rows
      try {
        const count = await localDb.getCacheCount();
        setCacheRowCount(count);
      } catch {
        setCacheRowCount(0);
      }
    } catch (e) {
      console.warn('Failed to load outbox/cache data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentAppUser?.id]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleSyncAll = async () => {
    if (!currentAppUser?.id) return;
    if (!isOnline) {
      Alert.alert('Offline', 'Cannot sync while offline. Please connect to the internet.');
      return;
    }
    await syncEngine.flush(currentAppUser.id);
    await loadData();
  };

  const handleRetryOp = async (op: OutboxOp) => {
    if (!currentAppUser?.id) return;
    await outbox.markSyncing(op.opId);
    await syncEngine.flush(currentAppUser.id);
    await loadData();
  };

  const handleDiscardOp = (op: OutboxOp) => {
    Alert.alert(
      'Discard Change',
      `Are you sure you want to discard this "${op.type}" operation? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            await outbox.markDone(op.opId);
            if (currentAppUser?.id) {
              await syncEngine.updateStoreCounts(currentAppUser.id);
            }
            await loadData();
          },
        },
      ]
    );
  };

  const handleClearReadCache = () => {
    Alert.alert(
      'Clear Read Cache',
      'This will clear local read cache snapshots. Unsynced pending writes in your Outbox will NOT be touched.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Cache',
          style: 'destructive',
          onPress: async () => {
            try {
              await localDb.clearAllCache();
              Alert.alert('Cache Cleared', 'Read cache has been cleared.');
              await loadData();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to clear cache');
            }
          },
        },
      ]
    );
  };

  const formatTimestamp = (ts: number | null) => {
    if (!ts) return 'Never';
    return new Date(ts).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sync & Offline Status</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* Status Card */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isOnline ? '#4CAF50' : '#FF9800' },
                ]}
              />
              <Text style={styles.cardTitle}>
                {isOnline ? 'Online (Connected)' : 'Offline (Disconnected)'}
              </Text>
            </View>
            {syncing && <ActivityIndicator size="small" color={colors.primary} />}
          </View>

          <Text style={styles.subText}>
            Last successful sync: {formatTimestamp(lastSyncedAt)}
          </Text>

          <TouchableOpacity
            style={[styles.syncButton, !isOnline && styles.disabledBtn]}
            onPress={handleSyncAll}
            disabled={!isOnline || syncing}
          >
            <Ionicons name="sync" size={16} color="#FFFFFF" />
            <Text style={styles.syncButtonText}>
              {syncing ? 'Syncing...' : 'Sync All Now'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Local Storage & Cache Card */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>Local Storage & Cache</Text>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>SQLite Cache Snapshots</Text>
            <Text style={styles.metricValue}>{cacheRowCount} documents</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Outbox Queue Entries</Text>
            <Text style={styles.metricValue}>{ops.length} entries</Text>
          </View>

          <TouchableOpacity style={styles.clearCacheBtn} onPress={handleClearReadCache}>
            <Ionicons name="trash-outline" size={15} color="#D32F2F" />
            <Text style={styles.clearCacheBtnText}>Clear Read Cache</Text>
          </TouchableOpacity>
        </View>

        {/* Outbox Operations List */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>Outbox Operations ({ops.length})</Text>

          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
          ) : ops.length === 0 ? (
            <View style={styles.emptyOutbox}>
              <Ionicons name="checkmark-circle-outline" size={36} color="#4CAF50" />
              <Text style={styles.emptyOutboxText}>Outbox is completely clear</Text>
              <Text style={styles.subText}>All your offline changes are synced with server.</Text>
            </View>
          ) : (
            ops.map((op) => (
              <View key={op.opId} style={styles.opCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.opType}>{op.type}</Text>
                  <View
                    style={[
                      styles.opBadge,
                      op.status === 'failed'
                        ? styles.badgeFailed
                        : op.status === 'syncing'
                        ? styles.badgeSyncing
                        : styles.badgePending,
                    ]}
                  >
                    <Text style={styles.badgeText}>{op.status.toUpperCase()}</Text>
                  </View>
                </View>

                <Text style={styles.opSub}>Target: {op.entityId || 'N/A'}</Text>
                <Text style={styles.opSub}>Queued: {formatTimestamp(op.createdAt)}</Text>
                {op.attempts > 0 && (
                  <Text style={styles.opSub}>Attempts: {op.attempts}</Text>
                )}
                {!!op.lastError && (
                  <Text style={styles.opError}>Error: {op.lastError}</Text>
                )}

                <View style={styles.opActionsRow}>
                  <TouchableOpacity
                    style={styles.retryBtn}
                    onPress={() => handleRetryOp(op)}
                  >
                    <Ionicons name="refresh" size={13} color={colors.primary} />
                    <Text style={styles.retryBtnText}>Retry</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.discardBtn}
                    onPress={() => handleDiscardOp(op)}
                  >
                    <Ionicons name="close" size={13} color="#D32F2F" />
                    <Text style={styles.discardBtnText}>Discard</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: any, darkMode: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    backBtn: {
      padding: 6,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    scrollContent: {
      padding: 16,
      gap: 16,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    statusDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    cardTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    subText: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 6,
    },
    syncButton: {
      marginTop: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      paddingVertical: 11,
      borderRadius: 10,
    },
    disabledBtn: {
      opacity: 0.5,
    },
    syncButtonText: {
      color: '#FFFFFF',
      fontWeight: '600',
      fontSize: 14,
    },
    sectionHeader: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 12,
    },
    metricRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
    },
    metricLabel: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    metricValue: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    clearCacheBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#FFCDD2',
      backgroundColor: darkMode ? '#2C1B1B' : '#FFEBEE',
    },
    clearCacheBtnText: {
      color: '#D32F2F',
      fontWeight: '600',
      fontSize: 12,
    },
    emptyOutbox: {
      alignItems: 'center',
      paddingVertical: 20,
    },
    emptyOutboxText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
      marginTop: 8,
    },
    opCard: {
      borderWidth: 1,
      borderColor: colors.divider,
      borderRadius: 10,
      padding: 12,
      marginTop: 10,
    },
    opType: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    opBadge: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
    },
    badgePending: {
      backgroundColor: '#E0E0E0',
    },
    badgeSyncing: {
      backgroundColor: '#BBDEFB',
    },
    badgeFailed: {
      backgroundColor: '#FFCDD2',
    },
    badgeText: {
      fontSize: 10,
      fontWeight: '700',
    },
    opSub: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    opError: {
      fontSize: 11,
      color: '#D32F2F',
      marginTop: 4,
    },
    opActionsRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 10,
    },
    retryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    retryBtnText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.primary,
    },
    discardBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: '#D32F2F',
    },
    discardBtnText: {
      fontSize: 11,
      fontWeight: '600',
      color: '#D32F2F',
    },
  });
