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
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useStore } from '../../store/useStore';
import { expenseService } from '../../services/expenseService';
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

  const { currentAppUser, darkMode } = useStore();
  const [category, setCategory] = useState<MealCategory>(defaultCategory);
  const [items, setItems] = useState<ItemEntry[]>([{ name: '', qty: '1', price: '' }]);
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
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
      const expensesList = items.map((item) => ({
        userId: currentAppUser.id,
        userName: currentAppUser.name,
        itemName: item.name.trim(),
        quantity: item.qty.trim() || '1',
        price: parseFloat(item.price) || 0,
        category,
        date: new Date(),
        teamId: currentAppUser.teamId || `personal_${currentAppUser.id.split('_')[0]}`,
        receiptImageUrl: item.receiptUri || null,
        isEdited: false,
        createdAt: new Date(),
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
    borderRadius: 14,
    paddingVertical: 14,
    marginVertical: 12,
  },
  addItemRowText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 6,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
