import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  Share,
  Modal,
  Platform,
  TextInput,
  ActivityIndicator,
  Image,
  RefreshControl,
  KeyboardAvoidingView,
  Keyboard
} from 'react-native';
import { GlobalLoader } from '../../components/GlobalLoader';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useStore } from '../../store/useStore';
import { authService } from '../../services/authService';
import { notificationService } from '../../services/notificationService';
import { getThemeColors } from '../../utils/theme';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useKeyboardVisible } from '../../utils/useKeyboardVisible';

const appStorage = (AsyncStorage as any)?.default || AsyncStorage;

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardVisible();
  const modalBottomPadding = isKeyboardVisible ? 14 : Math.max(insets.bottom + 6, 18);
  const {
    currentAppUser,
    currency,
    darkMode,
    activeTeamId,
    userTeams,
    setCurrency,
    setDarkMode,
    setCurrentAppUser,
    setUserTeams
  } = useStore();

  const colors = getThemeColors(darkMode);
  const styles = getStyles(colors);

  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);
  const [joinModalVisible, setJoinModalVisible] = useState(false);

  // Unified Groups modal state
  const [groupsModalVisible, setGroupsModalVisible] = useState(false);

  const [newGroupName, setNewGroupName] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [loading, setLoading] = useState(false);

  // Profile editing
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [editName, setEditName] = useState(currentAppUser?.name || '');
  const [editPhone, setEditPhone] = useState((currentAppUser as any)?.phone || '');
  const [editBio, setEditBio] = useState((currentAppUser as any)?.bio || '');
  const [editAvatarColor, setEditAvatarColor] = useState((currentAppUser as any)?.avatarColor || colors.primary);
  const [profileImageUri, setProfileImageUri] = useState(currentAppUser?.profileImageUrl || '');
  const [aboutModalVisible, setAboutModalVisible] = useState(false);

  // Account Security state
  const [securityModalVisible, setSecurityModalVisible] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');

  const hasPasswordSet = React.useMemo(() => {
    return Boolean(currentAppUser?.hasPasswordSet);
  }, [currentAppUser?.hasPasswordSet]);

  // Tutorial State
  const [tutorialModalVisible, setTutorialModalVisible] = useState(false);
  const [activeTutorialIndex, setActiveTutorialIndex] = useState(0);
  const [customTutorials, setCustomTutorials] = useState<any[]>([]);
  const [addTutorialModalVisible, setAddTutorialModalVisible] = useState(false);
  const [newTutorialTitle, setNewTutorialTitle] = useState('');
  const [newTutorialDesc, setNewTutorialDesc] = useState('');
  const [newTutorialImageUri, setNewTutorialImageUri] = useState('');
  const [fullScreenImageSource, setFullScreenImageSource] = useState<any>(null);

  useEffect(() => {
    appStorage.getItem('custom_tutorial_slides').then((val: any) => {
      if (val) {
        try {
          setCustomTutorials(JSON.parse(val));
        } catch (e) {}
      }
    });
  }, []);

  const defaultTutorials = React.useMemo(() => [
    {
      id: 'def_1',
      title: '01. Dashboard Screen',
      description: 'Your Home for Smart Expense Tracking — Workspace/Group selector, Role badge, Notification bell, My Wallet & Collective Wallet cards, Date selector calendar, and Daily category quick-add buttons (+).',
      imageSource: require('../../../assets/tutorials/01_dashboard_screen.png'),
      isDefault: true,
    },
    {
      id: 'def_2',
      title: '02. Switch Group Modal',
      description: 'Switch Anytime, Track Everything — Switch easily between Personal Workspace and group workspaces, view group invite codes, or create and join groups.',
      imageSource: require('../../../assets/tutorials/02_switch_group_modal.png'),
      isDefault: true,
    },
    {
      id: 'def_3',
      title: '03. Add Expense Screen',
      description: 'Add Every Detail, Split with Ease — Select target date, enter item name, quantity & unit price, attach receipts, add multiple items, and split cost equally among selected members.',
      imageSource: require('../../../assets/tutorials/03_add_expense_screen.png'),
      isDefault: true,
    },
    {
      id: 'def_4',
      title: '04. Expenses Screen',
      description: 'See Everything, Stay in Control — View collective wallet deposit summary, group invite code & share, add member, color-coded spending distribution chart, members list & generate PDF/CSV reports.',
      imageSource: require('../../../assets/tutorials/04_expenses_screen.png'),
      isDefault: true,
    },
    {
      id: 'def_5',
      title: '05. Member Profile Screen',
      description: 'Your Finances, All in One Place — Track wallet deposit card, spent (paid out) card, calculated share card, net balance/deficit card, admin pending adjustments (+/-), carry to next month, wallet usage gauge, and expense history.',
      imageSource: require('../../../assets/tutorials/05_member_profile_screen.png'),
      isDefault: true,
    },
    {
      id: 'def_6',
      title: '06. Statistics Screen',
      description: 'Understand Your Spending at a Glance — Time range selector (Daily, Weekly, Monthly, Custom), range total banner, category summary cards, donut chart breakdown, and spending trend line graph over time.',
      imageSource: require('../../../assets/tutorials/06_statistics_screen.png'),
      isDefault: true,
    },
    {
      id: 'def_7',
      title: '07. Settings Screen',
      description: 'Personalize Your App Your Way — Manage profile & account, groups settings, currency selection, dark mode toggle, push notifications settings, forget/change password, sign out, deactivate & delete account.',
      imageSource: require('../../../assets/tutorials/07_settings_screen.png'),
      isDefault: true,
    },
  ], []);

  const combinedTutorials = React.useMemo(() => {
    return [...defaultTutorials, ...customTutorials];
  }, [defaultTutorials, customTutorials]);

  const handlePickTutorialImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Media library access is required to pick a tutorial image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setNewTutorialImageUri(result.assets[0].uri);
    }
  };

  const handleAddCustomTutorial = async () => {
    if (!newTutorialImageUri) {
      Alert.alert('Image Required', 'Please select a tutorial image from your gallery.');
      return;
    }
    const newSlide = {
      id: `custom_${Date.now()}`,
      title: newTutorialTitle.trim() || 'Tutorial Guide',
      description: newTutorialDesc.trim() || 'Custom tutorial image step.',
      imageUri: newTutorialImageUri,
      isDefault: false,
      createdAt: new Date().toISOString(),
    };

    const updated = [...customTutorials, newSlide];
    setCustomTutorials(updated);
    try {
      await appStorage.setItem('custom_tutorial_slides', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }

    const newIndex = defaultTutorials.length + updated.length - 1;
    setNewTutorialTitle('');
    setNewTutorialDesc('');
    setNewTutorialImageUri('');
    setAddTutorialModalVisible(false);
    setActiveTutorialIndex(newIndex);
    Alert.alert('Success', 'Tutorial image added successfully!');
  };

  const handleDeleteCustomTutorial = (id: string) => {
    Alert.alert(
      'Delete Tutorial Image',
      'Are you sure you want to remove this tutorial image?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updated = customTutorials.filter((item) => item.id !== id);
            setCustomTutorials(updated);
            try {
              await appStorage.setItem('custom_tutorial_slides', JSON.stringify(updated));
            } catch (e) {
              console.error(e);
            }
            setActiveTutorialIndex(0);
          },
        },
      ]
    );
  };



  const joinedDateLabel = React.useMemo(() => {
    if (!currentAppUser?.createdAt) return 'Recently';
    const d = typeof (currentAppUser.createdAt as any)?.toDate === 'function'
      ? (currentAppUser.createdAt as any).toDate()
      : new Date(currentAppUser.createdAt);
    if (isNaN(d.getTime())) return 'Recently';
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }, [currentAppUser?.createdAt]);

  useEffect(() => {
    if (currentAppUser) {
      setEditName(currentAppUser.name);
      setProfileImageUri(currentAppUser.profileImageUrl || '');
      setEditPhone((currentAppUser as any).phone || '');
      setEditBio((currentAppUser as any).bio || '');
      setEditAvatarColor((currentAppUser as any).avatarColor || colors.primary);
    }
  }, [currentAppUser]);

  // Group settings
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [groupEditModalVisible, setGroupEditModalVisible] = useState(false);
  const [groupViewModalVisible, setGroupViewModalVisible] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [newMemName, setNewMemName] = useState('');
  const [newMemEmail, setNewMemEmail] = useState('');

  // Preferences & Notification Toggles
  const [notifModalVisible, setNotifModalVisible] = useState(false);
  const [notifSettings, setNotifSettings] = useState({
    masterEnabled: true,
    newExpense: true,
    editExpense: true,
    newMember: true,
    walletUpdates: true,
    adjustments: true,
    transfers: true,
    monthlyReports: true,
  });

  useEffect(() => {
    appStorage.getItem('notif_settings').then((val: any) => {
      if (val) {
        try {
          setNotifSettings(JSON.parse(val));
        } catch (e) { }
      }
    });
  }, []);

  const updateNotifSetting = (key: keyof typeof notifSettings, val: boolean) => {
    const updated = { ...notifSettings, [key]: val };
    setNotifSettings(updated);
    appStorage.setItem('notif_settings', JSON.stringify(updated)).catch(console.error);

    if (currentAppUser?.id) {
      const userRef = doc(db, 'users', currentAppUser.id);
      updateDoc(userRef, { notifSettings: updated }).catch(() => {});
    }
  };

  useEffect(() => {
    if (currentAppUser) {
      setEditName(currentAppUser.name);
      setProfileImageUri(currentAppUser.profileImageUrl || '');
    }
  }, [currentAppUser]);

  // Subscribe to clicked team's members
  useEffect(() => {
    if (!selectedGroup) {
      setGroupMembers([]);
      return;
    }
    const unsub = authService.getTeamMembers(selectedGroup.teamId, (data) => {
      setGroupMembers(data);
    });
    return unsub;
  }, [selectedGroup]);

  const initials = currentAppUser?.name
    ? currentAppUser.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)
    : 'U';

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await authService.signOut();
            setCurrentAppUser(null);
            setUserTeams([]);
          }
        }
      ]
    );
  };

  const handleCopyTeamId = async (teamId: string) => {
    await Clipboard.setStringAsync(teamId);
    Alert.alert('Copied', 'Invite code copied to clipboard!');
  };

  const handleShareTeamId = (teamId: string) => {
    Share.share({
      message: `Join my group on Share Expense!\nInvite Code: ${teamId}`,
    });
  };

  const selectCurrency = (symbol: string) => {
    setCurrency(symbol);
    setCurrencyModalVisible(false);
    Alert.alert('Currency Updated', `Default currency set to: ${symbol}`);
  };

  const handleSwitchGroup = async (team: any) => {
    if (team.teamId === activeTeamId) {
      setGroupsModalVisible(false);
      return;
    }
    setGroupsModalVisible(false);
    setLoading(true);
    try {
      const switchedUser = await authService.switchActiveTeam(team.userDocId);
      setCurrentAppUser(switchedUser);
      Alert.alert('Group Switched', `Active group set to: ${team.teamName}`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to switch group');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      Alert.alert('Error', 'Please enter a group name.');
      return;
    }
    setCreateModalVisible(false);
    setLoading(true);
    try {
      const teamId = await authService.createTeam(newGroupName.trim());
      const email = currentAppUser?.email;
      if (email) {
        const teams = await authService.getUserTeams(email);
        setUserTeams(teams);

        const newTeam = teams.find(t => t.teamId === teamId);
        if (newTeam) {
          const switchedUser = await authService.switchActiveTeam(newTeam.userDocId);
          setCurrentAppUser(switchedUser);
        }
      }
      setNewGroupName('');
      Alert.alert('Success', 'Group created successfully!');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGroup = async () => {
    if (!inviteCodeInput.trim()) {
      Alert.alert('Error', 'Please enter an invite code.');
      return;
    }
    setJoinModalVisible(false);
    setLoading(true);
    try {
      const joinedUser = await authService.joinTeam(inviteCodeInput.trim().toUpperCase());
      const email = currentAppUser?.email;
      if (email) {
        const teams = await authService.getUserTeams(email);
        setUserTeams(teams);

        const newTeam = teams.find(t => t.teamId === inviteCodeInput.trim().toUpperCase());
        if (newTeam) {
          const switchedUser = await authService.switchActiveTeam(newTeam.userDocId);
          setCurrentAppUser(switchedUser);
        }
      }
      setInviteCodeInput('');
      Alert.alert('Success', 'Joined group successfully!');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to join group');
    } finally {
      setLoading(false);
    }
  };

  // Profile settings handlers
  const handlePickProfileImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Media library access is required to choose a profile image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      const uri = result.assets[0].uri;
      setProfileImageUri(uri);
      if (!currentAppUser) return;
      setLoading(true);
      try {
        const url = await authService.uploadProfileImage(currentAppUser.id, uri);
        setCurrentAppUser({
          ...currentAppUser,
          profileImageUrl: url
        });
        Alert.alert('Success', 'Profile image updated!');
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed to upload profile image');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleRemoveProfileImage = async () => {
    if (!currentAppUser) return;
    setLoading(true);
    try {
      await authService.updateProfile(currentAppUser.id, {
        profileImageUrl: ''
      });
      setProfileImageUri('');
      setCurrentAppUser({
        ...currentAppUser,
        profileImageUrl: ''
      });
      Alert.alert('Success', 'Profile picture removed.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to remove image');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileImageOptions = () => {
    if (!profileImageUri) {
      handlePickProfileImage();
      return;
    }

    Alert.alert(
      'Profile Picture',
      'Choose an action:',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Choose New Picture', onPress: handlePickProfileImage },
        {
          text: 'Remove Picture',
          style: 'destructive',
          onPress: handleRemoveProfileImage
        }
      ]
    );
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Error', 'Name cannot be empty.');
      return;
    }
    if (!currentAppUser) return;
    setProfileModalVisible(false);
    setLoading(true);
    try {
      await authService.updateProfile(currentAppUser.id, {
        name: editName.trim(),
        phone: editPhone.trim(),
        bio: editBio.trim(),
        avatarColor: editAvatarColor,
      });
      setCurrentAppUser({
        ...currentAppUser,
        name: editName.trim(),
        phone: editPhone.trim(),
        bio: editBio.trim(),
        avatarColor: editAvatarColor,
      } as any);
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSendPasswordReset = async () => {
    if (!currentAppUser?.email) return;
    setLoading(true);
    try {
      await authService.sendPasswordReset(currentAppUser.email);
      Alert.alert('Password Reset Email Sent', `We sent a security password confirmation link to ${currentAppUser.email}. Please check your inbox to proceed.`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to send password reset email');
    } finally {
      setLoading(false);
    }
  };

  const handleSecurityPasswordSubmit = async () => {
    if (!newPasswordInput.trim() || newPasswordInput.length < 6) {
      Alert.alert('Validation Error', 'New password must be at least 6 characters long.');
      return;
    }
    if (newPasswordInput !== confirmPasswordInput) {
      Alert.alert('Validation Error', 'New password and confirm password do not match.');
      return;
    }
    if (hasPasswordSet && !currentPasswordInput.trim()) {
      Alert.alert('Validation Error', 'Please enter your current password.');
      return;
    }
    if (!currentAppUser) return;

    setSecurityModalVisible(false);
    setLoading(true);
    try {
      if (hasPasswordSet) {
        await authService.changeUserPassword(currentPasswordInput, newPasswordInput, currentAppUser.id);
        Alert.alert('Password Updated', 'Your password has been successfully updated! A verification email has been sent to your inbox to confirm the change.');
      } else {
        await authService.setUserPassword(newPasswordInput, currentAppUser.id);
        setCurrentAppUser({ ...currentAppUser, hasPasswordSet: true });
        Alert.alert('Password Set', 'Your account password has been set successfully! A verification email has been sent to your inbox.');
      }
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
    } catch (e: any) {
      Alert.alert('Security Error', e.message || 'Failed to update password. Please check your current password.');
    } finally {
      setLoading(false);
    }
  };

  // Group editing handlers
  const handlePickGroupImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Media library access is required to choose a group image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      const uri = result.assets[0].uri;
      setLoading(true);
      try {
        const url = await authService.uploadProfileImage(`group_${selectedGroup.teamId}`, uri);
        await updateDoc(doc(db, 'teams', selectedGroup.teamId), {
          groupImageUrl: url
        });

        setSelectedGroup({
          ...selectedGroup,
          groupImageUrl: url
        });

        // Reload user teams list
        const email = currentAppUser?.email;
        if (email) {
          const teams = await authService.getUserTeams(email);
          setUserTeams(teams);
        }
        Alert.alert('Success', 'Group image updated successfully!');
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed to update group image');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleRemoveGroupImage = async () => {
    if (!selectedGroup) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'teams', selectedGroup.teamId), {
        groupImageUrl: ''
      });
      setSelectedGroup({
        ...selectedGroup,
        groupImageUrl: ''
      });
      const email = currentAppUser?.email;
      if (email) {
        const teams = await authService.getUserTeams(email);
        setUserTeams(teams);
      }
      Alert.alert('Success', 'Group image removed.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to remove group image');
    } finally {
      setLoading(false);
    }
  };

  const handleGroupImageOptions = () => {
    if (!selectedGroup?.groupImageUrl) {
      handlePickGroupImage();
      return;
    }

    Alert.alert(
      'Group Picture',
      'Choose an action:',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Choose New Picture', onPress: handlePickGroupImage },
        {
          text: 'Remove Picture',
          style: 'destructive',
          onPress: handleRemoveGroupImage
        }
      ]
    );
  };

  const handleRenameGroup = async () => {
    if (!editGroupName.trim()) {
      Alert.alert('Error', 'Group name cannot be empty.');
      return;
    }
    setLoading(true);
    try {
      await updateDoc(doc(db, 'teams', selectedGroup.teamId), {
        name: editGroupName.trim()
      });
      const email = currentAppUser?.email;
      if (email) {
        const teams = await authService.getUserTeams(email);
        setUserTeams(teams);
      }
      setSelectedGroup({
        ...selectedGroup,
        teamName: editGroupName.trim()
      });
      Alert.alert('Success', 'Group renamed successfully!');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to rename group');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMemberToGroup = async () => {
    if (!newMemName.trim() || !newMemEmail.trim()) {
      Alert.alert('Error', 'Please fill in both name and email.');
      return;
    }
    setLoading(true);
    try {
      await authService.addMemberByEmail({
        email: newMemEmail.trim(),
        name: newMemName.trim(),
        teamId: selectedGroup.teamId
      });
      setNewMemName('');
      setNewMemEmail('');
      Alert.alert('Success', 'Member added successfully!');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add member');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMemberFromGroup = async (memberDocId: string) => {
    Alert.alert(
      'Remove Member',
      'Are you sure you want to remove this member from the group?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await authService.removeMember(memberDocId, selectedGroup.teamId);
              Alert.alert('Success', 'Member removed.');
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to remove member');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleDeleteGroup = () => {
    Alert.alert(
      'Delete Group',
      'Are you sure you want to permanently delete this group? All members will be removed and their workspaces cleared.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete permanently',
          style: 'destructive',
          onPress: async () => {
            setGroupEditModalVisible(false);
            setGroupsModalVisible(false);
            setLoading(true);
            try {
              // 1. Clear teamId references for all members
              for (const member of groupMembers) {
                await updateDoc(doc(db, 'users', member.id), {
                  teamId: ''
                });
              }

              // 2. Delete the team document from Firestore
              await deleteDoc(doc(db, 'teams', selectedGroup.teamId));

              // 3. Switch current user locally if active group is deleted
              if (currentAppUser && currentAppUser.teamId === selectedGroup.teamId) {
                const updatedUser = { ...currentAppUser, teamId: '' };
                await updateDoc(doc(db, 'users', currentAppUser.id), {
                  teamId: ''
                });
                setCurrentAppUser(updatedUser);
              }

              // 4. Reload user teams
              const email = currentAppUser?.email;
              if (email) {
                const teams = await authService.getUserTeams(email);
                setUserTeams(teams);
              }

              setSelectedGroup(null);
              Alert.alert('Deleted', 'Group has been successfully deleted.');
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to delete group');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const closeGroupEditModal = () => {
    setGroupEditModalVisible(false);
    setSelectedGroup(null);
    setNewMemName('');
    setNewMemEmail('');
  };

  const handleCloseProfileModal = () => {
    const isNameChanged = editName.trim() !== (currentAppUser?.name || '').trim();
    const isPhoneChanged = editPhone.trim() !== ((currentAppUser as any)?.phone || '').trim();
    const isBioChanged = editBio.trim() !== ((currentAppUser as any)?.bio || '').trim();

    if (isNameChanged || isPhoneChanged || isBioChanged) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes in your profile. What would you like to do?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              if (currentAppUser) {
                setEditName(currentAppUser.name);
                setEditPhone((currentAppUser as any).phone || '');
                setEditBio((currentAppUser as any).bio || '');
              }
              setProfileModalVisible(false);
            }
          },
          {
            text: 'Save',
            onPress: () => handleSaveProfile()
          }
        ]
      );
    } else {
      setProfileModalVisible(false);
    }
  };

  const handleCloseSecurityModal = () => {
    if (currentPasswordInput.trim() || newPasswordInput.trim() || confirmPasswordInput.trim()) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes in password fields. What would you like to do?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              setCurrentPasswordInput('');
              setNewPasswordInput('');
              setConfirmPasswordInput('');
              setSecurityModalVisible(false);
            }
          },
          {
            text: 'Save',
            onPress: () => handleSecurityPasswordSubmit()
          }
        ]
      );
    } else {
      setSecurityModalVisible(false);
    }
  };

  const handleCloseCreateModal = () => {
    if (newGroupName.trim()) {
      Alert.alert(
        'Unsaved Changes',
        'You have entered a group name. What would you like to do?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              setNewGroupName('');
              setCreateModalVisible(false);
            }
          },
          {
            text: 'Save / Create',
            onPress: () => handleCreateGroup()
          }
        ]
      );
    } else {
      setCreateModalVisible(false);
    }
  };

  const handleCloseJoinModal = () => {
    if (inviteCodeInput.trim()) {
      Alert.alert(
        'Unsaved Changes',
        'You have entered an invite code. What would you like to do?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              setInviteCodeInput('');
              setJoinModalVisible(false);
            }
          },
          {
            text: 'Save / Join',
            onPress: () => handleJoinGroup()
          }
        ]
      );
    } else {
      setJoinModalVisible(false);
    }
  };

  const handleCloseGroupEditModal = () => {
    const originalName = selectedGroup?.teamName || '';
    const isNameChanged = editGroupName.trim() !== originalName.trim();
    const isNewMemberEntered = newMemName.trim() !== '' || newMemEmail.trim() !== '';

    if (isNameChanged || isNewMemberEntered) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. What would you like to do?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: closeGroupEditModal
          },
          {
            text: 'Save',
            onPress: () => {
              if (isNameChanged) handleRenameGroup();
              if (isNewMemberEntered) handleAddMemberToGroup();
              closeGroupEditModal();
            }
          }
        ]
      );
    } else {
      closeGroupEditModal();
    }
  };

  const renderItem = (icon: string, label: string, onPress: () => void, rightElement?: React.ReactNode) => {
    return (
      <TouchableOpacity style={styles.itemRow} onPress={onPress}>
        <Ionicons name={icon as any} size={20} color={colors.primary} />
        <Text style={styles.itemLabel}>{label}</Text>
        {rightElement ? rightElement : <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />}
      </TouchableOpacity>
    );
  };

  const activeTeamIdVal = currentAppUser?.teamId || activeTeamId;

  const activeGroup = React.useMemo(() => {
    if (!activeTeamIdVal || !userTeams) return null;
    return userTeams.find(t => t.teamId === activeTeamIdVal) || null;
  }, [userTeams, activeTeamIdVal]);

  const otherAdminGroups = React.useMemo(() => {
    if (!userTeams) return [];
    return userTeams.filter(t => (t.role || '').toLowerCase() === 'admin' && t.teamId !== activeTeamIdVal);
  }, [userTeams, activeTeamIdVal]);

  const otherMemberGroups = React.useMemo(() => {
    if (!userTeams) return [];
    return userTeams.filter(t => (t.role || '').toLowerCase() !== 'admin' && t.teamId !== activeTeamIdVal);
  }, [userTeams, activeTeamIdVal]);

  const displayCurrency = React.useMemo(() => {
    const map: Record<string, string> = {
      'Rs.': 'PKR',
      '$': 'USD',
      '€': 'EUR',
      '£': 'GBP',
      '₹': 'INR',
      '¥': 'JPY',
    };
    return map[currency] || currency || 'PKR';
  }, [currency]);

  const currenciesList = [
    { s: 'PKR', n: 'Pakistani Rupee (PKR)', flag: '🇵🇰' },
    { s: 'USD', n: 'US Dollar (USD)', flag: '🇺🇸' },
    { s: 'EUR', n: 'Euro (EUR)', flag: '🇪🇺' },
    { s: 'GBP', n: 'British Pound (GBP)', flag: '🇬🇧' },
    { s: 'INR', n: 'Indian Rupee (INR)', flag: '🇮🇳' },
    { s: 'JPY', n: 'Japanese Yen (JPY)', flag: '🇯🇵' },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <GlobalLoader message="Updating..." visible={loading} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
            progressBackgroundColor={colors.surface}
          />
        }
      >
        <Text style={styles.screenHeader}>Profile & Settings</Text>

        {/* Profile & Account Hero Section */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={[styles.sectionHeaderLabel, { marginBottom: 0 }]}>Profile & Account</Text>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary + '18', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}
            onPress={() => setProfileModalVisible(true)}
          >
            <Ionicons name="create-outline" size={13} color={colors.primary} style={{ marginRight: 4 }} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.profileHeroCard}
          onPress={() => setProfileModalVisible(true)}
          activeOpacity={0.9}
        >
          <View style={styles.profileHeroTopRow}>
            {/* Avatar Ring */}
            <View style={[styles.avatarRing, { borderColor: editAvatarColor || colors.primary }]}>
              {profileImageUri ? (
                <Image source={{ uri: profileImageUri }} style={styles.avatarHeroImg} />
              ) : (
                <View style={[styles.avatarHeroPlaceholder, { backgroundColor: editAvatarColor || colors.primary }]}>
                  <Text style={styles.avatarHeroText}>{initials}</Text>
                </View>
              )}
              <View style={[styles.avatarCameraBadge, { backgroundColor: colors.primary }]}>
                <Ionicons name="camera" size={11} color="#FFFFFF" />
              </View>
            </View>

            {/* Main Info Box */}
            <View style={{ flex: 1, marginLeft: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <Text style={styles.profileHeroName}>{currentAppUser?.name || 'User'}</Text>
                <View style={[
                  styles.heroRolePill,
                  currentAppUser?.role === 'admin' ? styles.heroRolePillAdmin : styles.heroRolePillMember
                ]}>
                  <Text style={[
                    styles.heroRolePillText,
                    currentAppUser?.role === 'admin' ? styles.heroRolePillTextAdmin : styles.heroRolePillTextMember
                  ]}>
                    {currentAppUser?.role === 'admin' ? 'Admin' : 'Member'}
                  </Text>
                </View>
              </View>

              <Text style={styles.profileHeroEmail} numberOfLines={1}>
                {currentAppUser?.email || ''}
              </Text>

              {Boolean((currentAppUser as any)?.phone) && (
                <Text style={styles.profileHeroPhone} numberOfLines={1}>
                  <Ionicons name="call-outline" size={11} color={colors.textSecondary} /> {(currentAppUser as any).phone}
                </Text>
              )}
            </View>
          </View>

          {/* Bio / Tagline */}
          <Text style={styles.profileHeroBio} numberOfLines={2}>
            {(currentAppUser as any)?.bio || 'Tap to add bio & customize profile preferences.'}
          </Text>

          {/* Footer Metadata Badges */}
          <View style={styles.profileHeroFooter}>
            <View style={styles.heroMetaTag}>
              <Ionicons name="calendar-outline" size={11} color={colors.primary} style={{ marginRight: 4 }} />
              <Text style={styles.heroMetaTagText}>Joined {joinedDateLabel}</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Groups Settings sub-menu */}
        <Text style={styles.sectionHeaderLabel}>Groups Settings</Text>
        <View style={styles.sectionContent}>
          {renderItem('people-outline', 'Groups', () => setGroupsModalVisible(true))}
        </View>

        {/* Preferences */}
        <Text style={styles.sectionHeaderLabel}>Preferences</Text>
        <View style={styles.sectionContent}>
          {renderItem('cash-outline', `Currency (${displayCurrency})`, () => setCurrencyModalVisible(true))}
          {renderItem('moon-outline', 'Dark Mode', () => {
            setDarkMode(!darkMode);
          }, (
            <Switch
              value={darkMode}
              onValueChange={(val) => {
                setDarkMode(val);
              }}
              trackColor={{ false: '#EEEEEE', true: colors.primary }}
            />
          ))}
          {renderItem('notifications-outline', 'Notifications Settings', () => {
            setNotifModalVisible(true);
          })}
        </View>

        {/* Security */}
        <Text style={styles.sectionHeaderLabel}>Security</Text>
        <View style={styles.sectionContent}>
          {renderItem('lock-closed-outline', 'Forget / Change Password', () => {
            setSecurityModalVisible(true);
          })}
        </View>

        {/* Tutorial & Guide */}
        <Text style={styles.sectionHeaderLabel}>Tutorial & Guide</Text>
        <View style={styles.sectionContent}>
          {renderItem('book-outline', 'App Tutorial & Guides', () => {
            setActiveTutorialIndex(0);
            setTutorialModalVisible(true);
          }, (
            <View pointerEvents="none" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ backgroundColor: colors.primary + '18', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>
                  {combinedTutorials.length} Guides
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </View>
          ))}
        </View>

        {/* About App */}
        <Text style={styles.sectionHeaderLabel}>About</Text>
        <View style={styles.sectionContent}>
          {renderItem('information-circle-outline', 'About app', () => {
            setAboutModalVisible(true);
          })}
        </View>

        {/* Account Management Action Buttons */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, width: '100%' }}>
          <TouchableOpacity
            style={[styles.accountActionBtn, { backgroundColor: '#D32F2F' }]}
            onPress={handleSignOut}
          >
            <Ionicons name="log-out-outline" size={16} color="#FFFFFF" />
            <Text style={styles.accountActionBtnText}>Sign out</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.accountActionBtn, { backgroundColor: '#F57C00' }]}
            onPress={() => {
              Alert.alert(
                'Deactivate Account',
                'Are you sure you want to deactivate your account? It will pause your account until your next login, and your profile will be hidden from groups.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Deactivate',
                    style: 'destructive',
                    onPress: async () => {
                      if (currentAppUser) {
                        try {
                          setLoading(true);
                          await authService.deactivateAccount(currentAppUser.id);
                          setCurrentAppUser(null);
                          setUserTeams([]);
                        } catch (e: any) {
                          Alert.alert('Error', e.message || 'Failed to deactivate account');
                        } finally {
                          setLoading(false);
                        }
                      }
                    }
                  }
                ]
              );
            }}
          >
            <Ionicons name="pause-circle-outline" size={16} color="#FFFFFF" />
            <Text style={styles.accountActionBtnText}>Deactivate</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.accountActionBtn, { backgroundColor: '#C62828' }]}
            onPress={() => {
              Alert.alert(
                'Delete Account',
                'Are you sure you want to permanently delete your account? All your data will be permanently deleted after 30 days. Your expenses will remain visible to other group members with a countdown timer.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete Permanently',
                    style: 'destructive',
                    onPress: async () => {
                      if (currentAppUser) {
                        try {
                          setLoading(true);
                          await authService.deleteAccount(currentAppUser.id);
                          setCurrentAppUser(null);
                          setUserTeams([]);
                        } catch (e: any) {
                          Alert.alert('Error', e.message || 'Failed to delete account');
                        } finally {
                          setLoading(false);
                        }
                      }
                    }
                  }
                ]
              );
            }}
          >
            <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
            <Text style={styles.accountActionBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Unified Groups Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={groupsModalVisible}
        onRequestClose={() => setGroupsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: '80%', paddingBottom: modalBottomPadding }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Groups</Text>
              <TouchableOpacity onPress={() => setGroupsModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ width: '100%' }} contentContainerStyle={{ paddingBottom: 24 }}>
              {/* Action Buttons to Create / Join Group */}
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.actionCard, { backgroundColor: darkMode ? '#152C3E' : '#E3F2FD' }]}
                  onPress={() => {
                    setGroupsModalVisible(false);
                    setCreateModalVisible(true);
                  }}
                >
                  <Ionicons name="add-circle" size={24} color={colors.primary} />
                  <Text style={[styles.actionCardText, { color: colors.primary }]}>Create Group</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionCard, { backgroundColor: colors.primaryLight }]}
                  onPress={() => {
                    setGroupsModalVisible(false);
                    setJoinModalVisible(true);
                  }}
                >
                  <Ionicons name="enter" size={24} color={colors.primary} />
                  <Text style={[styles.actionCardText, { color: colors.primary }]}>Join Group</Text>
                </TouchableOpacity>
              </View>

              {!activeGroup && otherAdminGroups.length === 0 && otherMemberGroups.length === 0 ? (
                <View style={styles.emptyGroupsBox}>
                  <Text style={styles.emptyGroupsText}>No groups found. Create or join one above!</Text>
                </View>
              ) : (
                <>
                  {/* Currently Active Group Section */}
                  {activeGroup && (
                    <View style={{ marginBottom: 14 }}>
                      <Text style={[styles.sectionHeaderLabel, { fontSize: 11, letterSpacing: 0.8, color: colors.primary }]}>
                        CURRENTLY ACTIVE GROUP
                      </Text>
                      {(() => {
                        const team = activeGroup;
                        const isAdmin = (team.role || '').toLowerCase() === 'admin';
                        return (
                          <TouchableOpacity
                            key={team.teamId}
                            style={[styles.groupRow, styles.activeGroupRow]}
                            onPress={() => {
                              setGroupsModalVisible(false);
                              setSelectedGroup(team);
                              if (isAdmin) {
                                setEditGroupName(team.teamName);
                                setGroupEditModalVisible(true);
                              } else {
                                setGroupViewModalVisible(true);
                              }
                            }}
                          >
                            {team.groupImageUrl ? (
                              <Image source={{ uri: team.groupImageUrl }} style={styles.groupRowImg} />
                            ) : (
                              <View style={[styles.groupRowImgPlaceholder, { backgroundColor: colors.primary }]}>
                                <Ionicons name="people" size={18} color="#FFFFFF" />
                              </View>
                            )}

                            <View style={styles.groupInfoCol}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                                <Text style={[styles.groupNameText, styles.activeGroupNameText]}>{team.teamName}</Text>
                                <View style={[
                                  styles.groupRoleBadge,
                                  isAdmin ? styles.groupRoleBadgeAdmin : styles.groupRoleBadgeMember
                                ]}>
                                  <Text style={[
                                    styles.groupRoleBadgeText,
                                    isAdmin ? styles.groupRoleBadgeTextAdmin : styles.groupRoleBadgeTextMember
                                  ]}>
                                    {isAdmin ? 'Admin' : 'Member'}
                                  </Text>
                                </View>
                              </View>
                              <Text style={styles.inviteCodeLabel}>Invite Code: <Text style={styles.inviteCodeVal}>{team.teamId}</Text></Text>
                            </View>

                            <View style={styles.groupActionsCol}>
                              <TouchableOpacity onPress={() => handleCopyTeamId(team.teamId)} style={styles.actionIconBtn}>
                                <Ionicons name="copy-outline" size={16} color={colors.textSecondary} />
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => handleShareTeamId(team.teamId)} style={styles.actionIconBtn}>
                                <Ionicons name="share-social-outline" size={16} color={colors.textSecondary} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => handleSwitchGroup(team)}
                                style={[styles.switchActBtn, styles.switchActBtnActive]}
                              >
                                <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                              </TouchableOpacity>
                            </View>
                          </TouchableOpacity>
                        );
                      })()}
                    </View>
                  )}

                  {/* Admin Groups Category Section */}
                  {otherAdminGroups.length > 0 && (
                    <View style={{ marginBottom: 14 }}>
                      <Text style={[styles.sectionHeaderLabel, { fontSize: 11, letterSpacing: 0.8 }]}>
                        ADMIN GROUPS ({otherAdminGroups.length})
                      </Text>
                      {otherAdminGroups.map((team) => (
                        <TouchableOpacity
                          key={team.teamId}
                          style={styles.groupRow}
                          onPress={() => {
                            setGroupsModalVisible(false);
                            setSelectedGroup(team);
                            setEditGroupName(team.teamName);
                            setGroupEditModalVisible(true);
                          }}
                        >
                          {team.groupImageUrl ? (
                            <Image source={{ uri: team.groupImageUrl }} style={styles.groupRowImg} />
                          ) : (
                            <View style={[styles.groupRowImgPlaceholder, { backgroundColor: colors.primary }]}>
                              <Ionicons name="people" size={18} color="#FFFFFF" />
                            </View>
                          )}

                          <View style={styles.groupInfoCol}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                              <Text style={styles.groupNameText}>{team.teamName}</Text>
                              <View style={[styles.groupRoleBadge, styles.groupRoleBadgeAdmin]}>
                                <Text style={[styles.groupRoleBadgeText, styles.groupRoleBadgeTextAdmin]}>
                                  Admin
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.inviteCodeLabel}>Invite Code: <Text style={styles.inviteCodeVal}>{team.teamId}</Text></Text>
                          </View>

                          <View style={styles.groupActionsCol}>
                            <TouchableOpacity onPress={() => handleCopyTeamId(team.teamId)} style={styles.actionIconBtn}>
                              <Ionicons name="copy-outline" size={16} color={colors.textSecondary} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleShareTeamId(team.teamId)} style={styles.actionIconBtn}>
                              <Ionicons name="share-social-outline" size={16} color={colors.textSecondary} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleSwitchGroup(team)}
                              style={styles.switchActBtn}
                            >
                              <Ionicons name="swap-horizontal" size={18} color={colors.textSecondary} />
                            </TouchableOpacity>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Member Groups Category Section */}
                  {otherMemberGroups.length > 0 && (
                    <View style={{ marginBottom: 14 }}>
                      <Text style={[styles.sectionHeaderLabel, { fontSize: 11, letterSpacing: 0.8 }]}>
                        MEMBER GROUPS ({otherMemberGroups.length})
                      </Text>
                      {otherMemberGroups.map((team) => (
                        <TouchableOpacity
                          key={team.teamId}
                          style={styles.groupRow}
                          onPress={() => {
                            setGroupsModalVisible(false);
                            setSelectedGroup(team);
                            setGroupViewModalVisible(true);
                          }}
                        >
                          {team.groupImageUrl ? (
                            <Image source={{ uri: team.groupImageUrl }} style={styles.groupRowImg} />
                          ) : (
                            <View style={[styles.groupRowImgPlaceholder, { backgroundColor: colors.primary }]}>
                              <Ionicons name="people" size={18} color="#FFFFFF" />
                            </View>
                          )}

                          <View style={styles.groupInfoCol}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                              <Text style={styles.groupNameText}>{team.teamName}</Text>
                              <View style={[styles.groupRoleBadge, styles.groupRoleBadgeMember]}>
                                <Text style={[styles.groupRoleBadgeText, styles.groupRoleBadgeTextMember]}>
                                  Member
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.inviteCodeLabel}>Invite Code: <Text style={styles.inviteCodeVal}>{team.teamId}</Text></Text>
                          </View>

                          <View style={styles.groupActionsCol}>
                            <TouchableOpacity onPress={() => handleCopyTeamId(team.teamId)} style={styles.actionIconBtn}>
                              <Ionicons name="copy-outline" size={16} color={colors.textSecondary} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleShareTeamId(team.teamId)} style={styles.actionIconBtn}>
                              <Ionicons name="share-social-outline" size={16} color={colors.textSecondary} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleSwitchGroup(team)}
                              style={styles.switchActBtn}
                            >
                              <Ionicons name="swap-horizontal" size={18} color={colors.textSecondary} />
                            </TouchableOpacity>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Profile Edit Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={profileModalVisible}
        onRequestClose={handleCloseProfileModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { maxHeight: '90%', paddingBottom: modalBottomPadding }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Profile & Account Settings</Text>
              <TouchableOpacity onPress={handleCloseProfileModal}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ width: '100%' }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
              {/* Profile Image & Preset Colors */}
              <View style={styles.profileImagePickerContainer}>
                <TouchableOpacity onPress={handleProfileImageOptions} style={styles.profileImageBtn}>
                  {profileImageUri ? (
                    <Image source={{ uri: profileImageUri }} style={styles.profileModalImg} />
                  ) : (
                    <View style={[styles.profileModalPlaceholder, { backgroundColor: editAvatarColor || colors.primary }]}>
                      <Text style={{ fontSize: 26, fontWeight: 'bold', color: '#FFFFFF' }}>{initials}</Text>
                    </View>
                  )}
                  <View style={styles.editImgBadge}>
                    <Ionicons name="camera" size={12} color="#FFFFFF" />
                  </View>
                </TouchableOpacity>
                <Text style={styles.profilePickerText}>Tap to upload profile picture</Text>
                {Boolean(profileImageUri) && (
                  <TouchableOpacity onPress={handleRemoveProfileImage} style={{ marginTop: 4, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 12, color: colors.error, fontWeight: '600' }}>Remove picture</Text>
                  </TouchableOpacity>
                )}
              </View>



              {/* Form Fields */}
              <Text style={styles.inputFieldLabel}>Full Name</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Full Name"
                placeholderTextColor={colors.textSecondary}
                value={editName}
                onChangeText={setEditName}
              />

              <Text style={styles.inputFieldLabel}>Phone Number (Optional)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Phone Number (e.g. +92 300 1234567)"
                placeholderTextColor={colors.textSecondary}
                value={editPhone}
                onChangeText={setEditPhone}
                keyboardType="phone-pad"
              />

              <Text style={styles.inputFieldLabel}>Bio / Status Tagline</Text>
              <TextInput
                style={[styles.modalInput, { height: 65, textAlignVertical: 'top', paddingTop: 10 }]}
                placeholder="Short bio or tagline..."
                placeholderTextColor={colors.textSecondary}
                value={editBio}
                onChangeText={setEditBio}
                multiline={true}
                numberOfLines={2}
              />

              {/* Account Security Action */}
              <TouchableOpacity
                style={styles.accountSecurityCard}
                onPress={() => {
                  setProfileModalVisible(false);
                  setSecurityModalVisible(true);
                }}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} style={{ marginRight: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.textPrimary }}>Forget / Change Password</Text>
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                      Send a password reset link to your email to update your password
                    </Text>
                  </View>
                </View>
                <View style={styles.securityActionBtn}>
                  <Text style={styles.securityActionBtnText}>Manage</Text>
                </View>
              </TouchableOpacity>

              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={[styles.modalSubmitBtnSmall, { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border }]}
                  onPress={handleCloseProfileModal}
                >
                  <Text style={[styles.modalSubmitBtnTextSmall, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSubmitBtnSmall, { backgroundColor: colors.primary }]}
                  onPress={handleSaveProfile}
                >
                  <Text style={[styles.modalSubmitBtnTextSmall, { color: '#FFFFFF' }]}>Save Profile</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Account Security Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={securityModalVisible}
        onRequestClose={() => setSecurityModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { maxHeight: '90%', paddingBottom: modalBottomPadding }]}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="key-outline" size={20} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={styles.modalTitle}>Forget / Change Password</Text>
              </View>
              <TouchableOpacity onPress={() => setSecurityModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ width: '100%' }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
              {/* Security Status Card */}
              <View style={[styles.secStatusCard, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30', marginBottom: 16 }]}>
                <Ionicons name="mail-unread-outline" size={22} color={colors.primary} style={{ marginRight: 10 }} />
                <Text style={{ fontSize: 13, color: colors.textPrimary, flex: 1, lineHeight: 18 }}>
                  To set or change your account password, we will send a password reset link to your registered email address:{'\n'}
                  <Text style={{ fontWeight: 'bold', color: colors.primary }}>{currentAppUser?.email || ''}</Text>
                </Text>
              </View>

              <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 20, lineHeight: 18 }}>
                Clicking the button below will send an email containing a secure link. Open the link in your email to safely create or change your password.
              </Text>

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: colors.primary, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]}
                onPress={() => {
                  setSecurityModalVisible(false);
                  handleSendPasswordReset();
                }}
              >
                <Ionicons name="paper-plane-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.modalSubmitBtnText}>Send Password Reset Email</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalCancelBtn, { marginTop: 12 }]}
                onPress={() => setSecurityModalVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Admin Group Editor Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={groupEditModalVisible}
        onRequestClose={handleCloseGroupEditModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { maxHeight: '85%', paddingBottom: modalBottomPadding }]}>
            <View style={[styles.modalHeaderRow, { marginBottom: 4 }]}>
              <Text style={styles.modalTitle}>Manage Group</Text>
              <TouchableOpacity onPress={handleCloseGroupEditModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Configure name, picture, and members.</Text>

            <ScrollView style={{ width: '100%' }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>

              {/* Group Image Picker Option */}
              <View style={styles.groupImagePickerWrapper}>
                <TouchableOpacity onPress={handleGroupImageOptions} style={styles.groupImageBtn}>
                  {selectedGroup?.groupImageUrl ? (
                    <Image source={{ uri: selectedGroup.groupImageUrl }} style={styles.groupModalImg} />
                  ) : (
                    <View style={styles.groupModalPlaceholder}>
                      <Ionicons name="camera" size={32} color="#FFFFFF" />
                    </View>
                  )}
                  <View style={styles.editImgBadge}>
                    <Ionicons name="pencil" size={12} color="#FFFFFF" />
                  </View>
                </TouchableOpacity>
                <Text style={styles.groupImagePickerText}>Tap to set group image</Text>
                {Boolean(selectedGroup?.groupImageUrl) && (
                  <TouchableOpacity onPress={handleRemoveGroupImage} style={{ marginTop: 6, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 12, color: colors.error, fontWeight: '600' }}>Remove picture</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Group renaming */}
              <View style={styles.editorSection}>
                <Text style={styles.editorSecTitle}>Group Name</Text>
                <View style={styles.row}>
                  <TextInput
                    style={[styles.modalInput, { flex: 1, marginBottom: 0, marginRight: 8 }]}
                    value={editGroupName}
                    onChangeText={setEditGroupName}
                  />
                  <TouchableOpacity style={styles.renameBtn} onPress={handleRenameGroup}>
                    <Text style={styles.renameBtnText}>Rename</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Add member to group */}
              <View style={styles.editorSection}>
                <Text style={styles.editorSecTitle}>Add New Member</Text>
                <TextInput
                  style={[styles.modalInput, { marginBottom: 8 }]}
                  placeholder="Full Name"
                  placeholderTextColor={colors.textSecondary}
                  value={newMemName}
                  onChangeText={setNewMemName}
                />
                <View style={styles.row}>
                  <TextInput
                    style={[styles.modalInput, { flex: 1, marginBottom: 0, marginRight: 8 }]}
                    placeholder="Email Address"
                    placeholderTextColor={colors.textSecondary}
                    value={newMemEmail}
                    onChangeText={setNewMemEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  <TouchableOpacity style={styles.renameBtn} onPress={handleAddMemberToGroup}>
                    <Text style={styles.renameBtnText}>Add</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Members list */}
              <View style={styles.editorSection}>
                <Text style={styles.editorSecTitle}>Group Members ({groupMembers.length})</Text>
                {groupMembers.map((m) => {
                  let displayName = m.name;
                  if (m.deleted && m.deleteAt) {
                    const deleteAtDate = m.deleteAt.toDate ? m.deleteAt.toDate() : new Date(m.deleteAt);
                    const remainingDays = Math.ceil((deleteAtDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    if (remainingDays > 0) {
                      displayName = `${m.name} (Deleting in ${remainingDays}d)`;
                    }
                  }
                  return (
                    <View key={m.id} style={styles.memberListRow}>
                      <View style={styles.memberInfoCol}>
                        <Text style={styles.memberNameText}>{displayName}</Text>
                        <Text style={styles.memberEmailText}>{m.email}</Text>
                      </View>
                      {m.email !== currentAppUser?.email && (
                        <TouchableOpacity onPress={() => handleRemoveMemberFromGroup(m.id)} style={styles.removeMemBtn}>
                          <Ionicons name="trash-outline" size={18} color={colors.error} />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* Action Buttons Row */}
              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={[styles.modalSubmitBtnSmall, { backgroundColor: colors.error }]}
                  onPress={handleDeleteGroup}
                >
                  <Ionicons name="trash-bin-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={[styles.modalSubmitBtnTextSmall, { color: '#FFFFFF' }]}>Delete Group</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalSubmitBtnSmall, { backgroundColor: colors.primary }]}
                  onPress={closeGroupEditModal}
                >
                  <Ionicons name="checkmark-circle-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={[styles.modalSubmitBtnTextSmall, { color: '#FFFFFF' }]}>Done</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Member Group Viewer Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={groupViewModalVisible}
        onRequestClose={() => {
          setGroupViewModalVisible(false);
          setSelectedGroup(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: modalBottomPadding }]}>
            <Text style={styles.modalTitle}>{selectedGroup?.teamName}</Text>
            <Text style={styles.modalSubtitle}>View group members</Text>

            <ScrollView style={{ width: '100%', marginVertical: 12 }}>
              {groupMembers.map((m) => {
                let displayName = m.name;
                if (m.deleted && m.deleteAt) {
                  const deleteAtDate = m.deleteAt.toDate ? m.deleteAt.toDate() : new Date(m.deleteAt);
                  const remainingDays = Math.ceil((deleteAtDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  if (remainingDays > 0) {
                    displayName = `${m.name} (Deleting in ${remainingDays}d)`;
                  }
                }
                return (
                  <View key={m.id} style={styles.memberListRow}>
                    <View style={styles.memberInfoCol}>
                      <Text style={styles.memberNameText}>{displayName}</Text>
                      <Text style={styles.memberEmailText}>{m.email}</Text>
                    </View>
                    <View style={[styles.roleBadge, { backgroundColor: m.role === 'admin' ? (darkMode ? '#152C3E' : '#E3F2FD') : (darkMode ? '#2D2D2D' : '#F5F5F5') }]}>
                      <Text style={[styles.roleBadgeText, { color: m.role === 'admin' ? colors.primary : colors.textSecondary }]}>
                        {m.role === 'admin' ? 'Admin' : 'Member'}
                      </Text>
                    </View>
                  </View>
                );
              })}
              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: colors.primary, marginTop: 12 }]}
                onPress={() => {
                  setGroupViewModalVisible(false);
                  setSelectedGroup(null);
                }}
              >
                <Text style={styles.modalSubmitBtnText}>Done</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Custom About App Modal (Modern compact design) */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={aboutModalVisible}
        onRequestClose={() => setAboutModalVisible(false)}
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
              width: 64,
              height: 64,
              borderRadius: 18,
              backgroundColor: colors.primary + '15',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
              borderWidth: 1,
              borderColor: colors.primary + '30'
            }}>
              <Image
                source={require('../../../assets/icon.png')}
                style={{ width: 44, height: 44, borderRadius: 12 }}
              />
            </View>

            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 4, textAlign: 'center' }}>
              Share Expense
            </Text>

            <View style={{ backgroundColor: colors.primary + '15', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, marginBottom: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
                Version 1.6.0
              </Text>
            </View>

            <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18, marginBottom: 20 }}>
              Smart shared expense tracker & wallet manager.{'\n'}Developed by <Text style={{ fontWeight: '600', color: colors.textPrimary }}>DigitalAppsStudio</Text> in collaboration with <Text style={{ fontWeight: '600', color: colors.textPrimary }}>fyntech</Text>
            </Text>

            <TouchableOpacity
              style={{
                backgroundColor: colors.primary,
                paddingVertical: 12,
                borderRadius: 12,
                width: '100%',
                alignItems: 'center',
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: 2
              }}
              onPress={() => setAboutModalVisible(false)}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Currency Modal Selector */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={currencyModalVisible}
        onRequestClose={() => setCurrencyModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: modalBottomPadding }]}>
            <View style={[styles.modalHeaderRow, { marginBottom: 12 }]}>
              <Text style={styles.modalTitle}>Select currency</Text>
              <TouchableOpacity onPress={() => setCurrencyModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {currenciesList.map((c) => {
              const isSelected = displayCurrency === c.s;
              return (
                <TouchableOpacity
                  key={c.s}
                  style={[
                    styles.currencyOption,
                    isSelected && { backgroundColor: colors.primary + '14' }
                  ]}
                  onPress={() => selectCurrency(c.s)}
                >
                  <Text style={styles.currencyFlag}>{c.flag}</Text>
                  <Text style={[styles.currencyName, isSelected && { fontWeight: 'bold', color: colors.primary }]}>
                    {c.n}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                  )}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[styles.modalSubmitBtn, { backgroundColor: colors.primary, marginTop: 16 }]}
              onPress={() => setCurrencyModalVisible(false)}
            >
              <Text style={styles.modalSubmitBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Create Group Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={createModalVisible}
        onRequestClose={handleCloseCreateModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { paddingBottom: modalBottomPadding }]}>
            <Text style={styles.modalTitle}>Create a new group</Text>
            <Text style={styles.modalSubtitle}>You will be the administrator of this group.</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Group Name (e.g. My Family)"
              placeholderTextColor={colors.textSecondary}
              value={newGroupName}
              onChangeText={setNewGroupName}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalSubmitBtnSmall, { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border }]}
                onPress={handleCloseCreateModal}
              >
                <Text style={[styles.modalSubmitBtnTextSmall, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtnSmall, { backgroundColor: colors.primary }]}
                onPress={handleCreateGroup}
              >
                <Text style={[styles.modalSubmitBtnTextSmall, { color: '#FFFFFF' }]}>Create Group</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Join Group Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={joinModalVisible}
        onRequestClose={handleCloseJoinModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { paddingBottom: modalBottomPadding }]}>
            <Text style={styles.modalTitle}>Join a group</Text>
            <Text style={styles.modalSubtitle}>Enter the invite code (Team ID) provided by the group admin.</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Invite Code (e.g. A1B2C3D4)"
              placeholderTextColor={colors.textSecondary}
              value={inviteCodeInput}
              onChangeText={setInviteCodeInput}
              autoCapitalize="characters"
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalSubmitBtnSmall, { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border }]}
                onPress={handleCloseJoinModal}
              >
                <Text style={[styles.modalSubmitBtnTextSmall, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtnSmall, { backgroundColor: '#2E7D32' }]}
                onPress={handleJoinGroup}
              >
                <Text style={[styles.modalSubmitBtnTextSmall, { color: '#FFFFFF' }]}>Join Group</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Notification Settings Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={notifModalVisible}
        onRequestClose={() => setNotifModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: modalBottomPadding }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="notifications-outline" size={22} color={colors.primary} />
                <Text style={[styles.modalTitle, { marginLeft: 8, marginBottom: 0 }]}>Notification Settings</Text>
              </View>
              <TouchableOpacity onPress={() => setNotifModalVisible(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420, width: '100%' }}>
              {/* Master Switch */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: 'bold', color: colors.textPrimary }}>All Notifications</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>Master enable / disable all push notifications</Text>
                </View>
                <Switch
                  value={notifSettings.masterEnabled}
                  onValueChange={(val) => updateNotifSetting('masterEnabled', val)}
                  trackColor={{ false: '#EEEEEE', true: colors.primary }}
                />
              </View>

              {/* New Expense Entries */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, opacity: notifSettings.masterEnabled ? 1 : 0.4 }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>New Expense Entries</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>Notify when a member logs a new expense item</Text>
                </View>
                <Switch
                  disabled={!notifSettings.masterEnabled}
                  value={notifSettings.newExpense}
                  onValueChange={(val) => updateNotifSetting('newExpense', val)}
                  trackColor={{ false: '#EEEEEE', true: colors.primary }}
                />
              </View>

              {/* Expense Edits & Deletions */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, opacity: notifSettings.masterEnabled ? 1 : 0.4 }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>Expense Edits & Deletions</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>Notify when an expense is updated or deleted</Text>
                </View>
                <Switch
                  disabled={!notifSettings.masterEnabled}
                  value={notifSettings.editExpense}
                  onValueChange={(val) => updateNotifSetting('editExpense', val)}
                  trackColor={{ false: '#EEEEEE', true: colors.primary }}
                />
              </View>

              {/* New Member Joins */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, opacity: notifSettings.masterEnabled ? 1 : 0.4 }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>New Member Joins</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>Notify when a new member joins or is added to group</Text>
                </View>
                <Switch
                  disabled={!notifSettings.masterEnabled}
                  value={notifSettings.newMember}
                  onValueChange={(val) => updateNotifSetting('newMember', val)}
                  trackColor={{ false: '#EEEEEE', true: colors.primary }}
                />
              </View>

              {/* Wallet & Balance Updates */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, opacity: notifSettings.masterEnabled ? 1 : 0.4 }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>Wallet & Balance Updates</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>Notify when wallet deposits or split selections change</Text>
                </View>
                <Switch
                  disabled={!notifSettings.masterEnabled}
                  value={notifSettings.walletUpdates}
                  onValueChange={(val) => updateNotifSetting('walletUpdates', val)}
                  trackColor={{ false: '#EEEEEE', true: colors.primary }}
                />
              </View>

              {/* Admin Adjustments (+/-) */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, opacity: notifSettings.masterEnabled ? 1 : 0.4 }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>Admin Adjustments (+ / -)</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>Notify when an admin credits (+), debits (-), or adjusts a wallet balance</Text>
                </View>
                <Switch
                  disabled={!notifSettings.masterEnabled}
                  value={notifSettings.adjustments}
                  onValueChange={(val) => updateNotifSetting('adjustments', val)}
                  trackColor={{ false: '#EEEEEE', true: colors.primary }}
                />
              </View>

              {/* Month-End Balance Transfers */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, opacity: notifSettings.masterEnabled ? 1 : 0.4 }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>Month-End Balance Transfers</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>Notify when surplus or deficit balances are carried over to next month</Text>
                </View>
                <Switch
                  disabled={!notifSettings.masterEnabled}
                  value={notifSettings.transfers}
                  onValueChange={(val) => updateNotifSetting('transfers', val)}
                  trackColor={{ false: '#EEEEEE', true: colors.primary }}
                />
              </View>

              {/* Monthly Reports */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, opacity: notifSettings.masterEnabled ? 1 : 0.4 }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>Monthly Reports & Statements</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>Notify when monthly statement reports are ready</Text>
                </View>
                <Switch
                  disabled={!notifSettings.masterEnabled}
                  value={notifSettings.monthlyReports}
                  onValueChange={(val) => updateNotifSetting('monthlyReports', val)}
                  trackColor={{ false: '#EEEEEE', true: colors.primary }}
                />
              </View>
            </ScrollView>

            <TouchableOpacity
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.primary,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 12,
                width: '100%',
                flexDirection: 'row'
              }}
              onPress={async () => {
                if (!currentAppUser?.id) return;
                const result = await notificationService.sendTestPushNotification(currentAppUser.id);
                if (result.success) {
                  Alert.alert('Push Test Sent', `Push token registered:\n${(result.token || '').substring(0, 30)}...\n\nTest notification sent! Check device notification bar.`);
                } else {
                  Alert.alert('Push Test Failed', result.message || 'Could not register push token.');
                }
              }}
            >
              <Ionicons name="paper-plane-outline" size={18} color={colors.primary} style={{ marginRight: 6 }} />
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 14 }}>Send Test Push Notification</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalSubmitBtn, { backgroundColor: colors.primary, marginTop: 10, width: '100%' }]}
              onPress={() => setNotifModalVisible(false)}
            >
              <Text style={styles.modalSubmitBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* App Tutorial Viewer Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={tutorialModalVisible}
        onRequestClose={() => setTutorialModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: '85%', paddingBottom: modalBottomPadding }]}>
            {/* Header */}
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="book-outline" size={22} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={styles.modalTitle}>App Tutorial & Guide</Text>
              </View>
              <TouchableOpacity onPress={() => setTutorialModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Action Bar (Guide Step Count) */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>
                Step {activeTutorialIndex + 1} of {combinedTutorials.length}
              </Text>
            </View>

            {/* Card Viewer */}
            <ScrollView style={{ width: '100%', flex: 1 }} contentContainerStyle={{ alignItems: 'center', paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
              {combinedTutorials.length > 0 && (() => {
                const currentItem = combinedTutorials[activeTutorialIndex] || combinedTutorials[0];
                const itemImgSrc = currentItem.imageSource ? currentItem.imageSource : (currentItem.imageUri ? { uri: currentItem.imageUri } : null);
                return (
                  <View style={{ width: '100%', backgroundColor: colors.inputBg, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}>
                    {itemImgSrc ? (
                      <View style={{ width: '100%', position: 'relative' }}>
                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={() => setFullScreenImageSource(itemImgSrc)}
                          style={{ width: '100%', height: 380, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface, marginBottom: 14 }}
                        >
                          <Image source={itemImgSrc} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                          <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="expand-outline" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                            <Text style={{ fontSize: 11, color: '#FFFFFF', fontWeight: '600' }}>Tap to expand</Text>
                          </View>
                        </TouchableOpacity>
                        {!currentItem.isDefault && (
                          <TouchableOpacity
                            style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#D32F2F', padding: 8, borderRadius: 20 }}
                            onPress={() => handleDeleteCustomTutorial(currentItem.id)}
                          >
                            <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : (
                      <View style={{ width: '100%', height: 160, borderRadius: 12, backgroundColor: (currentItem.color || colors.primary) + '15', justifyContent: 'center', alignItems: 'center', marginBottom: 14 }}>
                        <Ionicons name={(currentItem.icon as any) || 'book-outline'} size={64} color={currentItem.color || colors.primary} />
                      </View>
                    )}

                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: colors.textPrimary, textAlign: 'center', marginBottom: 8 }}>
                      {currentItem.title}
                    </Text>

                    <Text style={{ fontSize: 13.5, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 8 }}>
                      {currentItem.description}
                    </Text>
                  </View>
                );
              })()}
            </ScrollView>

            {/* Slide Dots Indicator */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 12, gap: 6 }}>
              {combinedTutorials.map((_, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => setActiveTutorialIndex(idx)}
                  style={{
                    width: activeTutorialIndex === idx ? 20 : 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: activeTutorialIndex === idx ? colors.primary : colors.textSecondary + '40',
                  }}
                />
              ))}
            </View>

            {/* Navigation Controls */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 10 }}>
              <TouchableOpacity
                disabled={activeTutorialIndex === 0}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: activeTutorialIndex === 0 ? colors.inputBg : colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: 'center',
                  opacity: activeTutorialIndex === 0 ? 0.4 : 1,
                  flexDirection: 'row',
                  justifyContent: 'center',
                }}
                onPress={() => setActiveTutorialIndex(prev => Math.max(0, prev - 1))}
              >
                <Ionicons name="chevron-back" size={16} color={colors.textPrimary} style={{ marginRight: 4 }} />
                <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Previous</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: colors.primary,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                }}
                onPress={() => {
                  if (activeTutorialIndex < combinedTutorials.length - 1) {
                    setActiveTutorialIndex(prev => prev + 1);
                  } else {
                    setTutorialModalVisible(false);
                  }
                }}
              >
                <Text style={{ fontWeight: '700', color: '#FFFFFF' }}>
                  {activeTutorialIndex < combinedTutorials.length - 1 ? 'Next' : 'Done'}
                </Text>
                {activeTutorialIndex < combinedTutorials.length - 1 && (
                  <Ionicons name="chevron-forward" size={16} color="#FFFFFF" style={{ marginLeft: 4 }} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>



      {/* Full Screen Image Viewer Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={Boolean(fullScreenImageSource)}
        onRequestClose={() => setFullScreenImageSource(null)}
      >
        <View style={{ flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 50, right: 20, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.3)', padding: 10, borderRadius: 20 }}
            onPress={() => setFullScreenImageSource(null)}
          >
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </TouchableOpacity>
          {fullScreenImageSource && (
            <Image source={fullScreenImageSource} style={{ width: '100%', height: '90%' }} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  globalLoader: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  screenHeader: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 14,
  },
  profileHeroCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  profileHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2.5,
    padding: 2,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarHeroImg: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
  },
  avatarHeroPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarHeroText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  avatarCameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  profileHeroName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  heroRolePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  heroRolePillAdmin: {
    backgroundColor: colors.primary + '20',
  },
  heroRolePillMember: {
    backgroundColor: colors.border,
  },
  heroRolePillText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  heroRolePillTextAdmin: {
    color: colors.primary,
  },
  heroRolePillTextMember: {
    color: colors.textSecondary,
  },
  profileHeroEmail: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  profileHeroPhone: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  profileHeroBio: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  profileHeroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  heroMetaTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '12',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  heroMetaTagText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.primary,
  },
  inputFieldLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  accountSecurityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  themeSelectorSection: {
    width: '100%',
    marginBottom: 16,
    backgroundColor: colors.inputBg,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  themePillItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  themePillDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  themePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  securityActionBtn: {
    backgroundColor: colors.primary + '18',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  securityActionBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.primary,
  },
  secStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  forgotPassBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 10,
  },
  forgotPassBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  profileCard: {
    backgroundColor: colors.primaryLight,
    padding: 16,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  profileDetails: {
    marginLeft: 14,
    flex: 1,
  },
  profileName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  profileEmail: {
    fontSize: 12,
    color: colors.primaryDark,
    marginTop: 2,
  },
  tapToEdit: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 3,
    fontStyle: 'italic',
  },
  actionsRow: {
    flexDirection: 'row',
    marginBottom: 16,
    justifyContent: 'space-between',
    width: '100%',
  },
  actionCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  actionCardText: {
    marginTop: 6,
    fontWeight: '700',
    fontSize: 12,
  },
  section: {
    marginBottom: 16,
  },
  subModalSection: {
    marginBottom: 14,
    width: '100%',
  },
  sectionHeaderLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 6,
    marginTop: 2,
    paddingLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionContent: {
    backgroundColor: colors.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 14,
  },
  emptyGroupsBox: {
    backgroundColor: colors.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  emptyGroupsText: {
    color: colors.textTertiary,
    fontSize: 13,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    width: '100%',
  },
  groupRowImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  groupRowImgPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeGroupRow: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  groupInfoCol: {
    flex: 1,
    marginLeft: 12,
  },
  groupNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  activeGroupNameText: {
    color: colors.primary,
  },
  inviteCodeLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  inviteCodeVal: {
    fontWeight: 'bold',
    color: '#E65100',
  },
  groupActionsCol: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIconBtn: {
    padding: 6,
    marginLeft: 4,
  },
  switchActBtn: {
    padding: 6,
    marginLeft: 4,
  },
  switchActBtnActive: {
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
  },
  itemRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  itemLabel: {
    flex: 1,
    fontSize: 13.5,
    color: colors.textPrimary,
    marginLeft: 12,
  },
  accountActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  accountActionBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
    marginLeft: 5,
  },
  logoutBtn: {
    flexDirection: 'row',
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  logoutBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
    marginLeft: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalOverlayCentered: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 24 : 20,
    alignItems: 'center',
    width: '100%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
    alignSelf: 'flex-start',
  },
  modalSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  modalInput: {
    width: '100%',
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  modalBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 10,
    marginTop: 12,
  },
  modalSubmitBtnSmall: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  modalSubmitBtnTextSmall: {
    fontWeight: '700',
    fontSize: 13,
  },
  modalSubmitBtn: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
    flexDirection: 'row',
  },
  modalSubmitBtnText: {
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontSize: 14,
  },
  modalCancelBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 6,
  },
  modalCancelBtnText: {
    fontWeight: '600',
    color: colors.textSecondary,
    fontSize: 13,
  },
  currencyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    width: '100%',
  },
  currencyFlag: {
    fontSize: 22,
    marginRight: 14,
    width: 32,
    textAlign: 'center',
  },
  currencyName: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  modalCloseBtn: {
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
    width: '100%',
  },
  modalCloseBtnText: {
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  profileImagePickerContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  profileImageBtn: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  profileModalImg: {
    width: '100%',
    height: '100%',
  },
  profileModalPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  editImgBadge: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: '100%',
    alignItems: 'center',
    paddingVertical: 2,
  },
  profilePickerText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
  },
  groupImagePickerWrapper: {
    alignItems: 'center',
    marginVertical: 14,
    width: '100%',
  },
  groupImageBtn: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#888888',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  groupModalImg: {
    width: '100%',
    height: '100%',
  },
  groupModalPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupImagePickerText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
  },
  editorSection: {
    width: '100%',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    paddingBottom: 16,
  },
  editorSecTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  renameBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  renameBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  memberListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  memberInfoCol: {
    flex: 1,
  },
  memberNameText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  memberEmailText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  removeMemBtn: {
    padding: 8,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  groupRoleBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  groupRoleBadgeAdmin: {
    backgroundColor: '#E3F2FD',
  },
  groupRoleBadgeMember: {
    backgroundColor: '#F5F5F5',
  },
  groupRoleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  groupRoleBadgeTextAdmin: {
    color: colors.primary,
  },
  groupRoleBadgeTextMember: {
    color: colors.textSecondary,
  },
});
