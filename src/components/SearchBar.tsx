import React from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { darkTheme } from '../theme/tokens';
import { SearchIcon, XIcon } from './icons';

interface Props {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
}

export default function SearchBar({ value, onChangeText, placeholder }: Props) {
  return (
    <View style={styles.wrap}>
      <SearchIcon size={16} color={darkTheme.textSecondary} strokeWidth={2} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={darkTheme.textDisabled}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText('')} hitSlop={10} accessibilityLabel="Очистить поиск">
          <XIcon size={16} color={darkTheme.textSecondary} strokeWidth={2} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: darkTheme.surface,
    borderWidth: 1,
    borderColor: darkTheme.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
  },
  input: { flex: 1, fontSize: 14, color: darkTheme.textPrimary, padding: 0 },
});
