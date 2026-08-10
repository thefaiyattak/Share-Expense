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
  Modal,
  Image
} from 'react-native';
import { authService } from '../../services/authService';
import { useStore } from '../../store/useStore';
import { getThemeColors } from '../../utils/theme';
import { Ionicons } from '@expo/vector-icons';
let GoogleSignin: any = null;
let statusCodes: any = { SIGN_IN_CANCELLED: '12501', IN_PROGRESS: '12502', PLAY_SERVICES_NOT_AVAILABLE: '12500' };
try {
  const gsignin = require('@react-native-google-signin/google-signin');
  GoogleSignin = gsignin.GoogleSignin;
  statusCodes = gsignin.statusCodes || statusCodes;
} catch (e) {
  console.log('GoogleSignin is not natively available in this build (e.g. Expo Go)');
}

export default function LoginScreen() {
  const { setCurrentAppUser, setUserTeams, darkMode } = useStore();
  const [loading, setLoading] = useState(false);
  const [googleModalVisible, setGoogleModalVisible] = useState(false);
  const [isNativeAvailable, setIsNativeAvailable] = useState(true);
  const [loginTab, setLoginTab] = useState<'google' | 'email'>('google');

  // Custom email/google input
  const [customEmail, setCustomEmail] = useState('');
  const [customName, setCustomName] = useState('');

  // Email+password login
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const colors = getThemeColors(darkMode);
  const styles = getStyles(colors);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertIsError, setAlertIsError] = useState(false);

  useEffect(() => {
    try {
      if (GoogleSignin) {
        GoogleSignin.configure({
          webClientId: '20947220033-fvnaobstfc3aktvur0kf6e1cquioq6qb.apps.googleusercontent.com',
          offlineAccess: true,
        });
        setIsNativeAvailable(true);
      } else {
        setIsNativeAvailable(false);
      }
    } catch (e) {
      console.log('GoogleSignin config bypassed (Expo Go):', e);
      setIsNativeAvailable(false);
    }
  }, []);

  const showMsg = (msg: string, isError = false, title?: string) => {
    setAlertTitle(isError ? (title || 'Error') : (title || 'Success'));
    setAlertMessage(msg);
    setAlertIsError(isError);
    setAlertVisible(true);
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

  const handleEmailPasswordSignIn = async () => {
    const email = emailInput.trim();
    const password = passwordInput;
    if (!email) {
      showMsg('Please enter your email address.', true);
      return;
    }
    if (!password) {
      showMsg('Please enter your password.', true);
      return;
    }
    setLoading(true);
    try {
      const user = await authService.signInWithEmail(email, password);
      if (user) {
        const teams = await authService.getUserTeams(email);
        setUserTeams(teams);
        setCurrentAppUser(user);
      } else {
        showMsg('Account found but no profile exists. Please sign in with Google first.', true);
      }
    } catch (e: any) {
      showMsg(e.message || 'Sign in failed', true);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    let email = emailInput.trim();
    if (!email) {
      if (Platform.OS === 'ios') {
        Alert.prompt(
          'Reset Password',
          'Enter your email address to receive a password reset link:',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Send Link',
              onPress: async (enteredEmail?: string) => {
                if (!enteredEmail || !enteredEmail.trim()) {
                  showMsg('Please enter a valid email address.', true);
                  return;
                }
                setLoading(true);
                try {
                  await authService.sendPasswordReset(enteredEmail.trim());
                  showMsg(`A password reset link has been sent to ${enteredEmail.trim()}. Please check your inbox.`, false, 'Reset Email Sent');
                } catch (e: any) {
                  showMsg(e.message || 'Failed to send reset email.', true);
                } finally {
                  setLoading(false);
                }
              }
            }
          ],
          'plain-text',
          '',
          'email-address'
        );
        return;
      } else {
        showMsg('Please enter your email address in the Email field, then tap Forgot Password.', true, 'Email Required');
        return;
      }
    }

    setLoading(true);
    try {
      await authService.sendPasswordReset(email);
      showMsg(`A password reset link has been sent to ${email}. Please check your inbox.`, false, 'Reset Email Sent');
    } catch (e: any) {
      showMsg(e.message || 'Failed to send reset email.', true);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignInNative = async () => {
    try {
      setLoading(true);
      if (GoogleSignin) {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        try {
          await GoogleSignin.signOut();
        } catch (_) { }
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
      } else {
        Alert.alert('Google Sign-In', 'Google Sign-In native module is not available in Expo Go. Please build a native APK/AAB or use Email & Password sign-in.');
      }
    } catch (error: any) {
      console.log('Native Google Sign-In Error:', error);
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        // User cancelled account picker dialog, do nothing
      } else if (error.code === statusCodes.IN_PROGRESS) {
        // Operation in progress
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert('Error', 'Google Play Services are not available or outdated on this device.');
      } else {
        Alert.alert('Google Sign-In Error', error.message || 'Unable to connect to Google account picker.');
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
          <Image
            source={require('../../../assets/icon.png')}
            style={{ width: 100, height: 100, marginBottom: 12, borderRadius: 20, backgroundColor: '#FFFFFF' }}
          />
          <Text style={styles.title}>Share Expense</Text>
          <Text style={styles.subtitle}>Developed by DigitalAppsStudio in collaboration with fyntech</Text>
        </View>

        <View style={styles.contentContainer}>
          <Text style={styles.welcomeText}>Welcome to Share Expense</Text>
          <Text style={styles.descText}>
            Keep track of shared household bills, utilities, and daily meals with your group members.
          </Text>

          {loading ? (
            <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 32 }} />
          ) : (
            <>
              {/* Primary: Google Sign In */}
              <TouchableOpacity
                style={styles.googleBtn}
                onPress={handleGoogleSignInNative}
              >
                <Ionicons name="logo-google" size={20} color="#FFFFFF" style={{ marginRight: 10 }} />
                <Text style={styles.googleBtnText}>Sign in with Google</Text>
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Secondary: Email + Password (collapsed by default) */}
              {loginTab !== 'email' ? (
                <TouchableOpacity
                  style={styles.emailSignInLink}
                  onPress={() => setLoginTab('email')}
                >
                  <Ionicons name="mail-outline" size={15} color={colors.textSecondary} style={{ marginRight: 6 }} />
                  <Text style={styles.emailSignInLinkText}>Sign in with Email & Password</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ width: '100%' }}>
                  <View style={styles.emailPanelHeader}>
                    <Text style={styles.emailPanelTitle}>Email & Password</Text>
                    <TouchableOpacity onPress={() => setLoginTab('google')}>
                      <Ionicons name="close-circle-outline" size={20} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </View>

                  <TextInput
                    style={styles.input}
                    placeholder="Email Address"
                    placeholderTextColor={colors.textSecondary}
                    value={emailInput}
                    onChangeText={setEmailInput}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                  />
                  <View style={{ position: 'relative' }}>
                    <TextInput
                      style={[styles.input, { paddingRight: 48 }]}
                      placeholder="Password"
                      placeholderTextColor={colors.textSecondary}
                      value={passwordInput}
                      onChangeText={setPasswordInput}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(v => !v)}
                      style={{ position: 'absolute', right: 14, top: 14 }}
                    >
                      <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={styles.submitBtn}
                    onPress={handleEmailPasswordSignIn}
                  >
                    <Text style={styles.submitBtnText}>Sign In</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.forgotPasswordBtn}
                    onPress={handleForgotPassword}
                  >
                    <Ionicons name="key-outline" size={14} color={colors.primary} style={{ marginRight: 4 }} />
                    <Text style={styles.forgotPasswordText}>Forgot Password? Send Reset Link</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>



        {/* Custom Alert Modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={alertVisible}
          onRequestClose={() => setAlertVisible(false)}
        >
          <View style={styles.modalOverlayCentered}>
            <View style={{
              backgroundColor: alertIsError ? colors.error : colors.primary,
              borderRadius: 16,
              padding: 24,
              width: '80%',
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 10,
              elevation: 5
            }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 12 }}>{alertTitle}</Text>
              <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', textAlign: 'center', lineHeight: 20, marginBottom: 20 }}>
                {alertMessage}
              </Text>
              <TouchableOpacity
                style={{ backgroundColor: '#FFFFFF', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, width: '100%', alignItems: 'center' }}
                onPress={() => setAlertVisible(false)}
              >
                <Text style={{ color: alertIsError ? colors.error : colors.primary, fontWeight: 'bold', fontSize: 14 }}>OK</Text>
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
    marginBottom: 28,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    width: '100%',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: 12,
    color: colors.textTertiary,
    marginHorizontal: 12,
    fontWeight: '500',
  },
  emailSignInLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    width: '100%',
  },
  emailSignInLinkText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  emailPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    width: '100%',
  },
  emailPanelTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.3,
  },
  forgotPasswordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  forgotPasswordText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
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
  modalOverlayCentered: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
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
