import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { darkTheme } from '../../theme/tokens';
import { database } from '../../db';
import { expensesCollection } from '../../db/queries';
import { syncNow } from '../../db/sync';
import type { RootStackParamList } from '../../navigation';
import { todayRuDate, parseRuDate } from '../../utils/date';
import { sanitizeMoneyInput, parseMoney } from '../../utils/money';
import type { ExpenseCategory } from '../../types/models';

type Route = RouteProp<RootStackParamList, 'AddExpense'>;

const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'fuel', label: 'Топливо' },
  { value: 'wash', label: 'Мойка' },
  { value: 'parts', label: 'Запчасти' },
  { value: 'repair', label: 'Ремонт' },
  { value: 'insurance', label: 'Страховка' },
  { value: 'tax', label: 'Налог' },
  { value: 'fine', label: 'Штраф' },
  { value: 'parking', label: 'Парковка' },
  { value: 'toll', label: 'Платная дорога' },
  { value: 'other', label: 'Другое' },
];


export default function AddExpenseScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<Route>();
  const { carId } = params;

  const [category, setCategory] = useState<ExpenseCategory>('fuel');
  const [dateText, setDateText] = useState(todayRuDate());
  const [amount, setAmount] = useState('');
  const [fuelVolume, setFuelVolume] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const isFuel = category === 'fuel';

  function validate(): { date: Date; amountNum: number; volumeNum: number | null } | null {
    const errs: Record<string, string> = {};
    const date = parseRuDate(dateText);
    if (!date) errs.date = 'Укажите существующую дату в формате ДД.ММ.ГГГГ';

    const amountNum = parseMoney(amount);
    if (amountNum == null || amountNum <= 0) errs.amount = 'Укажите сумму';

    let volumeNum: number | null = null;
    if (isFuel && fuelVolume) {
      volumeNum = parseFloat(fuelVolume.replace(',', '.'));
      if (Number.isNaN(volumeNum) || volumeNum <= 0 || volumeNum > 500) errs.fuelVolume = 'Укажите объём в литрах, например 42,5';
    }

    setErrors(errs);
    if (Object.keys(errs).length > 0 || !date || amountNum == null) return null;
    return { date, amountNum, volumeNum };
  }

  async function handleSave() {
    const validated = validate();
    if (!validated) return;
    const { date, amountNum, volumeNum } = validated;

    setSaving(true);
    try {
      await database.write(async () => {
        await expensesCollection.create((e) => {
          e.carId = carId;
          e.category = category;
          e.amount = amountNum;
          e.date = date;
          if (isFuel && volumeNum) {
            e.fuelVolume = volumeNum;
            e.fuelPrice = Math.round((amountNum / volumeNum) * 100) / 100;
          }
          e.notes = notes.trim() || undefined;
        });
      });
      navigation.goBack();
      syncNow();
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.headerAction}>Отмена</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Новый расход</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <Text style={[styles.headerAction, styles.headerActionAccent]}>{saving ? '…' : 'Готово'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Категория</Text>
        <View style={styles.chipsRow}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.value}
              onPress={() => setCategory(c.value)}
              style={[styles.chip, category === c.value && styles.chipActive]}>
              <Text style={[styles.chipText, category === c.value && styles.chipTextActive]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Field label="Дата" value={dateText} onChangeText={setDateText} placeholder="ДД.ММ.ГГГГ" error={errors.date} />
        <Field
          label="Сумма, ₽"
          value={amount}
          onChangeText={(v) => setAmount(sanitizeMoneyInput(v))}
          placeholder="0"
          keyboardType="decimal-pad"
          error={errors.amount}
        />

        {isFuel && (
          <Field
            label="Объём, л (необязательно)"
            value={fuelVolume}
            onChangeText={setFuelVolume}
            placeholder="42"
            keyboardType="decimal-pad"
            error={errors.fuelVolume}
          />
        )}

        <Field label="Комментарий (необязательно)" value={notes} onChangeText={setNotes} placeholder="АЗС «Лукойл»" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  error?: string;
}

function Field({ label, value, onChangeText, placeholder, keyboardType, error }: FieldProps) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={darkTheme.textDisabled}
        keyboardType={keyboardType}
        style={[styles.input, error ? { borderColor: darkTheme.danger } : null]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: darkTheme.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: darkTheme.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: darkTheme.textPrimary },
  headerAction: { fontSize: 15, color: darkTheme.textSecondary, fontWeight: '600' },
  headerActionAccent: { color: darkTheme.accent, fontWeight: '700' },
  content: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', color: darkTheme.textSecondary, marginBottom: 8 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: darkTheme.surface,
    borderWidth: 1,
    borderColor: darkTheme.border,
  },
  chipActive: { backgroundColor: darkTheme.accent, borderColor: darkTheme.accent },
  chipText: { fontSize: 13, fontWeight: '600', color: darkTheme.textSecondary },
  chipTextActive: { color: darkTheme.background },
  input: {
    height: 50,
    borderRadius: 12,
    backgroundColor: darkTheme.surface,
    borderWidth: 1,
    borderColor: darkTheme.border,
    color: darkTheme.textPrimary,
    fontSize: 15,
    paddingHorizontal: 14,
  },
  error: { fontSize: 12, color: darkTheme.danger, marginTop: 6 },
});
