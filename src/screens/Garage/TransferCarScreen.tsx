import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Share } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import { darkTheme } from '../../theme/tokens';
import { carsCollection, fetchAllServiceRecords, fetchAllExpenses } from '../../db/queries';
import type Car from '../../db/models/Car';
import type { RootStackParamList } from '../../navigation';
import { createCarTransfer, cancelCarTransfer, type TransferSession } from '../../services/carTransfer';
import { ApiError, isNetworkError } from '../../services/api';
import { syncWithTimeout } from '../../db/sync';
import { formatRuDate } from '../../utils/date';
import { buildServiceRecordsCsv, buildExpensesCsv } from '../../utils/csvExport';
import PrimaryButton from '../../components/PrimaryButton';
import { SERVICE_TYPE_LABELS as TYPE_LABELS, EXPENSE_CATEGORY_LABELS as CATEGORY_LABELS } from '../../constants/labels';

type Route = RouteProp<RootStackParamList, 'TransferCar'>;

/** Человеческая причина + техническая строка — чтобы по скриншоту было видно, что именно сломалось. */
function describeError(err: unknown): { message: string; details: string } {
  if (isNetworkError(err)) {
    return { message: 'Нет связи с сервером. Проверьте интернет и повторите.', details: 'сеть: ' + String((err as Error).message) };
  }
  if (err instanceof ApiError) {
    const details = `${err.status} ${err.code}`;
    if (err.code === 'not_found') {
      return { message: 'Эта машина ещё не попала на сервер. Подождите минуту, пока она синхронизируется, и повторите.', details };
    }
    if (err.code === 'consent_required') {
      return { message: 'Нужно подтвердить согласие на обработку данных — зайдите в приложение заново.', details };
    }
    if (err.code === 'not_a_member') {
      return { message: 'Эта машина не из вашего гаража.', details };
    }
    return { message: `Сервер ответил ошибкой: ${err.message}`, details };
  }
  const e = err as Error;
  return { message: 'Не удалось начать передачу.', details: `${e?.name ?? 'Error'}: ${e?.message ?? String(err)}` };
}

export default function TransferCarScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<Route>();
  const { carId } = params;

  const [car, setCar] = useState<Car | null>(null);
  const [session, setSession] = useState<TransferSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; details: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const start = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const c = await carsCollection.find(carId);
      // Машина могла быть добавлена только что и ещё не дойти до сервера — а сервер
      // создаёт передачу только для той, что у него есть. Сначала досылаем изменения;
      // если связи нет — не страшно, всё равно пробуем: ошибка покажет настоящую причину.
      await syncWithTimeout(8000).catch(() => {});
      const s = await createCarTransfer(carId);
      if (!mounted.current) return;
      setCar(c);
      setSession(s);
    } catch (err) {
      if (mounted.current) setError(describeError(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [carId]);

  useEffect(() => {
    start();
  }, [start]);

  async function handleCancel() {
    if (!session || cancelling) return;
    setCancelling(true);
    try {
      await cancelCarTransfer(session.token);
      navigation.goBack();
    } catch {
      Alert.alert('Не получилось', 'Попробуйте ещё раз.');
    } finally {
      setCancelling(false);
    }
  }

  async function handleExportService() {
    if (!car) return;
    const all = await fetchAllServiceRecords(car.id);
    if (all.length === 0) {
      Alert.alert('Нечего сохранять', 'По этой машине пока нет записей о ТО.');
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
    await Share.share({ message: csv, title: `Архив ТО — ${car.make} ${car.model}` });
  }

  async function handleExportExpenses() {
    if (!car) return;
    const all = await fetchAllExpenses(car.id);
    if (all.length === 0) {
      Alert.alert('Нечего сохранять', 'По этой машине пока нет расходов.');
      return;
    }
    const csv = buildExpensesCsv(
      all.map((e) => ({
        dateLabel: formatRuDate(new Date(e.date)),
        categoryLabel: CATEGORY_LABELS[e.category] ?? e.category,
        notes: e.notes,
        amount: e.amount,
      })),
    );
    await Share.share({ message: csv, title: `Архив расходов — ${car.make} ${car.model}` });
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.headerAction}>Закрыть</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Передача машины</Text>
        <View style={{ width: 52 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color={darkTheme.accent} style={{ marginTop: 60 }} />
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.error}>{error.message}</Text>
            <Text style={styles.errorDetails}>{error.details}</Text>
            <PrimaryButton title="Повторить" onPress={start} style={{ marginTop: 20, alignSelf: 'stretch' }} />
          </View>
        ) : (
          car &&
          session && (
            <>
              <Text style={styles.carTitle}>
                {car.make} {car.model}, {car.year}
              </Text>
              <Text style={styles.lead}>
                Попросите нового владельца отсканировать этот код камерой телефона — после его
                подтверждения вся история ТО и расходов перейдёт к нему, а у вас эта машина исчезнет
                из гаража.
              </Text>

              <View style={styles.qrWrap}>
                <QRCode value={session.url} size={220} color={darkTheme.background} backgroundColor="#fff" />
              </View>

              <Text style={styles.sectionLabel}>НА ВСЯКИЙ СЛУЧАЙ — СОХРАНИТЬ СЕБЕ АРХИВ</Text>
              <Text style={styles.sectionHint}>
                После передачи история останется только у нового владельца. Если хотите сохранить
                копию на память — сделайте это сейчас.
              </Text>
              <PrimaryButton title="Сохранить архив ТО (CSV)" variant="secondary" onPress={handleExportService} />
              <PrimaryButton
                title="Сохранить архив расходов (CSV)"
                variant="secondary"
                onPress={handleExportExpenses}
                style={{ marginTop: 10 }}
              />

              <PrimaryButton
                title="Отменить передачу"
                variant="secondary"
                onPress={handleCancel}
                loading={cancelling}
                style={{ marginTop: 28 }}
              />
            </>
          )
        )}
      </ScrollView>
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
  content: { padding: 20, alignItems: 'center' },
  carTitle: { fontSize: 20, fontWeight: '800', color: darkTheme.textPrimary, marginTop: 8, textAlign: 'center' },
  lead: { fontSize: 13, color: darkTheme.textSecondary, textAlign: 'center', marginTop: 8, marginBottom: 24, lineHeight: 19 },
  qrWrap: { backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 28 },
  sectionLabel: { alignSelf: 'flex-start', fontSize: 12, fontWeight: '700', color: darkTheme.textSecondary, marginBottom: 6 },
  sectionHint: { alignSelf: 'flex-start', fontSize: 12, color: darkTheme.textSecondary, marginBottom: 12, lineHeight: 17 },
  errorBox: { marginTop: 60, alignItems: 'center', alignSelf: 'stretch' },
  error: { color: darkTheme.danger, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  errorDetails: { color: darkTheme.textDisabled, fontSize: 11, textAlign: 'center', marginTop: 10 },
});
