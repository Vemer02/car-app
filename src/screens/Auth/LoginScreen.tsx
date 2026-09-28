import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import auth from '@react-native-firebase/auth';
import { signIn } from '../../services/firebase';
import { signInWithGoogle } from '../../services/googleAuth';
import { useTelegramLogin } from '../../hooks/useTelegramLogin';
import { darkTheme } from '../../theme/tokens';
import FormField from '../../components/FormField';
import PrimaryButton from '../../components/PrimaryButton';
import TelegramWaitingModal from '../../components/TelegramWaitingModal';
import { GoogleIcon, TelegramIcon } from '../../components/icons';
import type { AuthStackParamList } from '../../navigation';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// Сообщения Firebase Auth по-русски — коды ошибок стабильны между версиями SDK
function mapAuthError(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'Некорректный email';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Неверный email или пароль';
    case 'auth/user-disabled':
      return 'Аккаунт заблокирован';
    case 'auth/too-many-requests':
      return 'Слишком много попыток. Попробуйте позже';
    case 'auth/network-request-failed':
      return 'Нет соединения с интернетом';
    default:
      return 'Не удалось войти. Попробуйте ещё раз';
  }
}

export default function LoginScreen() {
  const navigation = useNavigation<Nav>();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const telegramLogin = useTelegramLogin();

  async function handleGoogleSignIn() {
    setFormError(null);
    setGoogleLoading(true);
    try {
      const outcome = await signInWithGoogle();
      if (outcome.status === 'error') setFormError(outcome.message);
      // 'success' — дальше навигацией управляет App.tsx через onAuthStateChanged.
      // 'cancelled' — пользователь сам закрыл диалог, ничего не показываем.
    } finally {
      setGoogleLoading(false);
    }
  }

  function validate(): boolean {
    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) errors.email = 'Введите email';
    else if (!isValidEmail(email)) errors.email = 'Некорректный email';
    if (!password) errors.password = 'Введите пароль';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleLogin() {
    setFormError(null);
    setResetSent(false);
    if (!validate()) return;

    setLoading(true);
    try {
      await signIn(email.trim(), password);
      // Дальше навигацией управляет App.tsx через onAuthStateChanged — сюда возврат не нужен.
    } catch (err: any) {
      setFormError(mapAuthError(err?.code ?? ''));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setFormError(null);
    setResetSent(false);
    if (!email.trim() || !isValidEmail(email)) {
      setFieldErrors((e) => ({ ...e, email: 'Введите email, чтобы восстановить пароль' }));
      return;
    }
    try {
      await auth().sendPasswordResetEmail(email.trim());
      setResetSent(true);
    } catch (err: any) {
      setFormError(mapAuthError(err?.code ?? ''));
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}>
          <Text style={styles.logoGlyph}>🚗</Text>
        </View>

        <Text style={styles.title}>С возвращением</Text>
        <Text style={styles.subtitle}>
          Войдите, чтобы синхронизировать гараж на этом устройстве
        </Text>

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
              if (fieldErrors.email) setFieldErrors((e) => ({ ...e, email: undefined }));
            }}
            error={fieldErrors.email}
          />

          <View style={{ marginBottom: 16 }}>
            <View style={styles.passwordRow}>
              <Text style={styles.label}>Пароль</Text>
              <TouchableOpacity onPress={handleForgotPassword} accessibilityRole="button">
                <Text style={styles.link}>Забыли?</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              placeholder="••••••••"
              placeholderTextColor={darkTheme.textDisabled}
              secureTextEntry
              textContentType="password"
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (fieldErrors.password) setFieldErrors((e) => ({ ...e, password: undefined }));
              }}
              style={[styles.input, fieldErrors.password ? styles.inputError : null]}
            />
            {fieldErrors.password ? <Text style={styles.fieldError}>{fieldErrors.password}</Text> : null}
            {resetSent ? (
              <Text style={styles.resetSent}>Письмо для сброса пароля отправлено на почту</Text>
            ) : null}
          </View>

          {formError ? <Text style={styles.formError}>{formError}</Text> : null}

          <PrimaryButton title="Войти" onPress={handleLogin} loading={loading} />
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>или</Text>
          <View style={styles.dividerLine} />
        </View>

        <PrimaryButton
          title="Продолжить с Google"
          variant="secondary"
          onPress={handleGoogleSignIn}
          loading={googleLoading}
          icon={<GoogleIcon size={18} />}
        />

        <PrimaryButton
          title="Войти через Telegram"
          variant="secondary"
          onPress={telegramLogin.start}
          icon={<TelegramIcon size={18} />}
          style={{ marginTop: 10 }}
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>Нет аккаунта? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={styles.link}>Зарегистрироваться</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <TelegramWaitingModal
        visible={telegramLogin.visible}
        error={telegramLogin.error}
        onCancel={telegramLogin.cancel}
        onRetry={telegramLogin.start}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: darkTheme.background },
  container: { flexGrow: 1, padding: 24, paddingTop: 64 },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: darkTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  logoGlyph: { fontSize: 26 },
  title: { fontSize: 26, fontWeight: '800', color: darkTheme.textPrimary, letterSpacing: -0.3 },
  subtitle: { fontSize: 14, color: darkTheme.textSecondary, marginTop: 6, lineHeight: 20 },
  form: { marginTop: 32 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24, marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: darkTheme.border },
  dividerText: { fontSize: 12, color: darkTheme.textDisabled },
  label: { fontSize: 13, fontWeight: '600', color: darkTheme.textSecondary },
  passwordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  link: { fontSize: 13, fontWeight: '700', color: darkTheme.accent },
  input: {
    height: 50,
    borderRadius: 12,
    backgroundColor: darkTheme.surface,
    borderWidth: 1,
    borderColor: darkTheme.border,
    color: darkTheme.textPrimary,
    fontSize: 15,
    paddingHorizontal: 14,
  },
  inputError: { borderColor: darkTheme.danger },
  fieldError: { fontSize: 13, color: darkTheme.danger, marginTop: 6 },
  resetSent: { fontSize: 13, color: darkTheme.accentSecondary, marginTop: 6 },
  formError: { fontSize: 13, color: darkTheme.danger, marginBottom: 8 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 'auto', paddingTop: 32 },
  footerText: { fontSize: 14, color: darkTheme.textSecondary },
});
