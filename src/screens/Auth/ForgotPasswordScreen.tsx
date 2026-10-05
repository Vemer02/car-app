import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { requestPasswordReset } from '../../services/auth';
import { darkTheme } from '../../theme/tokens';
import FormField from '../../components/FormField';
import PrimaryButton from '../../components/PrimaryButton';
import type { AuthStackParamList } from '../../navigation';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>;

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function ForgotPasswordScreen() {
  const navigation = useNavigation<Nav>();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    if (!isValidEmail(email)) {
      setError('Введите корректный email');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      // Намеренно один и тот же результат независимо от того, существует ли такой
      // email, — иначе экран сам подсказывал бы, какие адреса зарегистрированы.
      setSent(true);
    } catch {
      setError('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <View style={styles.flex}>
        <View style={styles.content}>
          <Text style={styles.glyph}>📬</Text>
          <Text style={[styles.title, styles.centered]}>Проверьте почту</Text>
          <Text style={[styles.subtitle, styles.centered]}>
            Если такой email зарегистрирован, на него отправлено письмо со ссылкой для смены пароля.
            Откройте его на любом устройстве — из письма достаточно перейти по ссылке и задать новый пароль.
          </Text>
          <PrimaryButton title="Назад ко входу" onPress={() => navigation.goBack()} style={{ marginTop: 24 }} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => navigation.goBack()}
          style={styles.backButton}>
          <Text style={styles.backGlyph}>←</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Восстановление пароля</Text>
        <Text style={styles.subtitle}>Пришлём ссылку для смены пароля на вашу почту</Text>

        <View style={styles.form}>
          <FormField
            label="Email"
            placeholder="you@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (error) setError(null);
            }}
            error={error ?? undefined}
          />
          <PrimaryButton title="Отправить ссылку" onPress={handleSubmit} loading={loading} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: darkTheme.background },
  content: { flex: 1, padding: 24, paddingTop: 48 },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: darkTheme.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  backGlyph: { color: darkTheme.textPrimary, fontSize: 18, fontWeight: '700' },
  glyph: { fontSize: 40, textAlign: 'center', marginBottom: 16, marginTop: 80 },
  title: { fontSize: 24, fontWeight: '800', color: darkTheme.textPrimary, letterSpacing: -0.3 },
  subtitle: { fontSize: 14, color: darkTheme.textSecondary, marginTop: 8, lineHeight: 20 },
  centered: { textAlign: 'center' },
  form: { marginTop: 28, gap: 4 },
});
