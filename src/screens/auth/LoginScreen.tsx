import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator, 
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal
} from 'react-native';
import { authService } from '../../services/authService';
import { useStore } from '../../store/useStore';
import { getThemeColors } from '../../utils/theme';
import { Ionicons } from '@expo/vector-icons';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

export default function LoginScreen() {
  const { setCurrentAppUser, setUserTeams, darkMode } = useStore();
  const [loading, setLoading] = useState(false);
  const [googleModalVisible, setGoogleModalVisible] = useState(false);
  const [isNativeAvailable, setIsNativeAvailable] = useState(true);
  
  // Custom email option
  const [customEmail, setCustomEmail] = useState('');
  const [customName, setCustomName] = useState('');

  const colors = getThemeColors(darkMode);
  const styles = getStyles(colors);

  useEffect(() => {
    try {
      GoogleSignin.configure({
        // Web Client ID from Google Cloud / Firebase console
        webClientId: '20947220033-fvnaobstfc3aktvur0kf6e1cquioq6qb.apps.googleusercontent.com',
        offlineAccess: true,
      });
      setIsNativeAvailable(true);
    } catch (e) {
      console.log('GoogleSignin config bypassed (Expo Go):', e);
      setIsNativeAvailable(false);
    }
  }, []);

  const showMsg = (msg: string, isError = false) => {
    Alert.alert(isError ? 'Error' : 'Success', msg);
  };

  const handleGoogleSignIn = async (email: string, name: string) => {
    setGoogleModalVisible(false);
    setLoading(true);
    try {
      const result = await authService.signInWithGoogle(email, name);
      const userToSet = result.user;
      if (userToSet) {
        const teams = await authService.getUserTeams(email);
        setUserTeams(teams);
        setCurrentAppUser(userToSet);
        showMsg(result.isNew ? 'Signed up successfully with Google!' : 'Signed in successfully!');
      } else {
        showMsg('Unable to retrieve user profile.', true);
      }
    } catch (e: any) {
      showMsg(e.message || 'Google sign in failed', true);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignInNative = async () => {
    if (!isNativeAvailable) {
      // In development / Expo Go, open manual input modal directly
      setGoogleModalVisible(true);
      return;
    }

    try {
      setLoading(true);
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const email = userInfo.data?.user.email;
      const name = userInfo.data?.user.name || email?.split('@')[0] || 'User';

      if (email) {
        const result = await authService.signInWithGoogle(email, name);
        const userToSet = result.user;
        if (userToSet) {
          const teams = await authService.getUserTeams(email);
          setUserTeams(teams);
          setCurrentAppUser(userToSet);
          showMsg('Signed in successfully with Google!');
        } else {
          showMsg('Unable to login with Google.', true);
        }
      }
    } catch (error: any) {
      console.log('Native Google Sign-In Error:', error);
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        // User cancelled, do nothing
      } else if (error.code === statusCodes.IN_PROGRESS) {
        // Operation in progress
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert('Error', 'Google Play Services are not available or outdated.');
      } else {
        // Display the actual Google API error so we know if client credentials are not configured properly
        Alert.alert('Google Sign-In Failed', error.message || 'Failed to authenticate with Google. Make sure SHA-1 is configured in Firebase.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        {/* Header Logo */}
        <View style={styles.header}>
          <View style={styles.logoPlaceholder}>
            <Text style={styles.logoText}>$</Text>
          </View>
          <Text style={styles.title}>Share Expense</Text>
          <Text style={styles.subtitle}>by fyntech</Text>
        </View>

        {/* GOOGLE SIGN IN SCREEN */}
        <View style={styles.contentContainer}>
          <Text style={styles.welcomeText}>Welcome to Share Expense</Text>
          <Text style={styles.descText}>
            Keep track of shared household bills, utilities, and daily meals with your group members.
          </Text>

          {loading ? (
            <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 40 }} />
          ) : (
            <TouchableOpacity 
              style={styles.googleBtn} 
              onPress={handleGoogleSignInNative}
            >
              <Ionicons name="logo-google" size={20} color="#FFFFFF" style={{ marginRight: 10 }} />
              <Text style={styles.googleBtnText}>Sign in with Google</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Google Sign In Modal (Fallback Input) */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={googleModalVisible}
          onRequestClose={() => setGoogleModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Sign in with Google</Text>
                <Text style={styles.modalSubtitle}>to continue to Share Expense</Text>
              </View>

              <View style={{ paddingVertical: 10, width: '100%' }}>
                <TextInput 
                  style={styles.input}
                  placeholder="Google/Gmail Email Address"
                  placeholderTextColor={colors.textSecondary}
                  value={customEmail}
                  onChangeText={setCustomEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <TextInput 
                  style={styles.input}
                  placeholder="Your Full Name"
                  placeholderTextColor={colors.textSecondary}
                  value={customName}
                  onChangeText={setCustomName}
                />
                <TouchableOpacity 
                  style={styles.submitBtn}
                  onPress={() => {
                    const trimmedEmail = customEmail.trim();
                    const trimmedName = customName.trim();
                    if (!trimmedEmail) {
                      showMsg('Please provide a Google/Gmail email address.', true);
                      return;
                    }
                    if (!trimmedEmail.toLowerCase().endsWith('@gmail.com')) {
                      showMsg('Please provide a valid @gmail.com address.', true);
                      return;
                    }
                    if (!trimmedName) {
                      showMsg('Please enter your full name.', true);
                      return;
                    }
                    handleGoogleSignIn(trimmedEmail, trimmedName);
                  }}
                >
                  <Text style={styles.submitBtnText}>Sign In</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity 
                style={styles.closeModalBtn}
                onPress={() => setGoogleModalVisible(false)}
              >
                <Text style={styles.closeModalText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContainer: {
    paddingBottom: 40,
  },
  header: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    paddingVertical: 50,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  logoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  logoText: {
    fontSize: 44,
    fontWeight: '900',
    color: colors.primary,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: 'bold',
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  contentContainer: {
    alignItems: 'center',
    marginHorizontal: 30,
    marginTop: 60,
  },
  welcomeText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  descText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 40,
  },
  googleBtn: {
    flexDirection: 'row',
    backgroundColor: '#4285F4',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    width: '100%',
  },
  googleBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  input: {
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 12,
    width: '100%',
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    elevation: 2,
    width: '100%',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 10,
    width: '100%',
  },
  backBtnText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
    alignItems: 'center',
    width: '100%',
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeModalBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 10,
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    width: '100%',
  },
  closeModalText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 14,
  },
});
