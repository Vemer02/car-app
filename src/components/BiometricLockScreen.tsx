import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { darkTheme } from '../theme/tokens';
import PrimaryButton from './PrimaryButton';

interface Props {
  onRetry: () => void;
  failed: boolean;
}

export default function BiometricLockScreen({ onRetry, failed }: Props) {
  return (
    <View style={styles.screen}>
      <View style={styles.logo}>
        <Text style={styles.logoGlyph}>🔒</Text>
      </View>
      <Text style={styles.title}>Приложение заблокировано</Text>
      <Text style={styles.subtitle}>
        {failed ? 'Не удалось подтвердить личность' : 'Подтвердите отпечатком или Face ID'}
      </Text>
      <PrimaryButton title="Разблокировать" onPress={onRetry} style={{ marginTop: 24, paddingHorizontal: 32 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: darkTheme.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: darkTheme.surface,
    borderWidth: 1,
    borderColor: darkTheme.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoGlyph: { fontSize: 28 },
  title: { fontSize: 19, fontWeight: '700', color: darkTheme.textPrimary },
  subtitle: { fontSize: 14, color: darkTheme.textSecondary, marginTop: 8, textAlign: 'center' },
});
