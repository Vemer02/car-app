import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert, Share } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { darkTheme } from '../../theme/tokens';
import { useActiveCar } from '../../context/ActiveCarContext';
import {
  observeExpensesBetween,
  observeAllExpenses,
  fetchAllExpenses,
  observeServiceRecordsBetween,
  observeAllServiceRecords,
} from '../../db/queries';
import { syncNow, syncWithTimeout } from '../../db/sync';
import { database } from '../../db';
import type Expense from '../../db/models/Expense';
import type ServiceRecord from '../../db/models/ServiceRecord';
import { WalletIcon, DropletIcon, PlusIcon, CarIcon, ShareIcon } from '../../components/icons';
import { matchesQuery, expenseSearchText } from '../../utils/search';
import SearchBar from '../../components/SearchBar';
import { formatRuDate } from '../../utils/date';
import { computeFuelEconomy, averageFuelEconomy } from '../../utils/fuelEconomy';
import { buildExpensesCsv } from '../../utils/csvExport';
import type { MainTabParamList, RootStackParamList } from '../../navigation';
import type { ExpenseCategory } from '../../types/models';
import { EXPENSE_CATEGORY_LABELS as CATEGORY_LABELS, SERVICE_TYPE_LABELS } from '../../constants/labels';
import {
  SERVICE_CATEGORY,
  expenseItem,
  serviceItem,
  mergeSpending,
  sumSpending,
  groupByCategory,
  type SpendingItem,
} from '../../utils/spending';

type TabNav = BottomTabNavigationProp<MainTabParamList, 'Expenses'>;
type RootNav = NativeStackNavigationProp<RootStackParamList>;

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

const SERVICE_COLOR = '#F59E0B';
const categoryLabel = (c: string) => (c === SERVICE_CATEGORY ? 'Обслуживание' : CATEGORY_LABELS[c as ExpenseCategory] ?? c);
const categoryColor = (c: string) => (c === SERVICE_CATEGORY ? SERVICE_COLOR : CATEGORY_COLORS[c as ExpenseCategory] ?? darkTheme.textDisabled);

type Item = SpendingItem<Expense | ServiceRecord>;

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
  const [searchQuery, setSearchQuery] = useState('');
  const isSearching = searchQuery.trim().length > 0;
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    if (!activeCar || exporting) return;
    setExporting(true);
    try {
      const all = await fetchAllExpenses(activeCar.id);
      if (all.length === 0) {
        Alert.alert('Нечего экспортировать', 'Пока нет ни одного расхода для этой машины.');
        return;
      }
      const csv = buildExpensesCsv(
        all.map((e) => ({
          dateLabel: formatRuDate(new Date(e.date)),
          categoryLabel: CATEGORY_LABELS[e.category as ExpenseCategory] ?? e.category,
          notes: e.notes,
          amount: e.amount,
        })),
      );
      await Share.share({ message: csv, title: `История расходов — ${activeCar.make} ${activeCar.model}` });
    } catch {
      Alert.alert('Не получилось', 'Не удалось подготовить файл для отправки. Попробуйте ещё раз.');
    } finally {
      setExporting(false);
    }
  }

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
    // Во время поиска — вся история, не только текущий месяц (иначе «поиск по истории»
    // не нашёл бы ничего за прошлые месяцы). Переключается только на границе
    // "ищем / не ищем", не на каждую букву.
    const query = isSearching
      ? observeAllExpenses(activeCar.id)
      : observeExpensesBetween(activeCar.id, startOfMonth(new Date()), startOfNextMonth(new Date()));
    const sub = query.subscribe(setExpenses);
    return () => sub.unsubscribe();
  }, [activeCar?.id, isSearching]);

  // Обслуживание — тоже трата: подмешиваем записи ТО со стоимостью (подробнее — utils/spending.ts).
  const [services, setServices] = useState<ServiceRecord[]>([]);
  useEffect(() => {
    if (!activeCar) {
      setServices([]);
      return;
    }
    const query = isSearching
      ? observeAllServiceRecords(activeCar.id)
      : observeServiceRecordsBetween(activeCar.id, startOfMonth(new Date()), startOfNextMonth(new Date()));
    const sub = query.subscribe(setServices);
    return () => sub.unsubscribe();
  }, [activeCar?.id, isSearching]);

  const allItems = useMemo<Item[]>(
    () =>
      mergeSpending<Expense | ServiceRecord>([
        ...expenses.map((e) => expenseItem(e, e as Expense | ServiceRecord)),
        ...services.map((r) => serviceItem(r, r as Expense | ServiceRecord)),
      ]),
    [expenses, services],
  );

  const itemTitle = (i: Item) =>
    i.kind === 'service'
      ? `Обслуживание · ${SERVICE_TYPE_LABELS[(i.ref as ServiceRecord).type] ?? 'работы'}`
      : categoryLabel(i.category);

  const itemNote = (i: Item) => {
    if (i.kind === 'service') {
      const r = i.ref as ServiceRecord;
      return r.description || r.serviceName || '—';
    }
    const e = i.ref as Expense;
    return e.category === 'fuel' && e.fuelVolume ? `${e.fuelVolume} л` : e.notes || '—';
  };

  const filteredItems = useMemo(() => {
    if (!isSearching) return allItems;
    return allItems.filter((i) =>
      matchesQuery(
        expenseSearchText({
          notes: i.kind === 'service' ? `${(i.ref as ServiceRecord).description ?? ''} ${(i.ref as ServiceRecord).serviceName ?? ''}` : (i.ref as Expense).notes,
          categoryLabel: itemTitle(i),
          amount: i.amount,
        }),
        searchQuery,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems, isSearching, searchQuery]);

  const total = useMemo(() => sumSpending(allItems), [allItems]);
  const serviceTotal = useMemo(() => sumSpending(allItems.filter((i) => i.kind === 'service')), [allItems]);
  const byCategory = useMemo(() => groupByCategory(allItems), [allItems]);

  const fuelStats = useMemo(() => {
    const fuelExpenses = expenses.filter((e) => e.category === 'fuel' && e.fuelVolume);
    const totalVolume = fuelExpenses.reduce((s, e) => s + (e.fuelVolume ?? 0), 0);
    return totalVolume > 0 ? totalVolume : null;
  }, [expenses]);

  // Отдельно от остального экрана: расход топлива считается по заправкам за ВСЮ историю,
  // не только за текущий месяц — иначе первая заправка месяца всегда осталась бы без
  // пары, с которой сравнивать расстояние.
  const [allFuelExpenses, setAllFuelExpenses] = useState<Expense[]>([]);
  useEffect(() => {
    if (!activeCar) {
      setAllFuelExpenses([]);
      return;
    }
    const sub = observeAllExpenses(activeCar.id).subscribe((all) => {
      setAllFuelExpenses(all.filter((e) => e.category === 'fuel'));
    });
    return () => sub.unsubscribe();
  }, [activeCar?.id]);

  const fuelEconomy = useMemo(() => {
    const segments = computeFuelEconomy(
      allFuelExpenses.map((e) => ({ date: e.date, mileage: e.mileage, fuelVolume: e.fuelVolume })),
    );
    return { average: averageFuelEconomy(segments), segmentCount: segments.length };
  }, [allFuelExpenses]);

  const sections = useMemo(() => {
    const groups = new Map<string, Item[]>();
    for (const i of filteredItems) {
      const key = dayLabel(i.date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(i);
    }
    return Array.from(groups.entries());
  }, [filteredItems]);

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
        <TouchableOpacity onPress={handleExport} disabled={exporting} accessibilityLabel="Экспортировать историю расходов">
          <ShareIcon size={20} color={exporting ? darkTheme.textDisabled : darkTheme.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <SearchBar value={searchQuery} onChangeText={setSearchQuery} placeholder="Поиск по заметке, категории, сумме" />
      </View>

      <FlatList
        data={sections}
        keyExtractor={([day]) => day}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={darkTheme.accent} colors={[darkTheme.accent]} />
        }
        ListHeaderComponent={
          isSearching ? null : (
          <View style={{ gap: 14, marginBottom: 14 }}>
            <View style={styles.card}>
              <View style={styles.totalRow}>
                <View>
                  <Text style={styles.cardLabel}>ВСЕГО ЗА МЕСЯЦ</Text>
                  <Text style={styles.totalValue}>{total.toLocaleString('ru-RU')} ₽</Text>
                  {serviceTotal > 0 && (
                    <Text style={styles.totalHint}>в том числе обслуживание {serviceTotal.toLocaleString('ru-RU')} ₽</Text>
                  )}
                </View>
                <WalletIcon size={26} color={darkTheme.accent} />
              </View>

              {byCategory.length > 0 && (
                <View style={{ marginTop: 14, gap: 6 }}>
                  {byCategory.slice(0, 4).map((c) => (
                    <View key={c.category} style={styles.legendRow}>
                      <View style={[styles.legendDot, { backgroundColor: categoryColor(c.category) }]} />
                      <Text style={styles.legendText}>
                        {categoryLabel(c.category)} · {c.pct}%
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

            {fuelEconomy.average != null && (
              <View style={[styles.card, styles.fuelCard]}>
                <View>
                  <Text style={styles.cardLabel}>СРЕДНИЙ РАСХОД</Text>
                  <Text style={styles.fuelValue}>
                    {fuelEconomy.average.toFixed(1)} <Text style={styles.fuelUnit}>л/100км</Text>
                  </Text>
                  <Text style={styles.fuelHint}>
                    по {fuelEconomy.segmentCount} {fuelEconomy.segmentCount === 1 ? 'промежутку' : 'промежуткам'} между заправками
                  </Text>
                </View>
                <DropletIcon size={28} color={darkTheme.accent} />
              </View>
            )}
          </View>
          )
        }
        renderItem={({ item: [day, items] }) => (
          <View>
            <Text style={styles.sectionTitle}>{day}</Text>
            <View style={{ gap: 8, marginBottom: 6 }}>
              {items.map((i) => (
                <TouchableOpacity
                  key={i.key}
                  style={styles.expenseRow}
                  onLongPress={() =>
                    i.kind === 'expense'
                      ? confirmDelete(i.ref as Expense)
                      : Alert.alert(
                          'Это запись об обслуживании',
                          'Она учитывается здесь как трата, но хранится в разделе «Сервис» — удалить её можно там (долгое нажатие на запись).',
                        )
                  }
                  delayLongPress={400}>
                  <View style={[styles.iconWrap, { backgroundColor: darkTheme.background }]}>
                    <View style={[styles.categoryDot, { backgroundColor: categoryColor(i.category) }]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.expenseTitle}>{itemTitle(i)}</Text>
                    <Text style={styles.expenseMeta} numberOfLines={2}>
                      {itemNote(i)}
                    </Text>
                  </View>
                  <Text style={styles.expenseAmount}>{i.amount.toLocaleString('ru-RU')} ₽</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <WalletIcon size={36} color={darkTheme.textDisabled} />
            <Text style={styles.emptyText}>{isSearching ? 'Ничего не нашлось' : 'Пока нет расходов за этот месяц'}</Text>
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
  header: {
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: darkTheme.textPrimary },
  searchWrap: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 4 },
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
  totalHint: { fontSize: 12, color: darkTheme.textSecondary, marginTop: 4 },
  totalValue: { fontSize: 26, fontWeight: '800', color: darkTheme.textPrimary, marginTop: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontSize: 12, color: darkTheme.textSecondary },
  fuelCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fuelValue: { fontSize: 20, fontWeight: '800', color: darkTheme.textPrimary, marginTop: 3 },
  fuelUnit: { fontSize: 13, color: darkTheme.textSecondary, fontWeight: '600' },
  fuelHint: { fontSize: 11, color: darkTheme.textSecondary, marginTop: 4 },
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
