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
import { Q } from '@nozbe/watermelondb';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { darkTheme } from '../../theme/tokens';
import { database } from '../../db';
import { serviceRecordsCollection, carsCollection, remindersCollection } from '../../db/queries';
import { syncNow } from '../../db/sync';
import type { RootStackParamList } from '../../navigation';
import { todayRuDate, parseRuDate, maskRuDateInput } from '../../utils/date';
import { sanitizeMoneyInput, parseMoney } from '../../utils/money';
import PhotoField from '../../components/PhotoField';
import type { ServiceType, FluidType } from '../../types/models';

type Route = RouteProp<RootStackParamList, 'AddServiceRecord'>;

const TYPES: { value: ServiceType; label: string }[] = [
  { value: 'oil', label: 'Масло двигателя' },
  { value: 'filter', label: 'Фильтр' },
  { value: 'brakes', label: 'Тормоза' },
  { value: 'tires', label: 'Шины' },
  { value: 'alignment', label: 'Сход-развал' },
  { value: 'battery', label: 'Аккумулятор' },
  { value: 'inspection', label: 'Техосмотр' },
  { value: 'repair', label: 'Ремонт' },
  { value: 'other', label: 'Другое' },
];

// Тип ТО → жидкость и регламентный интервал (км) по умолчанию — используется, чтобы
// автоматически завести/обновить напоминание о следующей замене.
const REMINDER_RULES: Partial<Record<ServiceType, { fluidType: FluidType; intervalKm: number }>> = {
  oil: { fluidType: 'engine_oil', intervalKm: 10000 },
};


export default function AddServiceRecordScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<Route>();
  const { carId } = params;

  const [type, setType] = useState<ServiceType>('oil');
  const [dateText, setDateText] = useState(todayRuDate());
  const [mileage, setMileage] = useState('');
  const [laborCost, setLaborCost] = useState('');
  const [partsCost, setPartsCost] = useState('');
  const [description, setDescription] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function validate(): { date: Date; mileageNum: number; laborNum: number | null; partsNum: number | null } | null {
    const errs: Record<string, string> = {};
    const date = parseRuDate(dateText);
    if (!date) errs.date = 'Укажите существующую дату в формате ДД.ММ.ГГГГ';

    const mileageNum = parseInt(mileage.replace(/\D/g, ''), 10);
    if (!mileage || Number.isNaN(mileageNum)) errs.mileage = 'Укажите пробег';

    // Обе суммы необязательны: пустое поле = "не указано" (null), а не 0 — иначе у записи
    // появлялась бы выдуманная разбивка "0 на работы, 0 на запчасти".
    const laborNum = laborCost.trim() ? parseMoney(laborCost) : null;
    const partsNum = partsCost.trim() ? parseMoney(partsCost) : null;
    if (laborCost.trim() && laborNum == null) errs.laborCost = 'Укажите сумму, например 1500 или 1500,50';
    if (partsCost.trim() && partsNum == null) errs.partsCost = 'Укажите сумму, например 1500 или 1500,50';

    setErrors(errs);
    if (Object.keys(errs).length > 0 || !date) return null;
    return { date, mileageNum, laborNum, partsNum };
  }

  async function handleSave() {
    const validated = validate();
    if (!validated) return;
    const { date, mileageNum, laborNum, partsNum } = validated;
    // cost остаётся ИТОГОВОЙ суммой — по ней считаются экспорт, поиск и всё прочее.
    const costNum = Math.round(((laborNum ?? 0) + (partsNum ?? 0)) * 100) / 100;

    setSaving(true);
    try {
      await database.write(async () => {
        await serviceRecordsCollection.create((r) => {
          r.carId = carId;
          r.date = date;
          r.mileage = mileageNum;
          r.type = type;
          r.cost = costNum;
          r.laborCost = laborNum ?? undefined;
          r.partsCost = partsNum ?? undefined;
          r.description = description.trim() || undefined;
          r.serviceName = serviceName.trim() || undefined;
          r.photos = photoIds;
          r.source = 'manual';
          r.createdAt = new Date();
        });

        // Пробег из записи ТО обычно самый свежий — подтягиваем в карточку авто, если он больше текущего.
        const car = await carsCollection.find(carId);
        if (mileageNum > car.currentMileage) {
          await car.update((c) => {
            c.currentMileage = mileageNum;
            c.updatedAt = new Date();
          });
        }

        // Автообновление напоминания о следующей замене для известных типов ТО (см. REMINDER_RULES).
        const rule = REMINDER_RULES[type];
        if (rule) {
          const existing = await remindersCollection
            .query(
              Q.where('car_id', carId),
              Q.where('related_fluid_type', rule.fluidType),
              Q.where('status', 'active'),
            )
            .fetch();

          const nextTarget = mileageNum + rule.intervalKm;
          if (existing.length > 0) {
            // Только вперёд: если пользователь вносит в историю СТАРУЮ замену (пробег меньше
            // последней), напоминание не должно откатиться назад и стать «просроченным».
            const current = existing[0].targetMileage ?? 0;
            if (nextTarget > current) {
              await existing[0].update((rem) => {
                rem.targetMileage = nextTarget;
              });
            }
          } else {
            await remindersCollection.create((rem) => {
              rem.carId = carId;
              rem.type = 'mileage';
              rem.targetMileage = nextTarget;
              rem.relatedFluidType = rule.fluidType;
              rem.category = 'fluid';
              rem.status = 'active';
              rem.calendarSynced = false;
            });
          }
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
        <Text style={styles.headerTitle}>Запись о ТО</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <Text style={[styles.headerAction, styles.headerActionAccent]}>{saving ? '…' : 'Готово'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field
          label="Что было сделано (необязательно)"
          value={description}
          onChangeText={setDescription}
          placeholder="Например: замена масла 5W-30 и масляного фильтра"
          multiline
          maxLength={1000}
        />

        <Text style={styles.label}>Тип работ</Text>
        <View style={styles.chipsRow}>
          {TYPES.map((t) => (
            <TouchableOpacity
              key={t.value}
              onPress={() => setType(t.value)}
              style={[styles.chip, type === t.value && styles.chipActive]}>
              <Text style={[styles.chipText, type === t.value && styles.chipTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Field
          label="Дата"
          value={dateText}
          onChangeText={(v) => setDateText(maskRuDateInput(v))}
          placeholder="ДД.ММ.ГГГГ"
          keyboardType="number-pad"
          maxLength={10}
          error={errors.date}
        />
        <Field
          label="Пробег, км"
          value={mileage}
          onChangeText={(v) => setMileage(v.replace(/\D/g, ''))}
          placeholder="128500"
          keyboardType="number-pad"
          error={errors.mileage}
        />
        <Field
          label="Стоимость работ, ₽"
          value={laborCost}
          onChangeText={(v) => setLaborCost(sanitizeMoneyInput(v))}
          placeholder="0"
          keyboardType="decimal-pad"
          error={errors.laborCost}
        />
        <Field
          label="Стоимость запчастей, ₽"
          value={partsCost}
          onChangeText={(v) => setPartsCost(sanitizeMoneyInput(v))}
          placeholder="0"
          keyboardType="decimal-pad"
          error={errors.partsCost}
        />
        <Text style={styles.total}>
          Итого: {(((parseMoney(laborCost) ?? 0) + (parseMoney(partsCost) ?? 0))).toLocaleString('ru-RU')} ₽
        </Text>
        <Field
          label="СТО / комментарий (необязательно)"
          value={serviceName}
          onChangeText={setServiceName}
          placeholder="СТО «Мотор+»"
        />

        <PhotoField label="Фото чека или документов (необязательно, до 5)" photoIds={photoIds} onChange={setPhotoIds} max={5} />
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
  multiline?: boolean;
  maxLength?: number;
}

function Field({ label, value, onChangeText, placeholder, keyboardType, error, multiline, maxLength }: FieldProps) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={darkTheme.textDisabled}
        keyboardType={keyboardType}
        multiline={multiline}
        maxLength={maxLength}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[styles.input, multiline && styles.inputMultiline, error ? { borderColor: darkTheme.danger } : null]}
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
  inputMultiline: { height: undefined, minHeight: 90, paddingTop: 12, paddingBottom: 12 },
  total: { fontSize: 15, fontWeight: '700', color: darkTheme.textPrimary, marginTop: -4, marginBottom: 16 },
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
  hint: { fontSize: 12, color: darkTheme.textDisabled, marginTop: 4, lineHeight: 17 },
});
