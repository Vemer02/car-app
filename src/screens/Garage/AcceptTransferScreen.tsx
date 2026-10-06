import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { darkTheme } from '../../theme/tokens';
import { getCarTransferPreview, acceptCarTransfer, type TransferPreview } from '../../services/carTransfer';
import { syncNow } from '../../db/sync';
import { ApiError, isNetworkError } from '../../services/api';
import PrimaryButton from '../../components/PrimaryButton';
import { CarIcon } from '../../components/icons';
import type { RootStackParamList } from '../../navigation';

type Route = RouteProp<RootStackParamList, 'AcceptTransfer'>;
type Nav = NativeStackNavigationProp<RootStackParamList, 'AcceptTransfer'>;

const STATUS_MESSAGE: Record<string, string> = {
  accepted: 'Эта машина уже передана новому владельцу — повторно принять эту же ссылку нельзя.',
  cancelled: 'Прежний владелец отменил эту заявку. Попросите его создать новую.',
  expired: 'Срок действия ссылки истёк. Попросите прежнего владельца показать новый QR-код.',
};

export default function AcceptTransferScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { token } = params;

  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCarTransferPreview(token)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch(() => {
        if (!cancelled) setError('Ссылка не найдена. Проверьте, что она скопирована полностью.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleAccept() {
    if (accepting) return;
    setAccepting(true);
    try {
      await acceptCarTransfer(token);
      syncNow();
      navigation.navigate('MainTabs');
    } catch (err) {
      // Сервер отвечает понятными причинами ("уже в вашем гараже", "срок истёк" и т.д.) —
      // показываем их как есть; про интернет говорим только при настоящем обрыве связи.
      Alert.alert(
        'Не получилось',
        err instanceof ApiError
          ? err.message
          : isNetworkError(err)
            ? 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'
            : 'Что-то пошло не так. Попробуйте ещё раз.',
      );
    } finally {
      setAccepting(false);
    }
  }

  return (
    <View style={styles.screen}>
      {loading ? (
        <ActivityIndicator size="large" color={darkTheme.accent} />
      ) : error || !preview ? (
        <Text style={styles.error}>{error ?? 'Не удалось загрузить заявку'}</Text>
      ) : preview.status !== 'pending' ? (
        <>
          <Text style={styles.title}>Уже не актуально</Text>
          <Text style={styles.lead}>{STATUS_MESSAGE[preview.status]}</Text>
          <PrimaryButton title="Закрыть" variant="secondary" onPress={() => navigation.goBack()} style={{ marginTop: 20 }} />
        </>
      ) : (
        <>
          <View style={styles.iconWrap}>
            <CarIcon size={32} color={darkTheme.accent} />
          </View>
          <Text style={styles.title}>
            {preview.fromLabel} передаёт вам{'\n'}
            {preview.make} {preview.model}, {preview.year}
          </Text>
          <Text style={styles.lead}>
            Вся история обслуживания и расходов перейдёт вместе с машиной в ваш гараж.
          </Text>
          <PrimaryButton title="Принять" onPress={handleAccept} loading={accepting} style={{ marginTop: 24 }} />
          <PrimaryButton
            title="Не сейчас"
            variant="secondary"
            onPress={() => navigation.goBack()}
            disabled={accepting}
            style={{ marginTop: 10 }}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: darkTheme.background, alignItems: 'center', justifyContent: 'center', padding: 24 },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: darkTheme.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 19, fontWeight: '800', color: darkTheme.textPrimary, textAlign: 'center', lineHeight: 26 },
  lead: { fontSize: 13, color: darkTheme.textSecondary, textAlign: 'center', marginTop: 10, lineHeight: 19 },
  error: { color: darkTheme.danger, fontSize: 14, textAlign: 'center' },
});
