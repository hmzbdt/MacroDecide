import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const PILL_CONFIG = [
  { key: 'protein', letter: 'P', bg: 'rgba(0,122,255,0.1)',  border: '#007AFF', text: '#007AFF' },
  { key: 'carbs',   letter: 'C', bg: 'rgba(52,199,89,0.1)',  border: '#34C759', text: '#34C759' },
  { key: 'fat',     letter: 'F', bg: 'rgba(255,149,0,0.12)', border: '#FF9500', text: '#FF9500' },
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
