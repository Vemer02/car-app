import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert, Share, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { darkTheme } from '../../theme/tokens';
import { useActiveCar } from '../../context/ActiveCarContext';
import { observeRecentServiceRecords, observeAllServiceRecords, fetchAllServiceRecords } from '../../db/queries';
import { syncNow, syncWithTimeout } from '../../db/sync';
import { database } from '../../db';
import type ServiceRecord from '../../db/models/ServiceRecord';
import { DropletIcon, PlusIcon, CarIcon, SearchIcon, ShareIcon } from '../../components/icons';
import { matchesQuery, serviceRecordSearchText } from '../../utils/search';
import SearchBar from '../../components/SearchBar';
import { formatRuDate } from '../../utils/date';
import { buildServiceRecordsCsv } from '../../utils/csvExport';
import type { MainTabParamList, RootStackParamList } from '../../navigation';
import { SERVICE_TYPE_LABELS as TYPE_LABELS } from '../../constants/labels';

type TabNav = BottomTabNavigationProp<MainTabParamList, 'Service'>;
type RootNav = NativeStackNavigationProp<RootStackParamList>;

const TYPE_ICON_BG: Record<string, string> = {
  oil: '#2a2408',
  brakes: '#2a1414',
  alignment: '#0d2620',
  filter: '#2a2408',
};
const TYPE_ICON_COLOR: Record<string, string> = {
  oil: darkTheme.warning,
  brakes: darkTheme.danger,
  alignment: darkTheme.accentSecondary,
  filter: darkTheme.warning,
};

function monthLabel(date: Date): string {
  const label = date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

interface Section {
  title: string;
  data: ServiceRecord[];
}

export default function ServiceScreen() {
  const tabNavigation = useNavigation<TabNav>();
  const rootNavigation = tabNavigation.getParent<RootNav>();
  const { activeCar } = useActiveCar();

  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Фильтр по типу работ — часть поиска: пока он включён, смотрим всю историю, а не
  // только последние 100 записей (иначе фильтр молча скрывал бы старые записи нужного типа).
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const isSearching = searchQuery.trim().length > 0 || typeFilter != null;
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    if (!activeCar || exporting) return;
    setExporting(true);
    try {
      const all = await fetchAllServiceRecords(activeCar.id);
      if (all.length === 0) {
        Alert.alert('Нечего экспортировать', 'Пока нет ни одной записи о ТО для этой машины.');
        return;
      }
      const csv = buildServiceRecordsCsv(
        all.map((r) => ({
          dateLabel: formatRuDate(new Date(r.date)),
          typeLabel: TYPE_LABELS[r.type] ?? r.type,
          description: r.description,
          serviceName: r.serviceName,
          mileage: r.mileage,
          laborCost: r.laborCost,
          partsCost: r.partsCost,
          cost: r.cost,
        })),
      );
      await Share.share({ message: csv, title: `История ТО — ${activeCar.make} ${activeCar.model}` });
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

  function confirmDelete(record: ServiceRecord) {
    Alert.alert('Удалить запись о ТО?', 'Это действие нельзя отменить.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await database.write(async () => {
            await record.markAsDeleted();
          });
          syncNow();
        },
      },
    ]);
  }

  useEffect(() => {
    if (!activeCar) {
      setRecords([]);
      return;
    }
    const query = isSearching
      ? observeAllServiceRecords(activeCar.id)
      : observeRecentServiceRecords(activeCar.id, 100);
    const sub = query.subscribe(setRecords);
    return () => sub.unsubscribe();
  }, [activeCar?.id, isSearching]);

  // Новая машина — другой набор типов работ, прежний фильтр потерял бы смысл.
  useEffect(() => {
    setTypeFilter(null);
  }, [activeCar?.id]);

  // Типы, которые реально есть в записях — чипы фильтра показываем только для них.
  const presentTypes = useMemo(() => {
    const present = new Set(records.map((r) => r.type));
    return Object.keys(TYPE_LABELS).filter((t) => present.has(t));
  }, [records]);

  const filteredRecords = useMemo(() => {
    if (!isSearching) return records;
    return records.filter(
      (r) =>
        (typeFilter == null || r.type === typeFilter) &&
        matchesQuery(
          serviceRecordSearchText({
            serviceName: r.serviceName,
            description: r.description,
            typeLabel: TYPE_LABELS[r.type] ?? r.type,
            mileage: r.mileage,
            cost: r.cost,
            laborCost: r.laborCost,
            partsCost: r.partsCost,
          }),
          searchQuery,
        ),
    );
  }, [records, isSearching, searchQuery, typeFilter]);

  const sections = useMemo<Section[]>(() => {
    const groups = new Map<string, ServiceRecord[]>();
    for (const r of filteredRecords) {
      const key = monthLabel(r.date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    return Array.from(groups.entries()).map(([title, data]) => ({ title, data }));
  }, [filteredRecords]);

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
        <Text style={styles.headerTitle}>Обслуживание</Text>
        <TouchableOpacity onPress={handleExport} disabled={exporting} accessibilityLabel="Экспортировать историю ТО">
          <ShareIcon size={20} color={exporting ? darkTheme.textDisabled : darkTheme.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <SearchBar value={searchQuery} onChangeText={setSearchQuery} placeholder="Поиск по работам, сумме, пробегу" />
      </View>

      {(presentTypes.length > 1 || typeFilter != null) && (
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
            keyboardShouldPersistTaps="handled">
            {[null, ...presentTypes].map((t) => (
              <TouchableOpacity
                key={t ?? 'all'}
                onPress={() => setTypeFilter(t)}
                style={[styles.filterChip, typeFilter === t && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, typeFilter === t && styles.filterChipTextActive]}>
                  {t == null ? 'Все' : TYPE_LABELS[t]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {sections.length === 0 ? (
        <View style={styles.emptyState}>
          <DropletIcon size={36} color={darkTheme.textDisabled} />
          <Text style={styles.emptyText}>
            {isSearching ? 'Ничего не нашлось' : 'Пока нет записей о ТО'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(s) => s.title}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={darkTheme.accent} colors={[darkTheme.accent]} />
          }
          renderItem={({ item }) => (
            <View>
              <Text style={styles.sectionTitle}>{item.title}</Text>
              <View style={{ gap: 10, marginBottom: 6 }}>
                {item.data.map((record) => (
                  <TouchableOpacity key={record.id} style={styles.card} onLongPress={() => confirmDelete(record)} delayLongPress={400}>
                    <View style={styles.cardRow}>
                      <View
                        style={[
                          styles.iconWrap,
                          { backgroundColor: TYPE_ICON_BG[record.type] ?? darkTheme.surfaceElevated },
                        ]}>
                        <DropletIcon size={16} color={TYPE_ICON_COLOR[record.type] ?? darkTheme.textSecondary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recordTitle}>{TYPE_LABELS[record.type] || 'Обслуживание'}</Text>
                        {record.description ? (
                          <Text style={styles.recordDescription} numberOfLines={3}>
                            {record.description}
                          </Text>
                        ) : null}
                        <Text style={styles.recordMeta}>
                          {record.date.toLocaleDateString('ru-RU')} · {record.mileage.toLocaleString('ru-RU')} км
                          {record.serviceName ? ` · ${record.serviceName}` : ''}
                        </Text>
                        {record.laborCost != null || record.partsCost != null ? (
                          <Text style={styles.recordBreakdown}>
                            Работы {(record.laborCost ?? 0).toLocaleString('ru-RU')} ₽ · Запчасти{' '}
                            {(record.partsCost ?? 0).toLocaleString('ru-RU')} ₽
                          </Text>
                        ) : null}
                      </View>
                      <Text style={styles.recordCost}>{record.cost.toLocaleString('ru-RU')} ₽</Text>
                    </View>
                    <View style={styles.tagsRow}>
                      <Text style={styles.tag}>{record.source === 'obd2' ? 'OBD2' : 'вручную'}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => rootNavigation?.navigate('AddServiceRecord', { carId: activeCar.id })}
        accessibilityLabel="Добавить запись">
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
  filterRow: { paddingHorizontal: 20, paddingVertical: 8, gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: darkTheme.surface,
    borderWidth: 1,
    borderColor: darkTheme.border,
  },
  filterChipActive: { backgroundColor: darkTheme.accent, borderColor: darkTheme.accent },
  filterChipText: { fontSize: 13, fontWeight: '600', color: darkTheme.textSecondary },
  filterChipTextActive: { color: darkTheme.background },
  recordDescription: { fontSize: 13, color: darkTheme.textPrimary, marginTop: 3, lineHeight: 18 },
  recordBreakdown: { fontSize: 12, color: darkTheme.textSecondary, marginTop: 3 },
  content: { padding: 20, paddingTop: 14, paddingBottom: 100, gap: 14 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: darkTheme.textDisabled,
    letterSpacing: 0.4,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: darkTheme.surface,
    borderWidth: 1,
    borderColor: darkTheme.border,
    borderRadius: 14,
    padding: 14,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  recordTitle: { fontSize: 14, fontWeight: '600', color: darkTheme.textPrimary },
  recordMeta: { fontSize: 12, color: darkTheme.textSecondary, marginTop: 2 },
  recordCost: { fontSize: 14, fontWeight: '700', color: darkTheme.textPrimary },
  tagsRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  tag: {
    fontSize: 11,
    fontWeight: '600',
    color: darkTheme.textSecondary,
    backgroundColor: darkTheme.background,
    borderWidth: 1,
    borderColor: darkTheme.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
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
