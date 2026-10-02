import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { darkTheme } from '../theme/tokens';
import PrimaryButton from './PrimaryButton';
import type { YandexLoginSession } from '../services/yandexAuth';

interface Props {
  session: YandexLoginSession | null;
  exchanging: boolean;
  error: string | null;
  onNavigate: (url: string) => void;
  onCancel: () => void;
  onRetry: () => void;
}

/**
 * Окно входа Яндекса — встроенный браузер (WebView), не внешнее приложение: у OAuth
 * Яндекса нет готового SDK для React Native, а значит и готового способа вернуться
 * из системного браузера обратно в приложение без лишней настройки диплинков.
 * onNavigate вызывается на КАЖДЫЙ переход — решение, наш ли это редирект, принимает
 * вызывающий код (useYandexLogin), а не сам компонент.
 */
export default function YandexLoginModal({ session, exchanging, error, onNavigate, onCancel, onRetry }: Props) {
  const visible = !!session || !!error || exchanging;

  function handleNavigationStateChange(navState: WebViewNavigation) {
    onNavigate(navState.url);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>Вход через Яндекс</Text>
          <TouchableOpacity onPress={onCancel} accessibilityRole="button" hitSlop={12}>
            <Text style={styles.close}>Закрыть</Text>
          </TouchableOpacity>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Не получилось</Text>
            <Text style={styles.errorText}>{error}</Text>
            <PrimaryButton title="Попробовать снова" onPress={onRetry} style={{ marginTop: 16 }} />
          </View>
        ) : exchanging ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={darkTheme.accent} />
          </View>
        ) : session ? (
          <WebView
            source={{ uri: session.authorizeUrl }}
            onNavigationStateChange={handleNavigationStateChange}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loading}>
                <ActivityIndicator size="large" color={darkTheme.accent} />
              </View>
            )}
          />
        ) : null}
      </View>
    </Modal>
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
  title: { fontSize: 16, fontWeight: '700', color: darkTheme.textPrimary },
  close: { fontSize: 15, color: darkTheme.accent, fontWeight: '700' },
  loading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: darkTheme.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorTitle: { fontSize: 16, fontWeight: '700', color: darkTheme.textPrimary, marginBottom: 8 },
  errorText: { fontSize: 14, color: darkTheme.textSecondary, textAlign: 'center', lineHeight: 20 },
});
