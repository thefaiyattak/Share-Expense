import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, LogBox, Animated, Image, Text, Alert, Modal, TouchableOpacity } from 'react-native';

LogBox.ignoreLogs([
  'InteractionManager has been deprecated',
]);
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';

let SplashScreen: any = null;
try {
  SplashScreen = require('expo-splash-screen');
  SplashScreen.preventAutoHideAsync().catch(() => {});
} catch (e) {}

import { authService } from './src/services/authService';
import { expenseService } from './src/services/expenseService';
import { notificationService } from './src/services/notificationService';
import { useStore } from './src/store/useStore';
import { getThemeColors } from './src/utils/theme';

import CustomToast from './src/components/CustomToast';

// Import Screens
import LoginScreen from './src/screens/auth/LoginScreen';
import DashboardTab from './src/screens/home/DashboardTab';
import ExpensesScreen from './src/screens/expenses/ExpensesScreen';
import StatisticsScreen from './src/screens/statistics/StatisticsScreen';
import SettingsScreen from './src/screens/settings/SettingsScreen';
import AddExpenseScreen from './src/screens/data_entry/AddExpenseScreen';
import UserDetailScreen from './src/screens/expenses/UserDetailScreen';
import MoneyCircleScreen from './src/screens/home/MoneyCircleScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function TabNavigator() {
  const { darkMode } = useStore();
  const colors = getThemeColors(darkMode);
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          let iconName: any = 'home';
          if (route.name === 'Dashboard') {
            iconName = 'home-outline';
          } else if (route.name === 'Expenses') {
            iconName = 'card-outline';
          } else if (route.name === 'Stats') {
            iconName = 'stats-chart-outline';
          } else if (route.name === 'Settings') {
            iconName = 'settings-outline';
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.divider,
          height: 58 + (insets.bottom > 0 ? insets.bottom : 8),
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          paddingTop: 8,
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardTab} />
      <Tab.Screen name="Expenses" component={ExpensesScreen} />
      <Tab.Screen name="Stats" component={StatisticsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const { currentAppUser, setCurrentAppUser, setExpenses, setMembers, setAttendance, setUserTeams, darkMode } = useStore();
  const [initializing, setInitializing] = useState(true);
  const [minSplashDone, setMinSplashDone] = useState(false);
  const [splashMounted, setSplashMounted] = useState(true);
  const splashOpacity = React.useRef(new Animated.Value(1)).current;

  const [globalAlertVisible, setGlobalAlertVisible] = useState(false);
  const [globalAlertTitle, setGlobalAlertTitle] = useState('');
  const [globalAlertMessage, setGlobalAlertMessage] = useState('');
  const [globalAlertButtons, setGlobalAlertButtons] = useState<any[]>([]);

  useEffect(() => {
    Alert.alert = (title: string, message?: string, buttons?: any[]) => {
      // If it's a simple notification message with 0 or 1 'OK' button, show custom 3s toast!
      if (!buttons || buttons.length <= 1) {
        const typeStr = (title || '').toLowerCase();
        let type: 'success' | 'error' | 'warning' | 'info' = 'info';
        if (typeStr.includes('success')) type = 'success';
        else if (typeStr.includes('error') || typeStr.includes('failed') || typeStr.includes('validation')) type = 'error';
        else if (typeStr.includes('warning')) type = 'warning';

        const toastMsg = message || title;
        useStore.getState().showToast(toastMsg, type, title);
        if (buttons && buttons[0]?.onPress) {
          buttons[0].onPress();
        }
        return;
      }

      setGlobalAlertTitle(title || '');
      setGlobalAlertMessage(message || '');
      let sortedButtons = [...buttons];
      const cancelIndex = sortedButtons.findIndex(b => b.style === 'cancel' || (b.text && b.text.toLowerCase() === 'cancel'));
      if (cancelIndex > -1) {
        const [cancelBtn] = sortedButtons.splice(cancelIndex, 1);
        sortedButtons.push(cancelBtn);
      }
      setGlobalAlertButtons(sortedButtons);
      setGlobalAlertVisible(true);
    };
  }, []);

  useEffect(() => {
    // Hide native OS splash screen seamlessly once React JS splash view is mounted
    if (SplashScreen?.hideAsync) {
      SplashScreen.hideAsync().catch(() => {});
    }

    // Minimum splash display duration for smooth transition without flicker
    const minTimer = setTimeout(() => {
      setMinSplashDone(true);
    }, 1500);

    // Hard maximum limit: Splash screen MUST finish within 5 seconds under any condition
    const maxTimer = setTimeout(() => {
      setInitializing(false);
      setMinSplashDone(true);
    }, 5000);

    return () => {
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
    };
  }, []);

  const colors = getThemeColors(darkMode);
  const styles = getStyles(colors);

  const navigationTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: colors.background,
      card: colors.surface,
      text: colors.textPrimary,
      border: colors.divider,
    },
  };

  // Auth State Listener
  useEffect(() => {
    const unsub = authService.onAuthStateChanged(async (user) => {
      try {
        if (user) {
          const appUser = await authService.getAppUser(user.uid);
          setCurrentAppUser(appUser);
          if (appUser?.id) {
            notificationService.registerForPushNotificationsAsync(appUser.id).catch(() => {});
          }
          if (user.email) {
            const teams = await authService.getUserTeams(user.email);
            setUserTeams(teams);
          }
        } else {
          setCurrentAppUser(null);
          setUserTeams([]);
        }
      } catch (e) {
        setCurrentAppUser(null);
        setUserTeams([]);
      } finally {
        setInitializing(false);
      }
    });
    return unsub;
  }, []);

  // Smoothly fade out splash screen when auth initialization and min duration finish
  useEffect(() => {
    if ((!initializing && minSplashDone) || (!splashMounted && minSplashDone)) {
      Animated.timing(splashOpacity, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }).start(() => {
        setSplashMounted(false);
      });
    }
  }, [initializing, minSplashDone]);

  // Real-time Database Listeners when logged in
  useEffect(() => {
    if (!currentAppUser) return;

    const teamIdToListen = currentAppUser.teamId || `personal_${currentAppUser.id.split('_')[0]}`;

    // 1. Listen for Team Expenses
    const unsubExpenses = expenseService.getTeamExpenses(teamIdToListen, (data) => {
      setExpenses(data);
    });

    // 2. Listen for Team Members
    let unsubMembers = () => {};
    if (currentAppUser.teamId) {
      unsubMembers = authService.getTeamMembers(currentAppUser.teamId, (data) => {
        setMembers(data);
      });
    } else {
      setMembers([currentAppUser]);
    }

    return () => {
      unsubExpenses();
      unsubMembers();
    };
  }, [currentAppUser]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: darkMode ? '#121212' : '#FFFFFF' }}>
      <SafeAreaProvider>
        <StatusBar style={darkMode ? 'light' : 'dark'} />
        <CustomToast />
        <NavigationContainer theme={navigationTheme}>
          <Stack.Navigator 
            screenOptions={{ 
              headerShown: false,
              cardStyleInterpolator: ({ current, layouts }) => ({
                cardStyle: {
                  transform: [
                    {
                      translateX: current.progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [layouts.screen.width, 0],
                      }),
                    },
                  ],
                  opacity: current.progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.5, 1],
                  }),
                },
              }),
            }}
          >
            {currentAppUser ? (
              <>
                <Stack.Screen name="MainTabs" component={TabNavigator} />
                <Stack.Screen name="AddExpense" component={AddExpenseScreen} />
                <Stack.Screen name="UserDetail" component={UserDetailScreen} />
                <Stack.Screen name="MoneyCircle" component={MoneyCircleScreen} />
              </>
            ) : (
              <Stack.Screen name="Login" component={LoginScreen} />
            )}
          </Stack.Navigator>
        </NavigationContainer>

        {/* Animated Splash Screen Overlay (prevents root component unmount flicker) */}
        {(initializing || splashMounted) && (
          <Animated.View 
            style={[
              styles.loadingContainer, 
              StyleSheet.absoluteFill,
              { 
                zIndex: 99999,
                opacity: splashOpacity,
                backgroundColor: darkMode ? '#121212' : '#FFFFFF' 
              }
            ]}
            pointerEvents={!initializing && minSplashDone ? 'none' : 'auto'}
          >
            <View style={{ width: 140, height: 140, backgroundColor: '#FFFFFF', borderRadius: 28, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 }}>
              <Image
                source={require('./assets/icon.png')}
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 24,
                  backgroundColor: '#FFFFFF',
                }}
              />
            </View>
            <Text style={{
              marginTop: 24,
              fontSize: 22,
              fontWeight: 'bold',
              color: colors.primary,
            }}>
              Share Expense
            </Text>
            <Text style={{
              marginTop: 6,
              fontSize: 12,
              fontWeight: '500',
              color: colors.textSecondary,
              textAlign: 'center',
            }}>
              Developed by DigitalAppsStudio in collaboration with fyntech
            </Text>
          </Animated.View>
        )}

        {/* Global Modern Alert Modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={globalAlertVisible}
          onRequestClose={() => setGlobalAlertVisible(false)}
        >
          <View style={styles.modalOverlayCentered}>
            <View style={{ 
              backgroundColor: colors.surface, 
              borderRadius: 24, 
              padding: 22, 
              width: '82%', 
              maxWidth: 330,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: colors.divider,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.18,
              shadowRadius: 16,
              elevation: 8
            }}>
              <View style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                backgroundColor: colors.primary + '15',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
                borderWidth: 1,
                borderColor: colors.primary + '30'
              }}>
                <Ionicons name="information-circle" size={28} color={colors.primary} />
              </View>

              <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: !!globalAlertMessage ? 6 : 18, textAlign: 'center' }}>
                {globalAlertTitle}
              </Text>

              {!!globalAlertMessage && (
                <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18, marginBottom: 20 }}>
                  {globalAlertMessage}
                </Text>
              )}

              <View style={{ width: '100%', gap: 8 }}>
                {globalAlertButtons.map((btn, index) => {
                  const isDestructive = btn.style === 'destructive';
                  const isCancel = btn.style === 'cancel' || (btn.text && btn.text.toLowerCase() === 'cancel');

                  let btnBg = colors.primary;
                  let textColor = '#FFFFFF';

                  if (isDestructive) {
                    btnBg = '#D32F2F';
                  } else if (isCancel) {
                    btnBg = colors.background;
                    textColor = colors.textSecondary;
                  }

                  return (
                    <TouchableOpacity 
                      key={index}
                      style={{ 
                        backgroundColor: btnBg, 
                        paddingVertical: 12, 
                        borderRadius: 12, 
                        width: '100%', 
                        alignItems: 'center',
                        borderWidth: isCancel ? 1 : 0,
                        borderColor: colors.divider
                      }}
                      onPress={() => {
                        setGlobalAlertVisible(false);
                        if (btn.onPress) {
                          setTimeout(() => btn.onPress(), 100);
                        }
                      }}
                    >
                      <Text style={{ 
                        color: textColor, 
                        fontWeight: '700', 
                        fontSize: 14 
                      }}>
                        {btn.text}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  modalOverlayCentered: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
