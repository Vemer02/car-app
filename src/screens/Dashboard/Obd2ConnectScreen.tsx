import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { darkTheme } from '../../theme/tokens';

export default function Obd2ConnectScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Obd2ConnectScreen — TODO: перенести разметку из мокапа</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: darkTheme.background, alignItems: 'center', justifyContent: 'center' },
  text: { color: darkTheme.textSecondary, fontSize: 14, padding: 24, textAlign: 'center' },
});
