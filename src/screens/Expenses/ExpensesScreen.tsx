import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { darkTheme } from '../../theme/tokens';
import { useActiveCar } from '../../context/ActiveCarContext';
import { observeExpensesBetween } from '../../db/queries';
import { syncNow, syncWithTimeout } from '../../db/sync';
import { database } from '../../db';
import type Expense from '../../db/models/Expense';
import { WalletIcon, DropletIcon, PlusIcon, CarIcon } from '../../components/icons';
import type { MainTabParamList, RootStackParamList } from '../../navigation';
import type { ExpenseCategory } from '../../types/models';

type TabNav = BottomTabNavigationProp<MainTabParamList, 'Expenses'>;
type RootNav = NativeStackNavigationProp<RootStackParamList>;

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  fuel: 'Топливо',
  wash: 'Мойка',
  parts: 'Запчасти',
  repair: 'Ремонт',
  insurance: 'Страховка',
  tax: 'Налог',
  fine: 'Штраф',
  parking: 'Парковка',
  toll: 'Платная дорога',
  other: 'Другое',
};

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  fuel: darkTheme.accent,
  wash: darkTheme.accentSecondary,
  parts: '#c084fc',
  repair: darkTheme.danger,
  insurance: darkTheme.warning,
  tax: darkTheme.textSecondary,
  fine: darkTheme.danger,
  parking: darkTheme.textSecondary,
  toll: darkTheme.textSecondary,
  other: darkTheme.textDisabled,
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}
function startOfNextMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
}
function dayLabel(date: Date): string {
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  if (isToday) return 'Сегодня';
  if (isYesterday) return 'Вчера';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export default function ExpensesScreen() {
  const tabNavigation = useNavigation<TabNav>();
  const rootNavigation = tabNavigation.getParent<RootNav>();
  const { activeCar } = useActiveCar();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await syncWithTimeout();
    } finally {
      setRefreshing(false);
    }
  }

  function confirmDelete(expense: Expense) {
    Alert.alert('Удалить расход?', 'Это действие нельзя отменить.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await database.write(async () => {
            await expense.markAsDeleted();
          });
          syncNow();
        },
      },
    ]);
  }

  useEffect(() => {
    if (!activeCar) {
      setExpenses([]);
      return;
    }
    const now = new Date();
    const sub = observeExpensesBetween(activeCar.id, startOfMonth(now), startOfNextMonth(now)).subscribe(
      setExpenses,
    );
    return () => sub.unsubscribe();
  }, [activeCar?.id]);

  const total = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);

  const byCategory = useMemo(() => {
    const map = new Map<ExpenseCategory, number>();
    for (const e of expenses) {
      map.set(e.category as ExpenseCategory, (map.get(e.category as ExpenseCategory) ?? 0) + e.amount);
    }
    return Array.from(map.entries())
      .map(([category, amount]) => ({ category, amount, pct: total ? Math.round((amount / total) * 100) : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses, total]);

  const fuelStats = useMemo(() => {
    const fuelExpenses = expenses.filter((e) => e.category === 'fuel' && e.fuelVolume);
    const totalVolume = fuelExpenses.reduce((s, e) => s + (e.fuelVolume ?? 0), 0);
    return totalVolume > 0 ? totalVolume : null;
  }, [expenses]);

  const sections = useMemo(() => {
    const groups = new Map<string, Expense[]>();
    for (const e of expenses) {
      const key = dayLabel(e.date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }
    return Array.from(groups.entries());
  }, [expenses]);

  if (!activeCar) {
    return (
      <View style={styles.emptyState}>
        <CarIcon size={40} color={darkTheme.textDisabled} />
        <Text style={styles.emptyText}>Сначала добавьте автомобиль в Гараже</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Расходы</Text>
      </View>

      <FlatList
        data={sections}
        keyExtractor={([day]) => day}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={darkTheme.accent} colors={[darkTheme.accent]} />
        }
        ListHeaderComponent={
          <View style={{ gap: 14, marginBottom: 14 }}>
            <View style={styles.card}>
              <View style={styles.totalRow}>
                <View>
                  <Text style={styles.cardLabel}>ВСЕГО ЗА МЕСЯЦ</Text>
                  <Text style={styles.totalValue}>{total.toLocaleString('ru-RU')} ₽</Text>
                </View>
                <WalletIcon size={26} color={darkTheme.accent} />
              </View>

              {byCategory.length > 0 && (
                <View style={{ marginTop: 14, gap: 6 }}>
                  {byCategory.slice(0, 4).map((c) => (
                    <View key={c.category} style={styles.legendRow}>
                      <View style={[styles.legendDot, { backgroundColor: CATEGORY_COLORS[c.category] }]} />
                      <Text style={styles.legendText}>
                        {CATEGORY_LABELS[c.category]} · {c.pct}%
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {fuelStats && (
              <View style={[styles.card, styles.fuelCard]}>
                <View>
                  <Text style={styles.cardLabel}>ЗАПРАВЛЕНО ЗА МЕСЯЦ</Text>
                  <Text style={styles.fuelValue}>
                    {fuelStats.toFixed(0)} <Text style={styles.fuelUnit}>л</Text>
                  </Text>
                </View>
                <DropletIcon size={28} color={darkTheme.accent} />
              </View>
            )}
          </View>
        }
        renderItem={({ item: [day, items] }) => (
          <View>
            <Text style={styles.sectionTitle}>{day}</Text>
            <View style={{ gap: 8, marginBottom: 6 }}>
              {items.map((e) => (
                <TouchableOpacity key={e.id} style={styles.expenseRow} onLongPress={() => confirmDelete(e)} delayLongPress={400}>
                  <View style={[styles.iconWrap, { backgroundColor: darkTheme.background }]}>
                    <View style={[styles.categoryDot, { backgroundColor: CATEGORY_COLORS[e.category as ExpenseCategory] }]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.expenseTitle}>{CATEGORY_LABELS[e.category as ExpenseCategory]}</Text>
                    <Text style={styles.expenseMeta}>
                      {e.category === 'fuel' && e.fuelVolume ? `${e.fuelVolume} л` : e.notes || '—'}
                    </Text>
                  </View>
                  <Text style={styles.expenseAmount}>{e.amount.toLocaleString('ru-RU')} ₽</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <WalletIcon size={36} color={darkTheme.textDisabled} />
            <Text style={styles.emptyText}>Пока нет расходов за этот месяц</Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => rootNavigation?.navigate('AddExpense', { carId: activeCar.id })}
        accessibilityLabel="Добавить расход">
        <PlusIcon size={22} color={darkTheme.background} strokeWidth={2.5} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: darkTheme.background },
  header: { paddingTop: 22, paddingHorizontal: 20, paddingBottom: 4 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: darkTheme.textPrimary },
  content: { padding: 20, paddingTop: 14, paddingBottom: 100 },
  card: {
    backgroundColor: darkTheme.surface,
    borderWidth: 1,
    borderColor: darkTheme.border,
    borderRadius: 16,
    padding: 18,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardLabel: { fontSize: 12, fontWeight: '700', color: darkTheme.textSecondary, letterSpacing: 0.4 },
  totalValue: { fontSize: 26, fontWeight: '800', color: darkTheme.textPrimary, marginTop: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontSize: 12, color: darkTheme.textSecondary },
  fuelCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fuelValue: { fontSize: 20, fontWeight: '800', color: darkTheme.textPrimary, marginTop: 3 },
  fuelUnit: { fontSize: 13, color: darkTheme.textSecondary, fontWeight: '600' },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: darkTheme.textDisabled,
    letterSpacing: 0.4,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  expenseRow: {
    backgroundColor: darkTheme.surface,
    borderWidth: 1,
    borderColor: darkTheme.border,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  categoryDot: { width: 10, height: 10, borderRadius: 5 },
  expenseTitle: { fontSize: 14, fontWeight: '600', color: darkTheme.textPrimary },
  expenseMeta: { fontSize: 12, color: darkTheme.textSecondary, marginTop: 1 },
  expenseAmount: { fontSize: 14, fontWeight: '700', color: darkTheme.textPrimary },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: darkTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  emptyText: { fontSize: 14, color: darkTheme.textSecondary, textAlign: 'center' },
});
