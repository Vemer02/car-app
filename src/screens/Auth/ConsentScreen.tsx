import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { darkTheme } from '../../theme/tokens';
import { recordPrivacyConsent } from '../../services/firebase';
import { signOutAndClear } from '../../services/session';
import PrimaryButton from '../../components/PrimaryButton';
import ConsentCheckbox from '../../components/ConsentCheckbox';

/**
 * Показывается после входа, если нет согласия на текущую редакцию документов:
 * при первом входе через Google или Telegram с экрана входа (там галочки нет) и
 * у всех пользователей после выхода новой редакции Политики.
 */
export default function ConsentScreen() {
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleContinue() {
    if (!checked) {
      setError('Отметьте согласие, чтобы продолжить');
      return;
    }
    recordPrivacyConsent('consent_screen');
  }

  function handleDecline() {
    Alert.alert(
      'Выйти без согласия?',
      'Без согласия на обработку персональных данных мы не можем хранить и синхронизировать ваши данные, поэтому пользоваться приложением не получится.',
      [
        { text: 'Назад', style: 'cancel' },
        { text: 'Выйти', style: 'destructive', onPress: () => signOutAndClear() },
      ],
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Согласие на обработку данных</Text>
      <Text style={styles.subtitle}>
        Чтобы хранить ваши автомобили, записи о ТО и расходы и синхронизировать их между устройствами,
        нам нужно ваше согласие на обработку персональных данных. Если вы уже давали его раньше — мы
        обновили документы и просим подтвердить согласие с новой редакцией.
      </Text>

      <View style={styles.card}>
        <ConsentCheckbox
          checked={checked}
          onChange={(v) => {
            setChecked(v);
            if (v) setError(null);
          }}
          error={error}
        />
      </View>

      <PrimaryButton title="Продолжить" onPress={handleContinue} />
      <PrimaryButton title="Отказаться и выйти" variant="secondary" onPress={handleDecline} style={{ marginTop: 10 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: darkTheme.background },
  content: { flexGrow: 1, padding: 24, paddingTop: 64, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: darkTheme.textPrimary, letterSpacing: -0.3 },
  subtitle: { fontSize: 14, lineHeight: 21, color: darkTheme.textSecondary, marginTop: 10, marginBottom: 24 },
  card: {
    backgroundColor: darkTheme.surface,
    borderWidth: 1,
    borderColor: darkTheme.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
});
