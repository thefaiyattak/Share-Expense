import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, LogBox, Animated } from 'react-native';

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

import { authService } from './src/services/authService';
import { expenseService } from './src/services/expenseService';
import { useStore } from './src/store/useStore';
import { getThemeColors } from './src/utils/theme';

// Import Screens
import LoginScreen from './src/screens/auth/LoginScreen';
import DashboardTab from './src/screens/home/DashboardTab';
import ExpensesScreen from './src/screens/expenses/ExpensesScreen';
import StatisticsScreen from './src/screens/statistics/StatisticsScreen';
import SettingsScreen from './src/screens/settings/SettingsScreen';
import AddExpenseScreen from './src/screens/data_entry/AddExpenseScreen';
import UserDetailScreen from './src/screens/expenses/UserDetailScreen';

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
  const [showSplash, setShowSplash] = useState(true);

  const circleScale = React.useRef(new Animated.Value(0.1)).current;
  const walletScale = React.useRef(new Animated.Value(0.3)).current;
  const opacityValue = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(walletScale, {
          toValue: 1,
          tension: 10,
          friction: 4,
          useNativeDriver: true,
        }),
        Animated.timing(opacityValue, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
      Animated.spring(circleScale, {
        toValue: 1,
        tension: 15,
        friction: 3,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.timing(opacityValue, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }).start(() => {
        setShowSplash(false);
      });
    }, 2800);

    return () => clearTimeout(timer);
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
      if (user) {
        try {
          const appUser = await authService.getAppUser(user.uid);
          setCurrentAppUser(appUser);
          if (user.email) {
            const teams = await authService.getUserTeams(user.email);
            setUserTeams(teams);
          }
        } catch (e) {
          setCurrentAppUser(null);
          setUserTeams([]);
        }
      } else {
        setCurrentAppUser(null);
        setUserTeams([]);
      }
      setInitializing(false);
    });
    return unsub;
  }, []);

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

    // 3. Listen for today's Attendance
    let unsubAttendance = () => {};
    if (currentAppUser.teamId) {
      unsubAttendance = expenseService.getTeamAttendance(currentAppUser.teamId, new Date(), (data) => {
        setAttendance(data);
      });
    } else {
      setAttendance([]);
    }

    return () => {
      unsubExpenses();
      unsubMembers();
      unsubAttendance();
    };
  }, [currentAppUser]);

  if (showSplash || initializing) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: darkMode ? '#121212' : '#E6F4FE' }]}>
        <View style={{ width: 160, height: 160, justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
          {/* Sliced Circle Layer (renders behind because it is first in JSX) */}
          <Animated.Image
            source={require('./assets/splash_circle.png')}
            style={{
              position: 'absolute',
              width: 160,
              height: 160,
              opacity: opacityValue,
              transform: [{ scale: circleScale }],
            }}
          />
          {/* Sliced Wallet Layer (renders in front because it is second in JSX) */}
          <Animated.Image
            source={require('./assets/splash_wallet.png')}
            style={{
              position: 'absolute',
              width: 160,
              height: 160,
              opacity: opacityValue,
              transform: [{ scale: walletScale }],
            }}
          />
        </View>
        <Animated.Text style={{
          marginTop: 24,
          fontSize: 22,
          fontWeight: 'bold',
          color: colors.primary,
          opacity: opacityValue
        }}>
          Share Expense
        </Animated.Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={darkMode ? 'light' : 'dark'} />
        <NavigationContainer theme={navigationTheme}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {currentAppUser ? (
              <>
                <Stack.Screen name="MainTabs" component={TabNavigator} />
                <Stack.Screen name="AddExpense" component={AddExpenseScreen} />
                <Stack.Screen name="UserDetail" component={UserDetailScreen} />
              </>
            ) : (
              <Stack.Screen name="Login" component={LoginScreen} />
            )}
          </Stack.Navigator>
        </NavigationContainer>
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
});
