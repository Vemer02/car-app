import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { darkTheme } from '../theme/tokens';

export interface SheetAction {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  title: string;
  actions: SheetAction[];
  onClose: () => void;
}

/**
 * Нижний лист с действиями. Свой, а не Alert.alert: на Android системный диалог показывает
 * максимум три кнопки, лишние молча пропадают, а здесь действий может быть больше.
 */
export default function ActionSheet({ visible, title, actions, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Pressable внутри Pressable: нажатие по самому листу не должно закрывать его */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {actions.map((a) => (
            <TouchableOpacity
              key={a.label}
              style={styles.action}
              onPress={() => {
                onClose();
                a.onPress();
              }}>
              <Text style={[styles.actionText, a.destructive && { color: darkTheme.danger }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.action, styles.cancel]} onPress={onClose}>
            <Text style={[styles.actionText, { color: darkTheme.textSecondary }]}>Отмена</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: darkTheme.surfaceElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  title: { fontSize: 15, fontWeight: '700', color: darkTheme.textPrimary, textAlign: 'center', marginBottom: 10 },
  action: { paddingVertical: 15, alignItems: 'center', borderTopWidth: 1, borderTopColor: darkTheme.border },
  cancel: { marginTop: 4 },
  actionText: { fontSize: 16, fontWeight: '600', color: darkTheme.textPrimary },
});
