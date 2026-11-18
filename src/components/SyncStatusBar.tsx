import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useNetworkStore } from '../offline/network';
import { useStore } from '../store/useStore';

export default function SyncStatusBar() {
  const navigation = useNavigation<any>();
  const { darkMode } = useStore();
  const isOnline = useNetworkStore((state) => state.isOnline);
  const syncing = useNetworkStore((state) => state.syncing);
  const pendingCount = useNetworkStore((state) => state.pendingCount);
  const failedCount = useNetworkStore((state) => state.failedCount);
  const lastSyncedAt = useNetworkStore((state) => state.lastSyncedAt);

  const [showSyncedSuccess, setShowSyncedSuccess] = useState(false);

  useEffect(() => {
    if (isOnline && pendingCount === 0 && failedCount === 0 && lastSyncedAt) {
      const elapsed = Date.now() - lastSyncedAt;
      if (elapsed < 3000) {
        setShowSyncedSuccess(true);
        const timer = setTimeout(() => {
          setShowSyncedSuccess(false);
        }, 3000 - elapsed);
        return () => clearTimeout(timer);
      }
    }
    setShowSyncedSuccess(false);
  }, [isOnline, pendingCount, failedCount, lastSyncedAt]);

  const handlePress = () => {
    try {
      navigation.navigate('SyncOffline');
    } catch (e) {
      console.warn('Navigation to SyncOffline failed:', e);
    }
  };

  // State 1: Failed Ops requiring attention (highest priority)
  if (failedCount > 0) {
    return (
      <TouchableOpacity
        style={[styles.container, styles.failedBg]}
        onPress={handlePress}
        activeOpacity={0.85}
      >
        <Ionicons name="alert-circle" size={14} color="#D32F2F" />
        <Text style={[styles.text, { color: '#D32F2F' }]}>
          {failedCount} change{failedCount === 1 ? '' : 's'} need attention
        </Text>
        <Ionicons name="chevron-forward" size={12} color="#D32F2F" />
      </TouchableOpacity>
    );
  }

  // State 2: Offline
  if (!isOnline) {
    return (
      <TouchableOpacity
        style={[styles.container, darkMode ? styles.offlineDarkBg : styles.offlineLightBg]}
        onPress={handlePress}
        activeOpacity={0.85}
      >
        <Ionicons name="cloud-offline" size={14} color="#F57C00" />
        <Text style={[styles.text, { color: darkMode ? '#FFA726' : '#E65100' }]}>
          Offline - changes are saved on this device
        </Text>
      </TouchableOpacity>
    );
  }

  // State 3: Syncing in progress
  if (syncing || pendingCount > 0) {
    return (
      <TouchableOpacity
        style={[styles.container, styles.syncingBg]}
        onPress={handlePress}
        activeOpacity={0.85}
      >
        <ActivityIndicator size="small" color="#1976D2" style={{ transform: [{ scale: 0.7 }] }} />
        <Text style={[styles.text, { color: '#1976D2' }]}>
          Syncing {pendingCount} change{pendingCount === 1 ? '' : 's'}...
        </Text>
      </TouchableOpacity>
    );
  }

  // State 4: Just finished syncing successfully
  if (showSyncedSuccess) {
    return (
      <View style={[styles.container, styles.successBg]}>
        <Ionicons name="checkmark-circle" size={14} color="#388E3C" />
        <Text style={[styles.text, { color: '#388E3C' }]}>
          All changes synced
        </Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 16,
    width: '100%',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
  offlineLightBg: {
    backgroundColor: '#FFF3E0',
  },
  offlineDarkBg: {
    backgroundColor: '#3E2723',
  },
  syncingBg: {
    backgroundColor: '#E3F2FD',
  },
  successBg: {
    backgroundColor: '#E8F5E9',
  },
  failedBg: {
    backgroundColor: '#FFEBEE',
  },
});
