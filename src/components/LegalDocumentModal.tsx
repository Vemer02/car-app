import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { darkTheme } from '../theme/tokens';
import LegalText from './LegalText';
import type { LegalDocument } from '../legal/types';

interface Props {
  document: LegalDocument | null;
  onClose: () => void;
}

/** Полноэкранный просмотр документа. Тексты встроены в приложение — открываются и без сети. */
export default function LegalDocumentModal({ document, onClose }: Props) {
  return (
    <Modal visible={!!document} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={2}>
            {document?.title}
          </Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" hitSlop={12}>
            <Text style={styles.close}>Закрыть</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {document ? <LegalText blocks={document.blocks} /> : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: darkTheme.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: darkTheme.border,
  },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: darkTheme.textPrimary },
  close: { fontSize: 15, fontWeight: '700', color: darkTheme.accent },
  content: { padding: 20, paddingBottom: 48 },
});
