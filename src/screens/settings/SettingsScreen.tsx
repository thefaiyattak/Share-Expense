import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  Alert, 
  Switch, 
  Clipboard,
  Share,
  Modal,
  Platform,
  TextInput,
  ActivityIndicator,
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useStore } from '../../store/useStore';
import { authService } from '../../services/authService';
import { getThemeColors } from '../../utils/theme';
import { Ionicons } from '@expo/vector-icons';

export default function SettingsScreen() {
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
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  
  // Separate modals for Admin and Member Groups settings
  const [adminGroupsModalVisible, setAdminGroupsModalVisible] = useState(false);
  const [memberGroupsModalVisible, setMemberGroupsModalVisible] = useState(false);
  
  const [newGroupName, setNewGroupName] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [loading, setLoading] = useState(false);

  // Profile editing
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [editName, setEditName] = useState(currentAppUser?.name || '');
  const [profileImageUri, setProfileImageUri] = useState(currentAppUser?.profileImageUrl || '');

  // Group settings
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [groupEditModalVisible, setGroupEditModalVisible] = useState(false);
  const [groupViewModalVisible, setGroupViewModalVisible] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [newMemName, setNewMemName] = useState('');
  const [newMemEmail, setNewMemEmail] = useState('');

  // Preferences
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

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

  const handleCopyTeamId = (teamId: string) => {
    Clipboard.setString(teamId);
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
    if (team.teamId === activeTeamId) return;
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
      setCreateModalVisible(false);
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
      setJoinModalVisible(false);
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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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

  const handleSaveProfileName = async () => {
    if (!editName.trim()) {
      Alert.alert('Error', 'Name cannot be empty.');
      return;
    }
    if (!currentAppUser) return;
    setLoading(true);
    try {
      await authService.updateProfile(currentAppUser.id, {
        name: editName.trim()
      });
      setCurrentAppUser({
        ...currentAppUser,
        name: editName.trim()
      });
      setProfileModalVisible(false);
      Alert.alert('Success', 'Profile updated!');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update profile');
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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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

              setGroupEditModalVisible(false);
              setSelectedGroup(null);
              setAdminGroupsModalVisible(false);
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

  const renderItem = (icon: string, label: string, onPress: () => void, rightElement?: React.ReactNode) => {
    return (
      <TouchableOpacity style={styles.itemRow} onPress={onPress}>
        <Ionicons name={icon as any} size={20} color={colors.primary} />
        <Text style={styles.itemLabel}>{label}</Text>
        {rightElement ? rightElement : <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />}
      </TouchableOpacity>
    );
  };

  const adminGroupsList = userTeams.filter(t => t.role === 'Admin');
  const memberGroupsList = userTeams.filter(t => t.role === 'Member');

  const currenciesList = [
    { s: 'Rs.', n: 'Pakistani Rupee (PKR)' },
    { s: '$', n: 'US Dollar (USD)' },
    { s: '€', n: 'Euro (EUR)' },
    { s: '£', n: 'British Pound (GBP)' },
    { s: '₹', n: 'Indian Rupee (INR)' },
    { s: '¥', n: 'Japanese Yen (JPY)' },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {loading && (
        <View style={styles.globalLoader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.screenHeader}>Profile & Settings</Text>

        {/* Profile Settings */}
        <Text style={styles.sectionHeaderLabel}>Profile Settings</Text>
        <TouchableOpacity 
          style={styles.profileCard} 
          onPress={() => setProfileModalVisible(true)}
        >
          <View style={styles.avatar}>
            {profileImageUri ? (
              <Image source={{ uri: profileImageUri }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>{initials}</Text>
            )}
          </View>
          <View style={styles.profileDetails}>
            <Text style={styles.profileName}>{currentAppUser?.name || 'User'}</Text>
            <Text style={styles.profileEmail}>{currentAppUser?.email || ''}</Text>
            <Text style={styles.tapToEdit}>Tap to edit profile</Text>
          </View>
          <Ionicons name="pencil-outline" size={18} color={colors.primaryDark} />
        </TouchableOpacity>

        {/* Groups Settings sub-menu (Admin/Member lists split) */}
        <Text style={styles.sectionHeaderLabel}>Groups Settings</Text>
        <View style={styles.sectionContent}>
          {renderItem('people-outline', 'Admin Groups', () => setAdminGroupsModalVisible(true))}
          {renderItem('person-outline', 'Member Groups', () => setMemberGroupsModalVisible(true))}
        </View>

        {/* Preferences */}
        <Text style={styles.sectionHeaderLabel}>Preferences</Text>
        <View style={styles.sectionContent}>
          {renderItem('cash-outline', `Currency (${currency})`, () => setCurrencyModalVisible(true))}
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
          {renderItem('notifications-outline', 'Notifications', () => {
            setNotificationsEnabled(!notificationsEnabled);
          }, (
            <Switch 
              value={notificationsEnabled} 
              onValueChange={(val) => {
                setNotificationsEnabled(val);
              }} 
              trackColor={{ false: '#EEEEEE', true: colors.primary }}
            />
          ))}
        </View>

        {/* About App */}
        <Text style={styles.sectionHeaderLabel}>About</Text>
        <View style={styles.sectionContent}>
          {renderItem('information-circle-outline', 'About app', () => {
            Alert.alert('Share Expense', 'Version 1.0.0\nDeveloped by: fyntech');
          })}
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.logoutBtnText}>Sign out</Text>
        </TouchableOpacity>

        {/* Account Deactivation & Deletion Buttons */}
        <View style={{ marginTop: 20, gap: 10 }}>
          <TouchableOpacity 
            style={[styles.logoutBtn, { borderColor: '#FFA000', marginTop: 0 }]} 
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
            <Ionicons name="pause-circle-outline" size={20} color="#FFA000" />
            <Text style={[styles.logoutBtnText, { color: '#FFA000' }]}>Deactivate Account</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.logoutBtn, { borderColor: colors.error, marginTop: 0 }]} 
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
            <Ionicons name="trash-outline" size={20} color={colors.error} />
            <Text style={[styles.logoutBtnText, { color: colors.error }]}>Delete Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Admin Groups Modal Sub-menu */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={adminGroupsModalVisible}
        onRequestClose={() => setAdminGroupsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: '80%' }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Admin groups</Text>
              <TouchableOpacity onPress={() => setAdminGroupsModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ width: '100%' }} contentContainerStyle={{ paddingBottom: 24 }}>
              {/* Action Buttons to Create / Join Group */}
              <View style={styles.actionsRow}>
                <TouchableOpacity 
                  style={[styles.actionCard, { backgroundColor: darkMode ? '#152C3E' : '#E3F2FD' }]} 
                  onPress={() => setCreateModalVisible(true)}
                >
                  <Ionicons name="add-circle" size={24} color={colors.primary} />
                  <Text style={[styles.actionCardText, { color: colors.primary }]}>Create Group</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.actionCard, { backgroundColor: darkMode ? '#1A331E' : '#E8F5E9' }]} 
                  onPress={() => setJoinModalVisible(true)}
                >
                  <Ionicons name="enter" size={24} color="#4CAF50" />
                  <Text style={[styles.actionCardText, { color: '#4CAF50' }]}>Join Group</Text>
                </TouchableOpacity>
              </View>

              {adminGroupsList.length === 0 ? (
                <View style={styles.emptyGroupsBox}>
                  <Text style={styles.emptyGroupsText}>No admin groups yet.</Text>
                </View>
              ) : (
                adminGroupsList.map((team) => {
                  const isActive = team.teamId === activeTeamId;
                  return (
                    <TouchableOpacity 
                      key={team.teamId} 
                      style={[styles.groupRow, isActive && styles.activeGroupRow]}
                      onPress={() => {
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
                        <Text style={[styles.groupNameText, isActive && styles.activeGroupNameText]}>{team.teamName}</Text>
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
                          style={[styles.switchActBtn, isActive && styles.switchActBtnActive]}
                        >
                          <Ionicons name={isActive ? "checkmark-circle" : "swap-horizontal"} size={18} color={isActive ? colors.primary : colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Member Groups Modal Sub-menu */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={memberGroupsModalVisible}
        onRequestClose={() => setMemberGroupsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: '80%' }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Member groups</Text>
              <TouchableOpacity onPress={() => setMemberGroupsModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ width: '100%' }} contentContainerStyle={{ paddingBottom: 24 }}>
              {memberGroupsList.length === 0 ? (
                <View style={styles.emptyGroupsBox}>
                  <Text style={styles.emptyGroupsText}>No joined groups yet.</Text>
                </View>
              ) : (
                memberGroupsList.map((team) => {
                  const isActive = team.teamId === activeTeamId;
                  return (
                    <TouchableOpacity 
                      key={team.teamId} 
                      style={[styles.groupRow, isActive && styles.activeGroupRow]}
                      onPress={() => {
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
                      
                      <Text style={[styles.groupNameText, isActive && styles.activeGroupNameText, { flex: 1, marginLeft: 12 }]}>{team.teamName}</Text>
                      <View style={styles.groupActionsCol}>
                        <TouchableOpacity 
                          onPress={() => handleSwitchGroup(team)} 
                          style={[styles.switchActBtn, isActive && styles.switchActBtnActive]}
                        >
                          <Ionicons name={isActive ? "checkmark-circle" : "swap-horizontal"} size={18} color={isActive ? colors.primary : colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })
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
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Profile</Text>

            {/* Profile image picker preview */}
            <View style={styles.profileImagePickerContainer}>
              <TouchableOpacity onPress={handlePickProfileImage} style={styles.profileImageBtn}>
                {profileImageUri ? (
                  <Image source={{ uri: profileImageUri }} style={styles.profileModalImg} />
                ) : (
                  <View style={styles.profileModalPlaceholder}>
                    <Ionicons name="camera" size={32} color="#FFFFFF" />
                  </View>
                )}
                <View style={styles.editImgBadge}>
                  <Ionicons name="pencil" size={12} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
              <Text style={styles.profilePickerText}>Tap to change picture</Text>
            </View>

            <TextInput 
              style={styles.modalInput}
              placeholder="Name"
              placeholderTextColor={colors.textSecondary}
              value={editName}
              onChangeText={setEditName}
            />

            <TouchableOpacity 
              style={styles.modalSubmitBtn}
              onPress={handleSaveProfileName}
            >
              <Text style={styles.modalSubmitBtnText}>Save Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalCancelBtn}
              onPress={() => setProfileModalVisible(false)}
            >
              <Text style={styles.modalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Admin Group Editor Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={groupEditModalVisible}
        onRequestClose={() => {
          setGroupEditModalVisible(false);
          setSelectedGroup(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <Text style={styles.modalTitle}>Manage Group</Text>
            <Text style={styles.modalSubtitle}>Configure name, picture, and members.</Text>

            <ScrollView style={{ width: '100%' }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>
              
              {/* Group Image Picker Option */}
              <View style={styles.groupImagePickerWrapper}>
                <TouchableOpacity onPress={handlePickGroupImage} style={styles.groupImageBtn}>
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

              {/* Delete Group Action */}
              <TouchableOpacity 
                style={[styles.modalSubmitBtn, { backgroundColor: colors.error, marginTop: 12 }]}
                onPress={handleDeleteGroup}
              >
                <Ionicons name="trash-bin-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.modalSubmitBtnText}>Delete Group</Text>
              </TouchableOpacity>
            </ScrollView>

            <TouchableOpacity 
              style={[styles.modalCancelBtn, { marginTop: 10 }]}
              onPress={() => {
                setGroupEditModalVisible(false);
                setSelectedGroup(null);
              }}
            >
              <Text style={styles.modalCancelBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
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
          <View style={styles.modalContent}>
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
            </ScrollView>

            <TouchableOpacity 
              style={styles.modalSubmitBtn}
              onPress={() => {
                setGroupViewModalVisible(false);
                setSelectedGroup(null);
              }}
            >
              <Text style={styles.modalSubmitBtnText}>Close</Text>
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
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select currency</Text>

            {currenciesList.map((c) => (
              <TouchableOpacity 
                key={c.s} 
                style={styles.currencyOption}
                onPress={() => selectCurrency(c.s)}
              >
                <Text style={styles.currencySymbol}>{c.s}</Text>
                <Text style={styles.currencyName}>{c.n}</Text>
                {currency === c.s && (
                  <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}

            <TouchableOpacity 
              style={styles.modalCloseBtn}
              onPress={() => setCurrencyModalVisible(false)}
            >
              <Text style={styles.modalCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Create Group Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={createModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create a new group</Text>
            <Text style={styles.modalSubtitle}>You will be the administrator of this group.</Text>

            <TextInput 
              style={styles.modalInput}
              placeholder="Group Name (e.g. My Family)"
              placeholderTextColor={colors.textSecondary}
              value={newGroupName}
              onChangeText={setNewGroupName}
            />

            <TouchableOpacity 
              style={styles.modalSubmitBtn}
              onPress={handleCreateGroup}
            >
              <Text style={styles.modalSubmitBtnText}>Create Group</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalCancelBtn}
              onPress={() => setCreateModalVisible(false)}
            >
              <Text style={styles.modalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Join Group Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={joinModalVisible}
        onRequestClose={() => setJoinModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
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

            <TouchableOpacity 
              style={[styles.modalSubmitBtn, { backgroundColor: '#2E7D32' }]}
              onPress={handleJoinGroup}
            >
              <Text style={styles.modalSubmitBtnText}>Join Group</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalCancelBtn}
              onPress={() => setJoinModalVisible(false)}
            >
              <Text style={styles.modalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  screenHeader: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 20,
  },
  profileCard: {
    backgroundColor: colors.primaryLight,
    padding: 20,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
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
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  profileDetails: {
    marginLeft: 16,
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  profileEmail: {
    fontSize: 13,
    color: colors.primaryDark,
    marginTop: 2,
  },
  tapToEdit: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  actionsRow: {
    flexDirection: 'row',
    marginBottom: 24,
    justifyContent: 'space-between',
    width: '100%',
  },
  actionCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 16,
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
    marginTop: 8,
    fontWeight: '700',
    fontSize: 13,
  },
  section: {
    marginBottom: 24,
  },
  subModalSection: {
    marginBottom: 20,
    width: '100%',
  },
  sectionHeaderLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 10,
    paddingLeft: 4,
  },
  sectionContent: {
    backgroundColor: colors.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 20,
  },
  emptyGroupsBox: {
    backgroundColor: colors.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 20,
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    width: '100%',
  },
  groupRowImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  groupRowImgPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  activeGroupNameText: {
    color: colors.primary,
  },
  inviteCodeLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
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
    padding: 8,
    marginLeft: 4,
  },
  switchActBtn: {
    padding: 8,
    marginLeft: 4,
  },
  switchActBtnActive: {
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
  },
  itemRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  itemLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    marginLeft: 12,
  },
  logoutBtn: {
    flexDirection: 'row',
    height: 48,
    borderWidth: 1.5,
    borderColor: colors.error,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: colors.background,
  },
  logoutBtnText: {
    color: colors.error,
    fontWeight: 'bold',
    fontSize: 14,
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
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
  modalSubmitBtn: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    flexDirection: 'row',
  },
  modalSubmitBtnText: {
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontSize: 15,
  },
  modalCancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 10,
  },
  modalCancelBtnText: {
    fontWeight: '600',
    color: colors.textSecondary,
    fontSize: 14,
  },
  currencyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    width: '100%',
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
    width: 40,
  },
  currencyName: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
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
});
