import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { s } from '../styles/appStyles';

// Shared −/count/+ row. Pass `editable` + the draft props for tap-to-type
// numeric entry (detail view); omit them for a plain read-only count (quick scan).
export default function PortionStepper({
  qty, onInc, onDec,
  editable = false, isDrafting = false, draftValue = '', onDraftChange, onDraftBlur,
}) {
  const active = qty > 0;
  const displayValue = isDrafting ? draftValue : (qty ? qty.toFixed(1) : '0');

  return (
    <View style={s.stepRow}>
      <TouchableOpacity
        style={[s.stepBtn, !qty && s.stepBtnDim]}
        onPress={onDec}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 6 }}
        activeOpacity={qty ? 0.65 : 1}
      >
        <Text style={[s.stepIcon, !qty && s.stepIconDim]}>−</Text>
      </TouchableOpacity>

      {editable ? (
        <TextInput
          style={[s.stepCount, active && s.stepCountActive, s.stepInput]}
          keyboardType="numeric"
          returnKeyType="done"
          maxLength={4}
          selectTextOnFocus
          value={displayValue}
          onChangeText={onDraftChange}
          onBlur={onDraftBlur}
        />
      ) : (
        <Text style={[s.stepCount, active && s.stepCountActive]}>{displayValue}</Text>
      )}

      <TouchableOpacity
        style={s.stepBtn}
        onPress={onInc}
        hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
        activeOpacity={0.65}
      >
        <Text style={s.stepIcon}>+</Text>
      </TouchableOpacity>
    </View>
  );
}
