import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { darkTheme } from '../theme/tokens';
import LegalDocumentModal from './LegalDocumentModal';
import { PRIVACY_POLICY, PD_CONSENT } from '../legal/generated';
import type { LegalDocument } from '../legal/types';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string | null;
}

/**
 * Отдельная галочка согласия на обработку ПД. По закону (с 01.09.2025) согласие —
 * самостоятельный документ, его нельзя «зашивать» в политику или пользовательское
 * соглашение. Поэтому галочка — только про согласие, а Политика — отдельная ссылка.
 * По умолчанию не отмечена: согласие должно быть активным действием.
 */
export default function ConsentCheckbox({ checked, onChange, error }: Props) {
  const [openDoc, setOpenDoc] = useState<LegalDocument | null>(null);

  return (
    <View>
      <View style={styles.row}>
        <TouchableOpacity
          onPress={() => onChange(!checked)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel="Даю согласие на обработку персональных данных"
          hitSlop={8}
          style={[styles.box, checked && styles.boxChecked, !!error && !checked && styles.boxError]}>
          {checked ? (
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={darkTheme.background} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
              <Polyline points="20 6 9 17 4 12" />
            </Svg>
          ) : null}
        </TouchableOpacity>
        <Text style={styles.label}>
          <Text onPress={() => onChange(!checked)}>Даю </Text>
          <Text style={styles.link} onPress={() => setOpenDoc(PD_CONSENT)}>
            согласие на обработку персональных данных
          </Text>
        </Text>
      </View>

      {error && !checked ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.policyLine}>
        Как мы храним и защищаем данные — в{' '}
        <Text style={styles.link} onPress={() => setOpenDoc(PRIVACY_POLICY)}>
          Политике конфиденциальности
        </Text>
        .
      </Text>

      <LegalDocumentModal document={openDoc} onClose={() => setOpenDoc(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: darkTheme.textDisabled,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxChecked: { backgroundColor: darkTheme.accent, borderColor: darkTheme.accent },
  boxError: { borderColor: darkTheme.danger },
  label: { flex: 1, fontSize: 14, lineHeight: 21, color: darkTheme.textSecondary },
  link: { color: darkTheme.accent, fontWeight: '600' },
  error: { fontSize: 13, color: darkTheme.danger, marginTop: 6, marginLeft: 34 },
  policyLine: { fontSize: 13, lineHeight: 19, color: darkTheme.textDisabled, marginTop: 10, marginLeft: 34 },
});
