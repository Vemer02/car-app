import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { signUp, setPendingConsent } from '../../services/firebase';
import { signInWithGoogle } from '../../services/googleAuth';
import { useTelegramLogin } from '../../hooks/useTelegramLogin';
import { darkTheme } from '../../theme/tokens';
import FormField from '../../components/FormField';
import PrimaryButton from '../../components/PrimaryButton';
import ConsentCheckbox from '../../components/ConsentCheckbox';
import TelegramWaitingModal from '../../components/TelegramWaitingModal';
import { GoogleIcon, TelegramIcon } from '../../components/icons';
import type { AuthStackParamList } from '../../navigation';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Register'>;

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function mapAuthError(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Этот email уже зарегистрирован';
    case 'auth/invalid-email':
      return 'Некорректный email';
    case 'auth/weak-password':
      return 'Пароль слишком простой';
    case 'auth/network-request-failed':
      return 'Нет соединения с интернетом';
    default:
      return 'Не удалось создать аккаунт. Попробуйте ещё раз';
  }
}

export default function RegisterScreen() {
  const navigation = useNavigation<Nav>();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
    password2?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const telegramLogin = useTelegramLogin();

  function handleTelegramSignIn() {
    setFormError(null);
    if (!requireConsent()) return;
    setPendingConsent('registration');
    telegramLogin.start().catch(() => setPendingConsent(null));
  }

  function requireConsent(): boolean {
    if (consentChecked) return true;
    setConsentError('Отметьте согласие, чтобы продолжить');
    return false;
  }

  async function handleGoogleSignIn() {
    setFormError(null);
    if (!requireConsent()) return;
    setGoogleLoading(true);
    setPendingConsent('registration');
    try {
      const outcome = await signInWithGoogle();
      if (outcome.status === 'error') {
        setPendingConsent(null);
        setFormError(outcome.message);
      }
      // На успехе pendingConsent считает services/firebase.ts сам при первом снимке профиля.
    } finally {
      setGoogleLoading(false);
    }
  }

  function validate(): boolean {
    const errors: typeof fieldErrors = {};
    if (!email.trim()) errors.email = 'Введите email';
    else if (!isValidEmail(email)) errors.email = 'Некорректный email';

    if (!password) errors.password = 'Введите пароль';
    else if (password.length < 8) errors.password = 'Минимум 8 символов';

    if (!password2) errors.password2 = 'Повторите пароль';
    else if (password2 !== password) errors.password2 = 'Пароли не совпадают';

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleRegister() {
    setFormError(null);
    const validForm = validate();
    const validConsent = requireConsent();
    if (!validForm || !validConsent) return;

    setLoading(true);
    setPendingConsent('registration');
    try {
      await signUp(email.trim(), password);
      // Согласие запишется само при первом снимке профиля (см. services/firebase.ts).
      // Дальше навигацией управляет App.tsx через onAuthStateChanged.
    } catch (err: any) {
      setPendingConsent(null);
      setFormError(mapAuthError(err?.code ?? ''));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => navigation.navigate('Login')}
          style={styles.backButton}>
          <Text style={styles.backGlyph}>←</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Создать аккаунт</Text>
        <Text style={styles.subtitle}>
          Все ваши авто и история обслуживания сохранятся в облаке
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

          <FormField
            label="Пароль"
            placeholder="Минимум 8 символов"
            secureTextEntry
            textContentType="newPassword"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (fieldErrors.password) setFieldErrors((e) => ({ ...e, password: undefined }));
            }}
            error={fieldErrors.password}
          />

          <FormField
            label="Повторите пароль"
            placeholder="••••••••"
            secureTextEntry
            textContentType="newPassword"
            value={password2}
            onChangeText={(v) => {
              setPassword2(v);
              if (fieldErrors.password2) setFieldErrors((e) => ({ ...e, password2: undefined }));
            }}
            error={fieldErrors.password2}
          />

          <View style={styles.consentBlock}>
            <ConsentCheckbox
              checked={consentChecked}
              onChange={(v) => {
                setConsentChecked(v);
                if (v) setConsentError(null);
              }}
              error={consentError}
            />
          </View>

          {formError ? <Text style={styles.formError}>{formError}</Text> : null}

          <PrimaryButton title="Зарегистрироваться" onPress={handleRegister} loading={loading} />
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
          onPress={handleTelegramSignIn}
          icon={<TelegramIcon size={18} />}
          style={{ marginTop: 10 }}
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>Уже есть аккаунт? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.link}>Войти</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <TelegramWaitingModal
        visible={telegramLogin.visible}
        error={telegramLogin.error}
        onCancel={telegramLogin.cancel}
        onRetry={handleTelegramSignIn}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: darkTheme.background },
  container: { flexGrow: 1, padding: 24, paddingTop: 48 },
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
  title: { fontSize: 26, fontWeight: '800', color: darkTheme.textPrimary, letterSpacing: -0.3 },
  subtitle: { fontSize: 14, color: darkTheme.textSecondary, marginTop: 6, lineHeight: 20 },
  form: { marginTop: 28 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: darkTheme.border },
  dividerText: { fontSize: 12, color: darkTheme.textDisabled },
  consentBlock: { marginBottom: 16 },
  link: { fontSize: 14, fontWeight: '700', color: darkTheme.accent },
  formError: { fontSize: 13, color: darkTheme.danger, marginBottom: 8 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 'auto', paddingTop: 24 },
  footerText: { fontSize: 14, color: darkTheme.textSecondary },
});
