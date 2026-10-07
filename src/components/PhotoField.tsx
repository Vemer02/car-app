import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { darkTheme } from '../theme/tokens';
import { pickAndUploadPhoto, describePhotoError, type PhotoSource } from '../services/photos';
import PhotoThumb from './PhotoThumb';
import PhotoViewerModal from './PhotoViewerModal';
import ActionSheet from './ActionSheet';
import { ImageIcon } from './icons';

interface Props {
  label: string;
  photoIds: string[];
  onChange: (ids: string[]) => void;
  max: number;
}

/** Блок «прикрепить фото» для форм: миниатюры, кнопка «Добавить», просмотр по нажатию. */
export default function PhotoField({ label, photoIds, onChange, max }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewer, setViewer] = useState<string[] | null>(null);

  async function add(source: PhotoSource) {
    setUploading(true);
    try {
      const id = await pickAndUploadPhoto(source);
      if (id) onChange([...photoIds, id]);
    } catch (err) {
      Alert.alert('Фото не добавлено', describePhotoError(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {photoIds.map((id, i) => (
          <PhotoThumb
            key={id}
            photoId={id}
            onPress={() => setViewer(photoIds.slice(i).concat(photoIds.slice(0, i)))}
            onRemove={() => onChange(photoIds.filter((x) => x !== id))}
          />
        ))}
        {uploading && (
          <View style={styles.add}>
            <ActivityIndicator color={darkTheme.accent} />
          </View>
        )}
        {!uploading && photoIds.length < max && (
          <TouchableOpacity style={styles.add} onPress={() => setSheetOpen(true)} accessibilityLabel="Добавить фото">
            <ImageIcon size={22} color={darkTheme.accent} />
            <Text style={styles.addText}>Добавить</Text>
          </TouchableOpacity>
        )}
      </View>
      <ActionSheet
        visible={sheetOpen}
        title="Добавить фото"
        actions={[
          { label: 'Сделать снимок', onPress: () => add('camera') },
          { label: 'Выбрать из галереи', onPress: () => add('library') },
        ]}
        onClose={() => setSheetOpen(false)}
      />
      <PhotoViewerModal ids={viewer} onClose={() => setViewer(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: darkTheme.textSecondary, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  add: {
    width: 64,
    height: 64,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: darkTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addText: { fontSize: 10, color: darkTheme.accent, fontWeight: '600' },
});
