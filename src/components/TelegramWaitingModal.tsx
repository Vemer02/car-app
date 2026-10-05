import React from 'react';
import { View, Text, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { darkTheme } from '../theme/tokens';
import PrimaryButton from './PrimaryButton';

interface Props {
  visible: boolean;
  error: string | null;
  onCancel: () => void;
  onRetry: () => void;
  /** По умолчанию — текст для входа; экран привязки Telegram передаёт свой. */
  waitingTitle?: string;
  waitingSubtitle?: string;
}

export default function TelegramWaitingModal({
  visible,
  error,
  onCancel,
  onRetry,
  waitingTitle = 'Ждём подтверждения в Telegram',
  waitingSubtitle = 'Мы открыли бота — нажмите «Start», затем подтвердите кнопкой в чате. Вход завершится автоматически в течение нескольких секунд.',
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {error ? (
            <>
              <Text style={styles.title}>Не получилось</Text>
              <Text style={styles.subtitle}>{error}</Text>
              <View style={styles.buttonsRow}>
                <PrimaryButton title="Закрыть" variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
                <PrimaryButton title="Повторить" onPress={onRetry} style={{ flex: 1 }} />
              </View>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color={darkTheme.accent} />
              <Text style={styles.title}>{waitingTitle}</Text>
              <Text style={styles.subtitle}>{waitingSubtitle}</Text>
              <PrimaryButton title="Отмена" variant="secondary" onPress={onCancel} style={{ marginTop: 8 }} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: {
    backgroundColor: darkTheme.surfaceElevated,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    alignItems: 'center',
    gap: 12,
  },
  title: { fontSize: 16, fontWeight: '700', color: darkTheme.textPrimary, textAlign: 'center', marginTop: 4 },
  subtitle: { fontSize: 13, color: darkTheme.textSecondary, textAlign: 'center', lineHeight: 19 },
  buttonsRow: { flexDirection: 'row', gap: 10, marginTop: 8, width: '100%' },
});
