import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const PILL_CONFIG = [
  { key: 'protein', letter: 'P', bg: 'rgba(66,165,245,0.15)', border: '#42a5f5', text: '#42a5f5' },
  { key: 'carbs', letter: 'C', bg: 'rgba(0,121,107,0.15)', border: '#00796b', text: '#00796b' },
  { key: 'fat', letter: 'F', bg: 'rgba(255,167,38,0.15)', border: '#ffa726', text: '#ffa726' },
];

export default function MacroPills({ protein, carbs, fat }) {
  const values = { protein, carbs, fat };

  return (
    <View style={styles.row}>
      {PILL_CONFIG.map(({ key, letter, bg, border, text }) => (
        <View
          key={key}
          style={[styles.pill, { backgroundColor: bg, borderColor: border }]}
        >
          <Text style={[styles.pillText, { color: text }]}>
            {Math.round(values[key])}g {letter}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginVertical: 12,
  },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
