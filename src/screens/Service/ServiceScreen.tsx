import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { darkTheme } from '../../theme/tokens';
import { useActiveCar } from '../../context/ActiveCarContext';
import { observeRecentServiceRecords } from '../../db/queries';
import { syncNow, syncWithTimeout } from '../../db/sync';
import { database } from '../../db';
import type ServiceRecord from '../../db/models/ServiceRecord';
import { DropletIcon, PlusIcon, CarIcon } from '../../components/icons';
import type { MainTabParamList, RootStackParamList } from '../../navigation';

type TabNav = BottomTabNavigationProp<MainTabParamList, 'Service'>;
type RootNav = NativeStackNavigationProp<RootStackParamList>;

const TYPE_LABELS: Record<string, string> = {
  oil: 'Замена масла',
  filter: 'Замена фильтра',
  brakes: 'Тормоза',
  tires: 'Шины / шиномонтаж',
  alignment: 'Сход-развал',
  battery: 'Аккумулятор',
  inspection: 'Техосмотр',
  repair: 'Ремонт',
  other: 'Другое',
};

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
    const sub = observeRecentServiceRecords(activeCar.id, 100).subscribe(setRecords);
    return () => sub.unsubscribe();
  }, [activeCar?.id]);

  const sections = useMemo<Section[]>(() => {
    const groups = new Map<string, ServiceRecord[]>();
    for (const r of records) {
      const key = monthLabel(r.date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    return Array.from(groups.entries()).map(([title, data]) => ({ title, data }));
  }, [records]);

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
      </View>

      {sections.length === 0 ? (
        <View style={styles.emptyState}>
          <DropletIcon size={36} color={darkTheme.textDisabled} />
          <Text style={styles.emptyText}>Пока нет записей о ТО</Text>
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
                        <Text style={styles.recordTitle}>
                          {record.serviceName || TYPE_LABELS[record.type] || 'Обслуживание'}
                        </Text>
                        <Text style={styles.recordMeta}>
                          {record.date.toLocaleDateString('ru-RU')} · {record.mileage.toLocaleString('ru-RU')} км
                        </Text>
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
  header: { paddingTop: 22, paddingHorizontal: 20, paddingBottom: 4 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: darkTheme.textPrimary },
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
