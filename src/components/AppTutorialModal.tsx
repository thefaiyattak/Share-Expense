import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from '../store/useStore';
import { getThemeColors } from '../utils/theme';

const appStorage = (AsyncStorage as any)?.default || AsyncStorage;

export const defaultTutorialsList = [
  {
    id: 'def_1',
    title: '01. Dashboard Screen',
    description: 'Your Home for Smart Expense Tracking — Workspace/Group selector, Role badge, Notification bell, My Wallet & Collective Wallet cards, Date selector calendar, and Daily category quick-add buttons (+).',
    imageSource: require('../../assets/tutorials/01_dashboard_screen.png'),
    isDefault: true,
  },
  {
    id: 'def_2',
    title: '02. Switch Group Modal',
    description: 'Switch Anytime, Track Everything — Switch easily between Personal Workspace and group workspaces, view group invite codes, or create and join groups.',
    imageSource: require('../../assets/tutorials/02_switch_group_modal.png'),
    isDefault: true,
  },
  {
    id: 'def_3',
    title: '03. Add Expense Screen',
    description: 'Add Every Detail, Split with Ease — Select target date, enter item name, quantity & unit price, attach receipts, add multiple items, and split cost equally among selected members.',
    imageSource: require('../../assets/tutorials/03_add_expense_screen.png'),
    isDefault: true,
  },
  {
    id: 'def_4',
    title: '04. Expenses Screen',
    description: 'See Everything, Stay in Control — View collective wallet deposit summary, group invite code & share, add member, color-coded spending distribution chart, members list & generate PDF/CSV reports.',
    imageSource: require('../../assets/tutorials/04_expenses_screen.png'),
    isDefault: true,
  },
  {
    id: 'def_5',
    title: '05. Member Profile Screen',
    description: 'Your Finances, All in One Place — Track wallet deposit card, spent (paid out) card, calculated share card, net balance/deficit card, admin pending adjustments (+/-), carry to next month, wallet usage gauge, and expense history.',
    imageSource: require('../../assets/tutorials/05_member_profile_screen.png'),
    isDefault: true,
  },
  {
    id: 'def_6',
    title: '06. Statistics Screen',
    description: 'Understand Your Spending at a Glance — Time range selector (Daily, Weekly, Monthly, Custom), range total banner, category summary cards, donut chart breakdown, and spending trend line graph over time.',
    imageSource: require('../../assets/tutorials/06_statistics_screen.png'),
    isDefault: true,
  },
  {
    id: 'def_7',
    title: '07. Settings Screen',
    description: 'Personalize Your App Your Way — Manage profile & account, groups settings, currency selection, dark mode toggle, push notifications settings, forget/change password, sign out, deactivate & delete account.',
    imageSource: require('../../assets/tutorials/07_settings_screen.png'),
    isDefault: true,
  },
];

interface AppTutorialModalProps {
  visible: boolean;
  onClose: () => void;
  modalBottomPadding?: number;
}

export default function AppTutorialModal({
  visible,
  onClose,
  modalBottomPadding = 20,
}: AppTutorialModalProps) {
  const { darkMode } = useStore();
  const colors = getThemeColors(darkMode);
  const styles = getStyles(colors);

  const [activeTutorialIndex, setActiveTutorialIndex] = useState(0);
  const [customTutorials, setCustomTutorials] = useState<any[]>([]);
  const [fullScreenImageSource, setFullScreenImageSource] = useState<any>(null);

  useEffect(() => {
    if (visible) {
      appStorage.getItem('custom_tutorial_slides').then((val: any) => {
        if (val) {
          try {
            setCustomTutorials(JSON.parse(val));
          } catch (e) {
            console.error('Error parsing custom tutorials', e);
          }
        }
      }).catch(() => {});
    }
  }, [visible]);

  const combinedTutorials = React.useMemo(() => {
    return [...defaultTutorialsList, ...customTutorials];
  }, [customTutorials]);

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

  return (
    <>
      <Modal
        animationType="slide"
        transparent={true}
        visible={visible}
        onRequestClose={onClose}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: '85%', paddingBottom: modalBottomPadding }]}>
            {/* Header */}
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="book-outline" size={22} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={styles.modalTitle}>App Tutorial & Guide</Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
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
            <ScrollView
              style={{ width: '100%', flex: 1 }}
              contentContainerStyle={{ alignItems: 'center', paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}
            >
              {combinedTutorials.length > 0 && (() => {
                const currentItem = combinedTutorials[activeTutorialIndex] || combinedTutorials[0];
                const itemImgSrc = currentItem.imageSource
                  ? currentItem.imageSource
                  : (currentItem.imageUri ? { uri: currentItem.imageUri } : null);

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
                    onClose();
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
    </>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      alignItems: 'center',
    },
    modalHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
      marginBottom: 12,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.textPrimary,
    },
  });
