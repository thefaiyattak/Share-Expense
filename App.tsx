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

  const [globalAlertVisible, setGlobalAlertVisible] = useState(false);
  const [globalAlertTitle, setGlobalAlertTitle] = useState('');
  const [globalAlertMessage, setGlobalAlertMessage] = useState('');
  const [globalAlertButtons, setGlobalAlertButtons] = useState<any[]>([]);

  useEffect(() => {
    Alert.alert = (title: string, message?: string, buttons?: any[]) => {
      setGlobalAlertTitle(title || '');
      setGlobalAlertMessage(message || '');
      if (buttons && buttons.length > 0) {
        let sortedButtons = [...buttons];
        const cancelIndex = sortedButtons.findIndex(b => b.style === 'cancel' || (b.text && b.text.toLowerCase() === 'cancel'));
        if (cancelIndex > -1) {
          const [cancelBtn] = sortedButtons.splice(cancelIndex, 1);
          sortedButtons.push(cancelBtn);
        }
        setGlobalAlertButtons(sortedButtons);
      } else {
        setGlobalAlertButtons([{ text: 'OK', onPress: () => {} }]);
      }
      setGlobalAlertVisible(true);
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1500);

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
      <View style={[styles.loadingContainer, { backgroundColor: darkMode ? '#121212' : '#FFFFFF' }]}>
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

        {/* Global Styled Alert Modal (Green background, white text) */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={globalAlertVisible}
          onRequestClose={() => setGlobalAlertVisible(false)}
        >
          <View style={styles.modalOverlayCentered}>
            <View style={{ 
              backgroundColor: '#2E7D32', 
              borderRadius: 16, 
              padding: 24, 
              width: '85%', 
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 10,
              elevation: 5
            }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 12, textAlign: 'center' }}>
                {globalAlertTitle}
              </Text>
              {!!globalAlertMessage && (
                <Text style={{ fontSize: 14, color: '#E8F5E9', textAlign: 'center', lineHeight: 20, marginBottom: 20 }}>
                  {globalAlertMessage}
                </Text>
              )}
              <View style={{ width: '100%', gap: 10 }}>
                {globalAlertButtons.map((btn, index) => (
                  <TouchableOpacity 
                    key={index}
                    style={{ 
                      backgroundColor: '#FFFFFF', 
                      paddingHorizontal: 20, 
                      paddingVertical: 12, 
                      borderRadius: 10, 
                      width: '100%', 
                      alignItems: 'center'
                    }}
                    onPress={() => {
                      setGlobalAlertVisible(false);
                      if (btn.onPress) {
                        setTimeout(() => btn.onPress(), 100);
                      }
                    }}
                  >
                    <Text style={{ 
                      color: btn.style === 'destructive' ? '#D32F2F' : '#2E7D32', 
                      fontWeight: 'bold', 
                      fontSize: 14 
                    }}>
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                ))}
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
