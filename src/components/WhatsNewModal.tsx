import React from 'react';
import { Modal, View, Text, ScrollView, StyleSheet } from 'react-native';
import { darkTheme } from '../theme/tokens';
import PrimaryButton from './PrimaryButton';
import type { WhatsNewEntry } from '../whatsnew/entries';

interface Props {
  entries: WhatsNewEntry[];
  onDismiss: () => void;
}

export default function WhatsNewModal({ entries, onDismiss }: Props) {
  return (
    <Modal visible={entries.length > 0} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.glyph}>🚀</Text>
          <Text style={styles.header}>Что нового</Text>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {entries.map((entry, i) => (
              <View key={entry.version} style={i > 0 ? styles.entrySpacing : undefined}>
                {entries.length > 1 && <Text style={styles.date}>{entry.date}</Text>}
                <Text style={styles.title}>{entry.title}</Text>
                {entry.points.map((point, j) => (
                  <View key={j} style={styles.pointRow}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.pointText}>{point}</Text>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>

          <PrimaryButton title="Понятно" onPress={onDismiss} style={{ marginTop: 20 }} />
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
    maxHeight: '80%',
    alignItems: 'center',
  },
  glyph: { fontSize: 32, marginBottom: 8 },
  header: { fontSize: 19, fontWeight: '800', color: darkTheme.textPrimary, marginBottom: 16 },
  scroll: { alignSelf: 'stretch' },
  entrySpacing: { marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: darkTheme.border },
  date: { fontSize: 12, fontWeight: '600', color: darkTheme.textDisabled, marginBottom: 4 },
  title: { fontSize: 15, fontWeight: '700', color: darkTheme.textPrimary, marginBottom: 10 },
  pointRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  bullet: { fontSize: 14, lineHeight: 21, color: darkTheme.accent },
  pointText: { flex: 1, fontSize: 14, lineHeight: 21, color: darkTheme.textSecondary },
});
