import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { darkTheme } from '../../theme/tokens';
import { useActiveCar } from '../../context/ActiveCarContext';
import { observeActiveReminders } from '../../db/queries';
import { reminderDueLabel, reminderUrgencyScore } from '../../hooks/useDashboardData';
import { useReminderActions } from '../../hooks/useReminderActions';
import { reminderLabel, reminderVisual } from '../../utils/reminderDisplay';
import { AlertCircleIcon, PlusIcon, BellIcon } from '../../components/icons';
import type Reminder from '../../db/models/Reminder';
import type { RootStackParamList } from '../../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Reminders'>;

/** Все активные напоминания по машине — отсюда же их можно изменить, отметить выполненными или удалить. */
export default function RemindersScreen() {
  const navigation = useNavigation<Nav>();
  const { activeCar } = useActiveCar();
  const [reminders, setReminders] = useState<Reminder[]>([]);

  useEffect(() => {
    if (!activeCar) {
      setReminders([]);
      return;
    }
    const sub = observeActiveReminders(activeCar.id).subscribe(setReminders);
    return () => sub.unsubscribe();
  }, [activeCar?.id]);

  const sorted = useMemo(
    () =>
      activeCar
        ? [...reminders].sort(
            (a, b) => reminderUrgencyScore(a, activeCar.currentMileage) - reminderUrgencyScore(b, activeCar.currentMileage),
          )
        : [],
    [reminders, activeCar?.currentMileage],
  );

  const { open, sheet } = useReminderActions((r) =>
    navigation.navigate('AddReminder', { carId: r.carId, reminderId: r.id }),
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.headerAction}>Закрыть</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Напоминания</Text>
        <TouchableOpacity
          onPress={() => activeCar && navigation.navigate('AddReminder', { carId: activeCar.id })}
          accessibilityLabel="Добавить напоминание"
          hitSlop={10}>
          <PlusIcon size={20} color={darkTheme.accent} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.content}
        ListEmptyComponent={
          <View style={styles.empty}>
            <BellIcon size={36} color={darkTheme.textDisabled} />
            <Text style={styles.emptyText}>Напоминаний пока нет</Text>
            <Text style={styles.emptyHint}>Нажмите «+», чтобы добавить своё, ОСАГО или техосмотр</Text>
          </View>
        }
        renderItem={({ item }) => {
          const due = activeCar ? reminderDueLabel(item, activeCar.currentMileage) : '';
          const overdue = due.startsWith('просрочено');
          const visual = reminderVisual(item);
          return (
            <TouchableOpacity style={styles.row} onPress={() => open(item)}>
              <View style={[styles.iconWrap, { backgroundColor: visual.bg }]}>
                {overdue ? (
                  <AlertCircleIcon size={18} color={darkTheme.danger} />
                ) : (
                  <visual.Icon size={18} color={visual.color} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={2}>
                  {reminderLabel(item)}
                </Text>
                <Text style={overdue ? styles.dueOverdue : styles.due}>{due}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
      {sheet}
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
  headerAction: { fontSize: 15, color: darkTheme.accent, fontWeight: '700' },
  content: { padding: 20, gap: 10, paddingBottom: 40, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: darkTheme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: darkTheme.border,
    padding: 14,
  },
  iconWrap: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '700', color: darkTheme.textPrimary },
  due: { fontSize: 12, color: darkTheme.textSecondary, marginTop: 3 },
  dueOverdue: { fontSize: 12, color: darkTheme.danger, marginTop: 3 },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 80 },
  emptyText: { fontSize: 15, fontWeight: '600', color: darkTheme.textSecondary },
  emptyHint: { fontSize: 12, color: darkTheme.textDisabled, textAlign: 'center', paddingHorizontal: 30 },
});
