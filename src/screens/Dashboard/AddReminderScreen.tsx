import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { darkTheme } from '../../theme/tokens';
import { database } from '../../db';
import { remindersCollection, carsCollection } from '../../db/queries';
import { Q } from '@nozbe/watermelondb';
import { syncNow } from '../../db/sync';
import type { RootStackParamList } from '../../navigation';
import { formatRuDate, parseRuDate, maskRuDateInput } from '../../utils/date';
import type { ReminderCategory } from '../../types/models';
import { validateReminderForm } from '../../utils/reminderForm';

type Route = RouteProp<RootStackParamList, 'AddReminder'>;
type Kind = Exclude<ReminderCategory, 'fluid'>;

const KINDS: { value: Kind; label: string }[] = [
  { value: 'osago', label: 'ОСАГО' },
  { value: 'inspection', label: 'Техосмотр' },
  { value: 'custom', label: 'Своё' },
];

function monthAhead(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return formatRuDate(d);
}

export default function AddReminderScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<Route>();
  const { carId, reminderId } = params;
  const editing = reminderId != null;

  const [kind, setKind] = useState<Kind>('osago');
  const [title, setTitle] = useState('');
  // На месяц вперёд для ОСАГО/техосмотра — пустая дата сегодняшнего дня выглядела бы так,
  // будто срок уже наступил. Для «Своё» дата необязательна (можно только по пробегу).
  const [dateText, setDateText] = useState(monthAhead);
  const [dateTouched, setDateTouched] = useState(false);
  const [mileageText, setMileageText] = useState('');
  const [currentMileage, setCurrentMileage] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    carsCollection
      .find(carId)
      .then((car) => setCurrentMileage(car.currentMileage))
      .catch(() => {});
  }, [carId]);

  // Режим правки: подставляем то, что уже записано.
  useEffect(() => {
    if (!reminderId) return;
    remindersCollection
      .find(reminderId)
      .then((r) => {
        setKind((r.category === 'fluid' ? 'custom' : r.category) as Kind);
        setTitle(r.title ?? '');
        setDateText(r.targetDate ? formatRuDate(r.targetDate) : '');
        setMileageText(r.targetMileage != null ? String(r.targetMileage) : '');
        setDateTouched(true);
      })
      .catch(() => {});
  }, [reminderId]);

  function chooseKind(next: Kind) {
    setKind(next);
    // Дату, которую человек ещё не трогал, подстраиваем под вид напоминания.
    if (!dateTouched) setDateText(next === 'custom' ? '' : monthAhead());
  }

  async function handleSave() {
    const isCustom = kind === 'custom';
    const result = validateReminderForm({ kind, title, dateText, mileageText, currentMileage });
    setErrors(result.errors);
    if (result.type == null) return;
    const { date, mileage, type } = result;

    setSaving(true);
    try {
      await database.write(async () => {
        const apply = (rem: import('../../db/models/Reminder').default) => {
          rem.category = kind;
          rem.status = 'active';
          if (isCustom) {
            rem.title = title.trim();
            rem.targetDate = date ?? undefined;
            rem.targetMileage = mileage ?? undefined;
            rem.type = type;
          } else {
            rem.type = 'date';
            rem.targetDate = date!;
          }
        };

        if (editing) {
          await (await remindersCollection.find(reminderId!)).update(apply);
          return;
        }
        if (isCustom) {
          // «Своих» может быть сколько угодно — каждое новое отдельная запись.
          await remindersCollection.create((rem) => {
            rem.carId = carId;
            rem.calendarSynced = false;
            apply(rem);
          });
          return;
        }
        // ОСАГО/техосмотр — одно активное на машину и вид: повторный заход (продлили полис,
        // ставите новую дату) обновляет существующее, а не плодит дубликаты.
        const existing = await remindersCollection
          .query(Q.where('car_id', carId), Q.where('category', kind), Q.where('status', 'active'))
          .fetch();
        if (existing.length > 0) {
          await existing[0].update(apply);
        } else {
          await remindersCollection.create((rem) => {
            rem.carId = carId;
            rem.calendarSynced = false;
            apply(rem);
          });
        }
      });
      navigation.goBack();
      syncNow();
    } finally {
      setSaving(false);
    }
  }

  const hint =
    kind === 'osago'
      ? 'Дата, до которой действует текущий полис — найдёте в самом полисе ОСАГО.'
      : kind === 'inspection'
        ? 'Дата, до которой действует диагностическая карта.'
        : 'Можно указать дату, пробег или оба сразу — напомним, что наступит раньше.';

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.headerAction}>Отмена</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{editing ? 'Изменить напоминание' : 'Напоминание'}</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <Text style={[styles.headerAction, styles.headerActionAccent]}>{saving ? '…' : 'Готово'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!editing && (
          <>
            <Text style={styles.label}>О чём напомнить</Text>
            <View style={styles.chipsRow}>
              {KINDS.map((k) => (
                <TouchableOpacity
                  key={k.value}
                  onPress={() => chooseKind(k.value)}
                  style={[styles.chip, kind === k.value && styles.chipActive]}>
                  <Text style={[styles.chipText, kind === k.value && styles.chipTextActive]}>{k.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {kind === 'custom' && (
          <>
            <Text style={styles.label}>Название</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Например: заменить дворники"
              placeholderTextColor={darkTheme.textDisabled}
              maxLength={60}
              style={[styles.input, errors.title ? { borderColor: darkTheme.danger } : null]}
            />
            {errors.title ? <Text style={styles.error}>{errors.title}</Text> : <View style={{ height: 16 }} />}
          </>
        )}

        <Text style={styles.label}>{kind === 'custom' ? 'Дата (необязательно)' : 'Дата окончания'}</Text>
        <TextInput
          value={dateText}
          onChangeText={(v) => {
            setDateTouched(true);
            setDateText(maskRuDateInput(v));
          }}
          keyboardType="number-pad"
          maxLength={10}
          placeholder="ДД.ММ.ГГГГ"
          placeholderTextColor={darkTheme.textDisabled}
          style={[styles.input, errors.date ? { borderColor: darkTheme.danger } : null]}
        />
        {errors.date ? <Text style={styles.error}>{errors.date}</Text> : <View style={{ height: 16 }} />}

        {kind === 'custom' && (
          <>
            <Text style={styles.label}>Пробег, км (необязательно)</Text>
            <TextInput
              value={mileageText}
              onChangeText={(v) => setMileageText(v.replace(/\D/g, ''))}
              placeholder={currentMileage != null ? `Сейчас ${currentMileage.toLocaleString('ru-RU')}` : 'Например: 60000'}
              placeholderTextColor={darkTheme.textDisabled}
              keyboardType="number-pad"
              style={[styles.input, errors.mileage ? { borderColor: darkTheme.danger } : null]}
            />
            {errors.mileage ? <Text style={styles.error}>{errors.mileage}</Text> : <View style={{ height: 16 }} />}
          </>
        )}

        <Text style={styles.hint}>{hint}</Text>
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
  error: { fontSize: 12, color: darkTheme.danger, marginTop: 6, marginBottom: 10 },
  hint: { fontSize: 12, color: darkTheme.textSecondary, marginTop: 4, lineHeight: 17 },
});
