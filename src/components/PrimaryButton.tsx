import React, { ReactNode } from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { darkTheme } from '../theme/tokens';

interface Props {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  style?: ViewStyle;
  icon?: ReactNode;
}

export default function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  style,
  icon,
}: Props) {
  const isSecondary = variant === 'secondary';
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[
        styles.base,
        isSecondary ? styles.secondary : styles.primary,
        (disabled || loading) && styles.disabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={isSecondary ? darkTheme.textPrimary : darkTheme.background} />
      ) : (
        <>
          {icon ? <>{icon}</> : null}
          <Text style={[isSecondary ? styles.textSecondary : styles.textPrimary, icon ? { marginLeft: 10 } : null]}>
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  primary: { backgroundColor: darkTheme.accent },
  secondary: {
    backgroundColor: darkTheme.surface,
    borderWidth: 1,
    borderColor: darkTheme.border,
  },
  disabled: { opacity: 0.5 },
  textPrimary: { color: darkTheme.background, fontSize: 15, fontWeight: '700' },
  textSecondary: { color: darkTheme.textPrimary, fontSize: 14, fontWeight: '600' },
});
