import React from 'react';
import { View, Image, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { darkTheme } from '../theme/tokens';
import { usePhotoUri } from '../hooks/usePhotoUri';
import { ImageIcon, XIcon } from './icons';

interface Props {
  photoId: string;
  size?: number;
  onPress?: () => void;
  /** Если передан — в углу появляется «×» для удаления. */
  onRemove?: () => void;
}

export default function PhotoThumb({ photoId, size = 64, onPress, onRemove }: Props) {
  const uri = usePhotoUri(photoId);
  return (
    <View style={{ width: size, height: size }}>
      <TouchableOpacity activeOpacity={0.8} onPress={onPress} disabled={!onPress} style={[styles.box, { width: size, height: size }]}>
        {uri ? (
          <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="cover" />
        ) : uri === undefined ? (
          <ActivityIndicator size="small" color={darkTheme.accent} />
        ) : (
          // не загрузилось (нет связи или фото уже нет) — не ломаем экран, показываем заглушку
          <ImageIcon size={size * 0.4} color={darkTheme.textDisabled} />
        )}
      </TouchableOpacity>
      {onRemove && (
        <TouchableOpacity style={styles.remove} onPress={onRemove} hitSlop={8} accessibilityLabel="Убрать фото">
          <XIcon size={12} color="#fff" strokeWidth={3} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: darkTheme.surface,
    borderWidth: 1,
    borderColor: darkTheme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: darkTheme.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
