import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Animated, Easing, Modal } from 'react-native';
import { useStore } from '../store/useStore';
import { getThemeColors } from '../utils/theme';

let BlurView: any = null;
try {
  BlurView = require('expo-blur').BlurView;
} catch (e) {}

interface GlobalLoaderProps {
  message?: string;
  visible?: boolean;
}

const BAR_COUNT = 5;

export const GlobalLoader: React.FC<GlobalLoaderProps> = ({ visible = true }) => {
  const { darkMode } = useStore();
  const colors = getThemeColors(darkMode);
  const animValues = useRef(Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.3))).current;

  useEffect(() => {
    const animations = animValues.map((anim, index) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(index * 120),
          Animated.timing(anim, {
            toValue: 1,
            duration: 400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.3,
            duration: 400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
    });

    animations.forEach(a => a.start());

    return () => {
      animations.forEach(a => a.stop());
    };
  }, []);

  if (!visible) return null;

  // Theme-aware spectrum bar palette
  const barColors = darkMode
    ? ['#81C784', '#4CAF50', '#66BB6A', '#4CAF50', '#81C784']
    : ['#4CAF50', '#2E7D32', '#1B5E20', '#2E7D32', '#4CAF50'];

  const overlayBg = darkMode ? 'rgba(18, 18, 18, 0.75)' : 'rgba(255, 255, 255, 0.75)';

  return (
    <Modal
      transparent={true}
      visible={visible}
      animationType="fade"
      statusBarTranslucent={true}
      hardwareAccelerated={true}
    >
      <View style={styles.overlay}>
        {BlurView ? (
          <BlurView
            intensity={80}
            tint={darkMode ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        
        {/* Semi-transparent tint layer */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: overlayBg }]} />

        {/* Center Wave Spectrum */}
        <View style={styles.waveContainer}>
          {animValues.map((anim, i) => (
            <Animated.View
              key={i}
              style={[
                styles.bar,
                {
                  backgroundColor: barColors[i],
                  transform: [
                    {
                      scaleY: anim,
                    },
                  ],
                  opacity: anim.interpolate({
                    inputRange: [0.3, 1],
                    outputRange: [0.55, 1],
                  }),
                },
              ]}
            />
          ))}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    gap: 8,
  },
  bar: {
    width: 6,
    height: 42,
    borderRadius: 3,
  },
});
