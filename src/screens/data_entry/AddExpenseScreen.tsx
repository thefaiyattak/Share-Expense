import React, { useState } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator, 
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Keyboard
} from 'react-native';
import { GlobalLoader } from '../../components/GlobalLoader';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useStore } from '../../store/useStore';
import { expenseService } from '../../services/expenseService';
import { authService } from '../../services/authService';
import { getThemeColors } from '../../utils/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MealCategory } from '../../models/types';

interface ItemEntry {
  name: string;
  qty: string;
  price: string;
  receiptUri?: string;
}

export default function AddExpenseScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const defaultCategory = route.params?.defaultCategory || 'breakfast';

  const { currentAppUser, darkMode, members } = useStore();
  const [category, setCategory] = useState<MealCategory>(defaultCategory);

  const [expenseDate, setExpenseDate] = useState<Date>(() => {
    if (route.params?.selectedDate) {
      const parsed = new Date(route.params.selectedDate);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  });

  const [items, setItems] = useState<ItemEntry[]>([{ name: '', qty: '1', price: '' }]);
  const [selectedSplitUserIds, setSelectedSplitUserIds] = useState<string[]>(() => 
    members.length > 0 ? members.map(m => m.id) : (currentAppUser ? [currentAppUser.id] : [])
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const colors = getThemeColors(darkMode);
  const styles = getStyles(colors);

  const handlePickReceipt = async (index: number) => {
    Alert.alert(
      'Receipt Attachment',
      'Choose source',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Camera', 
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission needed', 'Camera access is required to capture receipts.');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.8,
            });
            if (!result.canceled && result.assets?.[0]?.uri) {
              updateItem(index, 'receiptUri', result.assets[0].uri);
            }
          }
        },
        { 
          text: 'Photo Gallery', 
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission needed', 'Media library access is required.');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.8,
            });
            if (!result.canceled && result.assets?.[0]?.uri) {
              updateItem(index, 'receiptUri', result.assets[0].uri);
            }
          }
        }
      ]
    );
  };

  const updateItem = (index: number, key: keyof ItemEntry, val: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [key]: val };
    setItems(updated);

    // Clear inline error when user types
    const errKey = `${index}_${key}`;
    if (errors[errKey]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[errKey];
        return next;
      });
    }
  };

  const addItemRow = () => {
    setItems([...items, { name: '', qty: '1', price: '' }]);
  };

  const removeItemRow = (index: number) => {
    const updated = items.filter((_, i) => i !== index);
    setItems(updated);
    setErrors({});
  };

  const toggleSplitUser = (id: string) => {
    if (selectedSplitUserIds.includes(id)) {
      if (selectedSplitUserIds.length === 1) {
        Alert.alert('Validation Error', 'At least one member must be selected for the expense split.');
        return;
      }
      setSelectedSplitUserIds(prev => prev.filter(mId => mId !== id));
    } else {
      setSelectedSplitUserIds(prev => [...prev, id]);
    }
  };

  const toggleAllMembers = () => {
    if (selectedSplitUserIds.length === members.length) {
      const defaultUser = currentAppUser ? [currentAppUser.id] : (members[0] ? [members[0].id] : []);
      setSelectedSplitUserIds(defaultUser);
    } else {
      setSelectedSplitUserIds(members.map(m => m.id));
    }
  };

  const handleSave = async () => {
    if (!currentAppUser) return;

    const newErrors: Record<string, string> = {};
    for (let i = 0; i < items.length; i++) {
      if (!items[i].name.trim()) {
        newErrors[`${i}_name`] = 'Item name is required';
      }
      if (!items[i].price.trim()) {
        newErrors[`${i}_price`] = 'Price is required';
      } else if (isNaN(Number(items[i].price))) {
        newErrors[`${i}_price`] = 'Enter valid price';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSaving(true);
    try {
      const expensesList = await Promise.all(items.map(async (item) => {
        let receiptUrl = item.receiptUri || null;
        if (item.receiptUri && (item.receiptUri.startsWith('file://') || item.receiptUri.startsWith('content://'))) {
          try {
            receiptUrl = await authService.uploadReceiptImage(item.receiptUri);
          } catch (e) {
            console.log('Receipt upload fallback to local URI:', e);
          }
        }

        return {
          userId: currentAppUser.id,
          userName: currentAppUser.name,
          itemName: item.name.trim(),
          quantity: item.qty.trim() || '1',
          price: parseFloat(item.price) || 0,
          category,
          date: expenseDate,
          teamId: currentAppUser.teamId || `personal_${currentAppUser.id.split('_')[0]}`,
          receiptImageUrl: receiptUrl,
          splitUserIds: selectedSplitUserIds,
          isEdited: false,
          createdAt: new Date(),
        };
      }));

      await expenseService.addExpenses(expensesList);
      Alert.alert('Success', 'Expenses saved!', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save expenses');
    } finally {
      setSaving(false);
    }
  };

  const categoriesList: MealCategory[] = ['breakfast', 'lunch', 'dinner', 'utility'];

  return (
    <SafeAreaView style={styles.safeArea}>
      <GlobalLoader message="Saving expense..." visible={saving} />
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={styles.appBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.appBarTitle}>
            Add {category.charAt(0).toUpperCase() + category.slice(1)} Expense
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView 
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          {/* Assigned Date Badge */}
          <View style={styles.dateBanner}>
            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
            <Text style={styles.dateBannerText}>
              Target Date: <Text style={{ fontWeight: '700', color: colors.primary }}>
                {expenseDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </Text>
          </View>

        {/* Item Cards */}
        {items.map((item, i) => (
          <View key={i} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemTitle}>Item {i + 1}</Text>
              {items.length > 1 && (
                <TouchableOpacity onPress={() => removeItemRow(i)}>
                  <Ionicons name="close-circle-outline" size={20} color={colors.error} />
                </TouchableOpacity>
              )}
            </View>

            <TextInput 
              style={[styles.input, errors[`${i}_name`] ? { borderColor: colors.error, borderWidth: 1.5 } : null]}
              placeholder="Item name"
              placeholderTextColor={colors.textSecondary}
              value={item.name}
              onChangeText={(txt) => updateItem(i, 'name', txt)}
            />
            {errors[`${i}_name`] && (
              <Text style={{ color: colors.error, fontSize: 12, marginTop: -8, marginBottom: 8, marginLeft: 4 }}>
                {errors[`${i}_name`]}
              </Text>
            )}

            <View style={styles.qtyPriceRow}>
              <TextInput 
                style={[styles.input, { flex: 1, marginRight: 8 }]}
                placeholder="Qty (e.g. 1 kg)"
                placeholderTextColor={colors.textSecondary}
                value={item.qty}
                onChangeText={(txt) => updateItem(i, 'qty', txt)}
              />
              <View style={{ flex: 2 }}>
                <TextInput 
                  style={[styles.input, errors[`${i}_price`] ? { borderColor: colors.error, borderWidth: 1.5 } : null]}
                  placeholder="Price"
                  placeholderTextColor={colors.textSecondary}
                  value={item.price}
                  onChangeText={(txt) => updateItem(i, 'price', txt)}
                  keyboardType="numeric"
                />
                {errors[`${i}_price`] && (
                  <Text style={{ color: colors.error, fontSize: 12, marginTop: -8, marginBottom: 8, marginLeft: 4 }}>
                    {errors[`${i}_price`]}
                  </Text>
                )}
              </View>
            </View>

            {/* Receipt uploader */}
            <TouchableOpacity 
              style={styles.receiptBox}
              onPress={() => handlePickReceipt(i)}
            >
              {item.receiptUri ? (
                <Image source={{ uri: item.receiptUri }} style={styles.receiptImage} />
              ) : (
                <View style={styles.receiptPlaceholder}>
                  <Ionicons name="camera-outline" size={20} color={colors.textTertiary} />
                  <Text style={styles.receiptText}>Add receipt (optional)</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        ))}

        {/* Add Row Button */}
        <TouchableOpacity style={styles.addItemRowBtn} onPress={addItemRow}>
          <Ionicons name="add" size={20} color={colors.primary} />
          <Text style={styles.addItemRowText}>Add item</Text>
        </TouchableOpacity>

        {/* Member Selection for Expense Split */}
        {members.length > 0 && (
          <View style={styles.splitSectionCard}>
            <View style={styles.splitSectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="people-outline" size={18} color={colors.primary} style={{ marginRight: 6 }} />
                <Text style={styles.splitSectionTitle}>Split Expense Among</Text>
              </View>
              <TouchableOpacity onPress={toggleAllMembers} style={styles.selectAllBtn}>
                <Text style={styles.selectAllText}>
                  {selectedSplitUserIds.length === members.length ? 'Clear' : 'Select All'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.splitSectionSub}>
              Selected members ({selectedSplitUserIds.length}/{members.length}) will share this expense cost equally.
            </Text>

            <View style={styles.membersGrid}>
              {members.map((m) => {
                const isSelected = selectedSplitUserIds.includes(m.id);
                const initials = m.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[
                      styles.memberChip,
                      isSelected && { backgroundColor: colors.primary + '18', borderColor: colors.primary }
                    ]}
                    onPress={() => toggleSplitUser(m.id)}
                  >
                    <View style={[
                      styles.chipAvatar,
                      isSelected ? { backgroundColor: colors.primary } : { backgroundColor: colors.divider }
                    ]}>
                      <Text style={[styles.chipAvatarText, isSelected && { color: '#FFFFFF' }]}>
                        {initials}
                      </Text>
                    </View>
                    <Text style={[styles.chipName, isSelected && { fontWeight: 'bold', color: colors.primary }]} numberOfLines={1}>
                      {m.name}
                    </Text>
                    <Ionicons 
                      name={isSelected ? "checkbox" : "square-outline"} 
                      size={18} 
                      color={isSelected ? colors.primary : colors.textTertiary} 
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Save Button */}
        <TouchableOpacity 
          style={styles.saveBtn} 
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.saveBtnText}>Save expenses</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  appBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.divider,
    paddingHorizontal: 16,
  },
  backBtn: {
    padding: 4,
  },
  appBarTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  categoryContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: colors.divider,
    padding: 3,
    borderRadius: 10,
  },
  catBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  catBtnSelected: {
    backgroundColor: colors.primary,
  },
  catText: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  catTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  itemCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  itemTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  input: {
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: 10,
  },
  qtyPriceRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  receiptBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    borderStyle: 'dashed',
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  receiptPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  receiptText: {
    fontSize: 12,
    color: colors.textTertiary,
    marginLeft: 8,
  },
  receiptImage: {
    width: '100%',
    height: '100%',
  },
  addItemRowBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    marginVertical: 10,
  },
  addItemRowText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 13,
    marginLeft: 6,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  splitSectionCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  splitSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  splitSectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  selectAllBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  selectAllText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  splitSectionSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: 12,
  },
  membersGrid: {
    gap: 8,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  chipAvatarText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  chipName: {
    flex: 1,
    fontSize: 13,
    color: colors.textPrimary,
  },
  dateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  dateBannerText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});
