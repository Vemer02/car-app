import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { darkTheme } from '../theme/tokens';
import type { LegalBlock } from '../legal/types';

/** Выделение **жирным** внутри строки — единственная разметка, которую используют документы. */
function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <Text key={i} style={styles.bold}>
        {part.slice(2, -2)}
      </Text>
    ) : (
      part
    ),
  );
}

export default function LegalText({ blocks }: { blocks: LegalBlock[] }) {
  return (
    <View>
      {blocks.map((block, i) => {
        if (block.type === 'ul') {
          return (
            <View key={i} style={styles.list}>
              {block.items.map((item, j) => (
                <View key={j} style={styles.listItem}>
                  <Text style={styles.bullet}>•</Text>
                  <Text style={[styles.paragraph, styles.listText]}>{renderInline(item)}</Text>
                </View>
              ))}
            </View>
          );
        }
        const style = block.type === 'p' ? styles.paragraph : block.type === 'h3' ? styles.h3 : styles.h2;
        return (
          <Text key={i} style={style} accessibilityRole={block.type === 'p' ? undefined : 'header'}>
            {renderInline(block.text)}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  h2: { fontSize: 17, fontWeight: '700', color: darkTheme.textPrimary, marginTop: 22, marginBottom: 8 },
  h3: { fontSize: 15, fontWeight: '700', color: darkTheme.textPrimary, marginTop: 16, marginBottom: 6 },
  paragraph: { fontSize: 14, lineHeight: 21, color: darkTheme.textSecondary, marginBottom: 10 },
  bold: { fontWeight: '700', color: darkTheme.textPrimary },
  list: { marginBottom: 10 },
  listItem: { flexDirection: 'row', gap: 8 },
  bullet: { fontSize: 14, lineHeight: 21, color: darkTheme.textSecondary },
  listText: { flex: 1, marginBottom: 4 },
});
