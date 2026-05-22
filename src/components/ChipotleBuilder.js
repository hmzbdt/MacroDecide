import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Switch } from 'react-native';
import { s, C } from '../styles/appStyles';

const BEAN_NAMES = ['Black Beans', 'Pinto Beans'];

export default function ChipotleBuilder({ menuItems, itemQty, onInc, onDec }) {
  const [isDouble, setIsDouble] = useState(false);

  const bases    = menuItems.filter(i => i.category === 'base');
  const proteins = menuItems.filter(i => i.category === 'protein');
  const fillers  = menuItems.filter(i => i.category === 'addon' && BEAN_NAMES.includes(i.name));
  const toppings = menuItems.filter(i => i.category === 'addon' && !BEAN_NAMES.includes(i.name));

  const selectedProtein = proteins.find(i => (itemQty[i.name] || 0) > 0);

  const handleDoubleToggle = (val) => {
    setIsDouble(val);
    if (selectedProtein) {
      const qty = itemQty[selectedProtein.name] || 0;
      if (val && qty === 1) onInc(selectedProtein.name);
      if (!val && qty === 2) onDec(selectedProtein.name);
    }
  };

  const handleProteinSelect = (item) => {
    const qty = itemQty[item.name] || 0;
    if (qty > 0) {
      for (let i = 0; i < qty; i++) onDec(item.name);
      if (isDouble) setIsDouble(false);
    } else {
      proteins.forEach(p => {
        const q = itemQty[p.name] || 0;
        for (let i = 0; i < q; i++) onDec(p.name);
      });
      onInc(item.name);
      if (isDouble) onInc(item.name);
    }
  };

  const macroStr = (item) =>
    [item.protein > 0 ? `${item.protein}P` : '',
     item.carbs   > 0 ? `${item.carbs}C`   : '',
     item.fat     > 0 ? `${item.fat}F`     : '']
    .filter(Boolean).join(' · ');

  const renderStepper = (item) => {
    const qty = itemQty[item.name] || 0;
    return (
      <View key={item.name} style={[s.menuRow, qty > 0 && s.menuRowActive]}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={[s.menuName, qty > 0 && s.menuNameActive]}>{item.name}</Text>
          <View style={s.pillRow}>
            <View style={s.pill}><Text style={s.pillTxt}>{macroStr(item)}</Text></View>
          </View>
        </View>
        <View style={s.stepRow}>
          <TouchableOpacity
            style={[s.stepBtn, !qty && s.stepBtnDim]}
            onPress={() => onDec(item.name)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 6 }}
            activeOpacity={qty ? 0.65 : 1}>
            <Text style={[s.stepIcon, !qty && s.stepIconDim]}>−</Text>
          </TouchableOpacity>
          <Text style={[s.stepCount, qty > 0 && s.stepCountActive]}>{qty || '0'}</Text>
          <TouchableOpacity
            style={s.stepBtn}
            onPress={() => onInc(item.name)}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
            activeOpacity={0.65}>
            <Text style={s.stepIcon}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderProteinOption = (item) => {
    const active = (itemQty[item.name] || 0) > 0;
    return (
      <TouchableOpacity
        key={item.name}
        style={[bs.optionBtn, active && bs.optionBtnActive]}
        onPress={() => handleProteinSelect(item)}
        activeOpacity={0.75}>
        <View style={[bs.dot, active && bs.dotActive]} />
        <View style={{ flex: 1 }}>
          <Text style={[bs.optionName, active && bs.optionNameActive]}>{item.name}</Text>
          <Text style={bs.optionMacro}>{macroStr(item)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

      <View style={s.section}>
        <Text style={s.sectionLabel}>Step 1 — Base</Text>
        {bases.map(renderStepper)}
      </View>

      <View style={s.section}>
        <View style={bs.stepHeader}>
          <Text style={s.sectionLabel}>Step 2 — Protein</Text>
          <View style={bs.doubleRow}>
            <Text style={bs.doubleTxt}>Double</Text>
            <Switch
              value={isDouble}
              onValueChange={handleDoubleToggle}
              trackColor={{ false: '#E5E5EA', true: C.accent }}
              thumbColor={C.white}
            />
          </View>
        </View>
        {proteins.map(renderProteinOption)}
      </View>

      <View style={s.section}>
        <Text style={s.sectionLabel}>Step 3 — Fillers</Text>
        {fillers.map(renderStepper)}
      </View>

      <View style={s.section}>
        <Text style={s.sectionLabel}>Step 4 — Toppings</Text>
        {toppings.map(renderStepper)}
      </View>

      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

const bs = StyleSheet.create({
  stepHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 2 },
  doubleRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  doubleTxt:       { fontSize: 13, fontWeight: '600', color: C.muted },
  optionBtn:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.card, marginBottom: 6, borderWidth: 1, borderColor: '#F2F2F7', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  optionBtnActive: { backgroundColor: 'rgba(0,122,255,0.06)', borderColor: 'rgba(0,122,255,0.2)' },
  dot:             { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#D1D1D6', marginRight: 12 },
  dotActive:       { backgroundColor: C.accent, borderColor: C.accent },
  optionName:      { fontSize: 14, fontWeight: '600', color: C.muted },
  optionNameActive:{ color: C.gray },
  optionMacro:     { fontSize: 11, color: C.muted, marginTop: 2 },
});
