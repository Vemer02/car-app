import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { darkTheme } from '../../theme/tokens';
import { useActiveCar } from '../../context/ActiveCarContext';
import { useDashboardData, reminderDueLabel } from '../../hooks/useDashboardData';
import { database } from '../../db';
import { syncNow, syncWithTimeout } from '../../db/sync';
import PrimaryButton from '../../components/PrimaryButton';
import {
  CarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  BellIcon,
  BluetoothIcon,
  DropletIcon,
  ClockIcon,
  AlertCircleIcon,
  ShieldIcon,
  ClipboardCheckIcon,
  PlusIcon,
} from '../../components/icons';
import type { MainTabParamList, RootStackParamList } from '../../navigation';
import type Reminder from '../../db/models/Reminder';

type TabNav = BottomTabNavigationProp<MainTabParamList, 'Dashboard'>;
type RootNav = NativeStackNavigationProp<RootStackParamList>;

const SERVICE_ICON_BG: Record<string, string> = {
  engine_oil: '#2a2408',
  brake: '#2a1414',
  transmission: '#0d2620',
  coolant: '#0d1e2a',
};
const SERVICE_ICON_COLOR: Record<string, string> = {
  engine_oil: darkTheme.warning,
  brake: darkTheme.danger,
  transmission: darkTheme.accentSecondary,
  coolant: darkTheme.accent,
};

const CATEGORY_ICON_BG: Record<string, string> = {
  osago: '#0d1e2a',
  inspection: '#1a1033',
};
const CATEGORY_ICON_COLOR: Record<string, string> = {
  osago: darkTheme.accent,
  inspection: '#c084fc',
};

function reminderVisual(reminder: Reminder) {
  if (reminder.category === 'osago' || reminder.category === 'inspection') {
    return {
      bg: CATEGORY_ICON_BG[reminder.category],
      color: CATEGORY_ICON_COLOR[reminder.category],
      Icon: reminder.category === 'osago' ? ShieldIcon : ClipboardCheckIcon,
    };
  }
  const key = reminder.relatedFluidType ?? 'other';
  return {
    bg: SERVICE_ICON_BG[key] ?? darkTheme.surfaceElevated,
    color: SERVICE_ICON_COLOR[key] ?? darkTheme.textSecondary,
    Icon: DropletIcon,
  };
}

function progressColor(progress: number): string {
  if (progress >= 1) return darkTheme.danger;
  if (progress >= 0.75) return darkTheme.warning;
  return darkTheme.accentSecondary;
}

const CATEGORY_LABELS: Record<string, string> = {
  osago: 'ОСАГО',
  inspection: 'Техосмотр',
};

function reminderLabel(reminder: Reminder): string {
  if (reminder.category && CATEGORY_LABELS[reminder.category]) return CATEGORY_LABELS[reminder.category];
  const names: Record<string, string> = {
    engine_oil: 'Замена масла двигателя',
    transmission: 'Замена масла АКПП',
    brake: 'Тормозная жидкость',
    coolant: 'Антифриз',
    power_steering: 'Жидкость ГУР',
  };
  return (reminder.relatedFluidType && names[reminder.relatedFluidType]) || 'Напоминание';
}

export default function DashboardScreen() {
  const tabNavigation = useNavigation<TabNav>();
  const rootNavigation = tabNavigation.getParent<RootNav>();

  const { cars, activeCar, setActiveCarId } = useActiveCar();
  const { loading, reminders, upcomingService, monthTotal, dailyTotals } = useDashboardData();

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [mileageModalOpen, setMileageModalOpen] = useState(false);
  const [mileageInput, setMileageInput] = useState('');
  const [savingMileage, setSavingMileage] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await syncWithTimeout();
    } finally {
      setRefreshing(false);
    }
  }

  function openMileageModal() {
    setMileageInput(activeCar ? String(activeCar.currentMileage) : '');
    setMileageModalOpen(true);
  }

  async function saveMileage() {
    if (!activeCar) return;
    const value = parseInt(mileageInput.replace(/\D/g, ''), 10);
    if (Number.isNaN(value) || value < 0) return;
    setSavingMileage(true);
    try {
      await database.write(async () => {
        await activeCar.update((c) => {
          c.currentMileage = value;
          c.updatedAt = new Date();
        });
      });
      setMileageModalOpen(false);
      syncNow();
    } finally {
      setSavingMileage(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>Загрузка…</Text>
      </View>
    );
  }

  if (!activeCar) {
    return (
      <View style={styles.emptyState}>
        <CarIcon size={40} color={darkTheme.textDisabled} />
        <Text style={styles.emptyTitle}>В гараже пока нет автомобилей</Text>
        <Text style={styles.emptyText}>Добавьте первый автомобиль на вкладке «Гараж»</Text>
        <PrimaryButton
          title="Перейти в Гараж"
          onPress={() => tabNavigation.navigate('Garage')}
          style={{ marginTop: 20, paddingHorizontal: 24 }}
        />
      </View>
    );
  }

  const maxDaily = Math.max(1, ...dailyTotals.map((d) => d.total));
  const upcomingVisual = upcomingService ? reminderVisual(upcomingService.reminder) : null;

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.carSwitcherButton}
          onPress={() => cars.length > 1 && setSwitcherOpen(true)}
          disabled={cars.length <= 1}>
          <Text style={styles.carName}>
            {activeCar.make} {activeCar.model}
          </Text>
          {cars.length > 1 && <ChevronDownIcon size={16} color={darkTheme.textSecondary} />}
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconButton} accessibilityLabel="Уведомления">
            <BellIcon size={18} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.avatarButton}
            onPress={() => tabNavigation.navigate('Garage')}
            accessibilityLabel="Профиль">
            <Text style={styles.avatarText}>
              {(activeCar.plateNumber ?? activeCar.make).slice(0, 2).toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      {activeCar.plateNumber ? <Text style={styles.plate}>{activeCar.plateNumber}</Text> : null}

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={darkTheme.accent}
            colors={[darkTheme.accent]}
          />
        }>
        {/* Car switcher dots */}
        {cars.length > 1 && (
          <View style={styles.dotsRow}>
            {cars.map((c) => (
              <View
                key={c.id}
                style={[styles.dot, c.id === activeCar.id ? styles.dotActive : styles.dotInactive]}
              />
            ))}
          </View>
        )}

        {/* Mileage card */}
        <View style={styles.card}>
          <View style={styles.cardLabelRow}>
            <CarIcon size={15} color={darkTheme.textSecondary} strokeWidth={2} />
            <Text style={styles.cardLabel}>ПРОБЕГ</Text>
          </View>
          <Text style={styles.mileageValue}>
            {activeCar.currentMileage.toLocaleString('ru-RU')} <Text style={styles.mileageUnit}>км</Text>
          </Text>

          <View style={styles.obdRow}>
            <View style={styles.obdDotWrap}>
              <View style={styles.obdDotOff} />
            </View>
            <BluetoothIcon size={14} color={darkTheme.textSecondary} />
            <Text style={styles.obdTextOff}>OBD2 не подключён</Text>
          </View>

          <View style={styles.mileageButtonsRow}>
            <PrimaryButton
              title="Ввести вручную"
              variant="secondary"
              onPress={openMileageModal}
              style={{ flex: 1 }}
            />
            <PrimaryButton
              title="Подключить OBD2"
              variant="secondary"
              onPress={() => rootNavigation?.navigate('Obd2Connect', { carId: activeCar.id })}
              style={{ flex: 1 }}
            />
          </View>
        </View>

        {/* Upcoming service */}
        {upcomingService && upcomingVisual ? (
          <TouchableOpacity style={styles.card} onPress={() => tabNavigation.navigate('Service')}>
            <View style={styles.serviceRow}>
              <View style={[styles.serviceIconWrap, { backgroundColor: upcomingVisual.bg }]}>
                <upcomingVisual.Icon size={18} color={upcomingVisual.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.serviceTitle}>{reminderLabel(upcomingService.reminder)}</Text>
                <Text style={styles.serviceSubtitle}>{upcomingService.dueLabel}</Text>
              </View>
              <ChevronRightIcon size={18} color={darkTheme.textDisabled} />
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.round(upcomingService.progress * 100)}%`,
                    backgroundColor: progressColor(upcomingService.progress),
                  },
                ]}
              />
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.card}>
            <Text style={styles.emptyCardText}>Нет активных напоминаний о ТО</Text>
          </View>
        )}

        {/* Reminders */}
        <View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Напоминания</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <TouchableOpacity
                onPress={() => rootNavigation?.navigate('AddReminder', { carId: activeCar.id })}
                accessibilityLabel="Добавить напоминание об ОСАГО или техосмотре"
                hitSlop={8}>
                <PlusIcon size={16} color={darkTheme.accent} strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => tabNavigation.navigate('Service')}>
                <Text style={styles.sectionLink}>Все</Text>
              </TouchableOpacity>
            </View>
          </View>

          {reminders.length === 0 ? (
            <Text style={styles.emptyCardText}>Пока нет напоминаний</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {reminders.slice(0, 3).map((reminder) => {
                const due = reminderDueLabel(reminder, activeCar.currentMileage);
                const overdue = due.startsWith('просрочено');
                return (
                  <View key={reminder.id} style={styles.reminderRow}>
                    {overdue ? (
                      <AlertCircleIcon size={17} color={darkTheme.danger} />
                    ) : (
                      <ClockIcon size={17} color={darkTheme.textSecondary} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reminderTitle}>{reminderLabel(reminder)}</Text>
                      <Text style={overdue ? styles.reminderDueOverdue : styles.reminderDue}>{due}</Text>
                    </View>
                    <ChevronRightIcon size={16} color={darkTheme.textDisabled} />
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Monthly expenses */}
        <TouchableOpacity style={styles.card} onPress={() => tabNavigation.navigate('Expenses')}>
          <View style={styles.expensesHeaderRow}>
            <View>
              <Text style={styles.cardLabel}>РАСХОДЫ ЗА МЕСЯЦ</Text>
              <Text style={styles.expensesTotal}>{monthTotal.toLocaleString('ru-RU')} ₽</Text>
            </View>
            <Text style={styles.sectionLink}>Подробнее</Text>
          </View>
          <View style={styles.barsRow}>
            {dailyTotals.map((d, i) => (
              <View
                key={i}
                style={[
                  styles.bar,
                  {
                    height: `${Math.max(6, (d.total / maxDaily) * 100)}%`,
                    backgroundColor: d.total > 0 ? darkTheme.accent : darkTheme.border,
                  },
                ]}
              />
            ))}
          </View>
        </TouchableOpacity>
      </ScrollView>

      {/* Car switcher modal */}
      <Modal visible={switcherOpen} transparent animationType="fade" onRequestClose={() => setSwitcherOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setSwitcherOpen(false)}>
          <View style={styles.switcherSheet}>
            {cars.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={styles.switcherRow}
                onPress={() => {
                  setActiveCarId(c.id);
                  setSwitcherOpen(false);
                }}>
                <CarIcon size={18} color={c.id === activeCar.id ? darkTheme.accent : darkTheme.textSecondary} />
                <Text style={[styles.switcherText, c.id === activeCar.id && { color: darkTheme.accent }]}>
                  {c.make} {c.model}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Manual mileage modal */}
      <Modal
        visible={mileageModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setMileageModalOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.mileageSheet}>
            <Text style={styles.mileageSheetTitle}>Текущий пробег</Text>
            <TextInput
              value={mileageInput}
              onChangeText={setMileageInput}
              keyboardType="number-pad"
              placeholder="128450"
              placeholderTextColor={darkTheme.textDisabled}
              style={styles.mileageInput}
              autoFocus
            />
            <View style={styles.mileageButtonsFooter}>
              <PrimaryButton
                title="Отмена"
                variant="secondary"
                onPress={() => setMileageModalOpen(false)}
                style={{ flex: 1 }}
              />
              <PrimaryButton
                title="Сохранить"
                onPress={saveMileage}
                loading={savingMileage}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: darkTheme.background },
  header: {
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  carSwitcherButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  carName: { fontSize: 19, fontWeight: '700', color: darkTheme.textPrimary },
  plate: { fontSize: 13, color: darkTheme.textSecondary, paddingHorizontal: 20, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: darkTheme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: darkTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontWeight: '700', fontSize: 13, color: darkTheme.background },
  content: { padding: 20, paddingTop: 14, gap: 14, paddingBottom: 40 },
  dotsRow: { flexDirection: 'row', gap: 6 },
  dot: { height: 6, borderRadius: 3 },
  dotActive: { width: 18, backgroundColor: darkTheme.accent },
  dotInactive: { width: 6, backgroundColor: darkTheme.border },
  card: {
    backgroundColor: darkTheme.surface,
    borderWidth: 1,
    borderColor: darkTheme.border,
    borderRadius: 16,
    padding: 18,
  },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardLabel: { fontSize: 12, fontWeight: '700', color: darkTheme.textSecondary, letterSpacing: 0.4 },
  mileageValue: {
    fontSize: 32,
    fontWeight: '800',
    color: darkTheme.textPrimary,
    marginTop: 4,
    letterSpacing: -0.5,
  },
  mileageUnit: { fontSize: 16, fontWeight: '600', color: darkTheme.textSecondary },
  obdRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  obdDotWrap: { width: 8, height: 8 },
  obdDotOff: { width: 8, height: 8, borderRadius: 4, backgroundColor: darkTheme.textDisabled },
  obdTextOff: { fontSize: 13, color: darkTheme.textSecondary, fontWeight: '600' },
  mileageButtonsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  serviceIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceTitle: { fontSize: 15, fontWeight: '600', color: darkTheme.textPrimary },
  serviceSubtitle: { fontSize: 13, color: darkTheme.textSecondary, marginTop: 1 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: darkTheme.border,
    marginTop: 14,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3 },
  emptyCardText: { fontSize: 14, color: darkTheme.textSecondary },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: darkTheme.textPrimary },
  sectionLink: { fontSize: 13, fontWeight: '600', color: darkTheme.accent },
  reminderRow: {
    backgroundColor: darkTheme.surface,
    borderWidth: 1,
    borderColor: darkTheme.border,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reminderTitle: { fontSize: 14, fontWeight: '600', color: darkTheme.textPrimary },
  reminderDue: { fontSize: 12, color: darkTheme.textSecondary, marginTop: 1 },
  reminderDueOverdue: { fontSize: 12, color: darkTheme.danger, marginTop: 1 },
  expensesHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  expensesTotal: { fontSize: 24, fontWeight: '800', color: darkTheme.textPrimary, marginTop: 4 },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 48, marginTop: 16 },
  bar: { flex: 1, borderRadius: 4, minHeight: 4 },
  emptyState: {
    flex: 1,
    backgroundColor: darkTheme.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: darkTheme.textPrimary, marginTop: 12, textAlign: 'center' },
  emptyText: { fontSize: 14, color: darkTheme.textSecondary, textAlign: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  switcherSheet: {
    backgroundColor: darkTheme.surfaceElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 12,
    paddingBottom: 28,
  },
  switcherRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  switcherText: { fontSize: 15, fontWeight: '600', color: darkTheme.textPrimary },
  mileageSheet: {
    backgroundColor: darkTheme.surfaceElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 28,
    gap: 14,
  },
  mileageSheetTitle: { fontSize: 16, fontWeight: '700', color: darkTheme.textPrimary },
  mileageInput: {
    height: 52,
    borderRadius: 12,
    backgroundColor: darkTheme.surface,
    borderWidth: 1,
    borderColor: darkTheme.border,
    color: darkTheme.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 16,
  },
  mileageButtonsFooter: { flexDirection: 'row', gap: 10 },
});
