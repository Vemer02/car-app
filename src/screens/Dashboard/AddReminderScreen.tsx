import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { darkTheme } from '../../theme/tokens';
import { database } from '../../db';
import { remindersCollection } from '../../db/queries';
import { Q } from '@nozbe/watermelondb';
import { syncNow } from '../../db/sync';
import type { RootStackParamList } from '../../navigation';
import { formatRuDate, parseRuDate } from '../../utils/date';
import type { ReminderCategory } from '../../types/models';

type Route = RouteProp<RootStackParamList, 'AddReminder'>;

const CATEGORIES: { value: ReminderCategory; label: string }[] = [
  { value: 'osago', label: 'ОСАГО' },
  { value: 'inspection', label: 'Техосмотр' },
];

export default function AddReminderScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<Route>();
  const { carId } = params;

  const [category, setCategory] = useState<ReminderCategory>('osago');
  // На месяц вперёд по умолчанию — пустая дата сегодняшнего дня выглядела бы так,
  // будто срок уже наступил, а это не то, с чем человек обычно открывает этот экран.
  const [dateText, setDateText] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return formatRuDate(d);
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const date = parseRuDate(dateText);
    if (!date) {
      setError('Укажите существующую дату в формате ДД.ММ.ГГГГ');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await database.write(async () => {
        // Апдейт, если для этой категории уже есть активное напоминание на этой
        // машине (например, продлили ОСАГО и зашли поставить новую дату) — а не
        // плодим дубликаты при каждом заходе на экран.
        const existing = await remindersCollection
          .query(Q.where('car_id', carId), Q.where('category', category), Q.where('status', 'active'))
          .fetch();

        if (existing.length > 0) {
          await existing[0].update((rem) => {
            rem.targetDate = date;
          });
        } else {
          await remindersCollection.create((rem) => {
            rem.carId = carId;
            rem.type = 'date';
            rem.targetDate = date;
            rem.category = category;
            rem.status = 'active';
            rem.calendarSynced = false;
          });
        }
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
        <Text style={styles.headerTitle}>Напоминание</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <Text style={[styles.headerAction, styles.headerActionAccent]}>{saving ? '…' : 'Готово'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>О чём напомнить</Text>
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

        <Text style={styles.label}>Дата окончания</Text>
        <TextInput
          value={dateText}
          onChangeText={setDateText}
          placeholder="ДД.ММ.ГГГГ"
          placeholderTextColor={darkTheme.textDisabled}
          style={[styles.input, error ? { borderColor: darkTheme.danger } : null]}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.hint}>
          {category === 'osago'
            ? 'Дата, до которой действует текущий полис — найдёте в самом полисе ОСАГО.'
            : 'Дата, до которой действует диагностическая карта.'}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
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
  hint: { fontSize: 12, color: darkTheme.textSecondary, marginTop: 10, lineHeight: 17 },
});
