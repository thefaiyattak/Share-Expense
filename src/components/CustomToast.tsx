import React, { useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  Animated, 
  TouchableOpacity, 
  Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore, ToastType } from '../store/useStore';
import { getThemeColors } from '../utils/theme';

export default function CustomToast() {
  const { toast, hideToast, darkMode } = useStore();
  const colors = getThemeColors(darkMode);

  const translateY = useRef(new Animated.Value(-120)).current;
  const progressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (toast) {
      // Reset animation states
      translateY.setValue(-120);
      progressAnim.setValue(1);

      // Slide down in 300ms
      Animated.spring(translateY, {
        toValue: 0,
        tension: 80,
        friction: 10,
        useNativeDriver: true,
      }).start();

      // Progress bar shrinks from 1 to 0 over 3000ms (3 seconds)
      Animated.timing(progressAnim, {
        toValue: 0,
        duration: 3000,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) {
          dismissToast();
        }
      });
    }
  }, [toast]);

  const dismissToast = () => {
    Animated.timing(translateY, {
      toValue: -120,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      hideToast();
    });
  };

  if (!toast) return null;

  const getToastConfig = (type: ToastType) => {
    switch (type) {
      case 'success':
        return {
          bg: colors.primaryLight,
          border: colors.primary,
          iconColor: colors.primary,
          icon: 'checkmark-circle' as const,
          defaultTitle: 'Success',
        };
      case 'error':
        return {
          bg: darkMode ? '#3E1F1F' : '#FFEBEE',
          border: '#D32F2F',
          iconColor: '#D32F2F',
          icon: 'alert-circle' as const,
          defaultTitle: 'Error',
        };
      case 'warning':
        return {
          bg: darkMode ? '#3E2E1F' : '#FFF3E0',
          border: '#ED6C02',
          iconColor: '#ED6C02',
          icon: 'warning' as const,
          defaultTitle: 'Warning',
        };
      case 'info':
      default:
        return {
          bg: darkMode ? '#1F2E3E' : '#E3F2FD',
          border: '#0288D1',
          iconColor: '#0288D1',
          icon: 'information-circle' as const,
          defaultTitle: 'Notice',
        };
    }
  };

  const config = getToastConfig(toast.type);
  const titleText = toast.title || config.defaultTitle;

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        {
          transform: [{ translateY }],
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={[styles.toastCard, { backgroundColor: config.bg, borderColor: config.border }]}>
        <View style={styles.contentRow}>
          <Ionicons name={config.icon} size={24} color={config.iconColor} style={styles.icon} />
          <View style={styles.textContainer}>
            <Text style={[styles.title, { color: config.border }]}>{titleText}</Text>
            <Text style={[styles.message, { color: colors.textPrimary }]}>{toast.message}</Text>
          </View>
          <TouchableOpacity onPress={dismissToast} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* 3 Seconds Progress Bar */}
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressBar,
              {
                width: progressWidth,
                backgroundColor: config.border,
              },
            ]}
          />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 35,
    left: 16,
    right: 16,
    zIndex: 99999,
    elevation: 99999,
    alignItems: 'center',
  },
  toastCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 14,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  icon: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    paddingRight: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  message: {
    fontSize: 12,
    fontWeight: '500',
  },
  closeBtn: {
    padding: 4,
  },
  progressTrack: {
    height: 3.5,
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  progressBar: {
    height: '100%',
  },
});
