import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

export default function MatchRing({ percentage, size = 120 }) {
  const strokeWidth      = 10;
  const radius           = (size - strokeWidth) / 2;
  const circumference    = 2 * Math.PI * radius;
  const clamped          = Math.min(100, Math.max(0, percentage));
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  const color = clamped >= 70 ? '#34C759' : clamped >= 50 ? '#FF9500' : '#FF3B30';

  // The safe text area is the full inner circle diameter.
  // adjustsFontSizeToFit handles any overflow — no manual padding reduction needed.
  const innerDiameter = size - 2 * strokeWidth;

  // Starting font size (upper bound). The OS scales it down to fit if needed.
  const pctFontSize   = Math.round(size * 0.30);
  const matchFontSize = Math.max(8, Math.round(size * 0.115));

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="#E5E5EA"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>

      {/* Absolutely centred text block, bounded to the inner circle width */}
      <View style={[styles.labelContainer, { width: innerDiameter }]}>
        <Text
          style={[styles.percentageText, { color, fontSize: pctFontSize }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
        >
          {`${Math.round(clamped)}%`}
        </Text>
        <Text style={[styles.matchLabel, { fontSize: matchFontSize }]}>
          match
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  labelContainer: {
    position: 'absolute',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentageText: {
    fontWeight: 'bold',
    textAlign: 'center',
    includeFontPadding: false,
  },
  matchLabel: {
    color: '#86868B',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
    textAlign: 'center',
    includeFontPadding: false,
  },
});
