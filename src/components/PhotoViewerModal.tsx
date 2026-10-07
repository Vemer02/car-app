import React from 'react';
import { Modal, View, Image, ScrollView, ActivityIndicator, TouchableOpacity, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { usePhotoUri } from '../hooks/usePhotoUri';
import { darkTheme } from '../theme/tokens';
import { XIcon, ImageIcon } from './icons';

function Page({ photoId, width, height }: { photoId: string; width: number; height: number }) {
  const uri = usePhotoUri(photoId);
  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
      {uri ? (
        <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />
      ) : uri === undefined ? (
        <ActivityIndicator size="large" color={darkTheme.accent} />
      ) : (
        <View style={{ alignItems: 'center', gap: 8 }}>
          <ImageIcon size={40} color={darkTheme.textDisabled} />
          <Text style={{ color: darkTheme.textSecondary, fontSize: 13 }}>Не удалось загрузить фото</Text>
        </View>
      )}
    </View>
  );
}

/** Фото на весь экран; если их несколько — листаются в стороны. `ids == null` — закрыто. */
export default function PhotoViewerModal({ ids, onClose }: { ids: string[] | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  return (
    <Modal visible={ids != null} transparent={false} animationType="fade" onRequestClose={onClose}>
      <View style={styles.screen}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          {(ids ?? []).map((id) => (
            <Page key={id} photoId={id} width={width} height={height} />
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.close} onPress={onClose} accessibilityLabel="Закрыть" hitSlop={10}>
          <XIcon size={22} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
        {ids != null && ids.length > 1 && <Text style={styles.hint}>Листайте в стороны · {ids.length} фото</Text>}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  close: {
    position: 'absolute',
    top: 40,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { position: 'absolute', bottom: 30, alignSelf: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 12 },
});
