import React, { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet,
  SafeAreaView, Dimensions, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, Keyboard,
} from 'react-native';
import { Ionicons }   from '@expo/vector-icons';
import { StatusBar }  from 'expo-status-bar';
import AsyncStorage   from '@react-native-async-storage/async-storage';
import { C }          from '../styles/appStyles';

const { width: SW } = Dimensions.get('window');

export const ONBOARDING_KEY = '@md_onboarding_done';

const FREQ_OPTIONS = [
  { id: 'rarely',       label: 'Rarely',       sub: '1–2× a month' },
  { id: 'socially',     label: 'Socially',     sub: '1–2× a week'  },
  { id: 'frequently',   label: 'Frequently',   sub: '3–5× a week'  },
  { id: 'almost_daily', label: 'Almost Daily', sub: '5×+ a week'   },
];

export default function Onboarding({ onComplete }) {
  const scrollRef              = useRef(null);
  const [page, setPage]        = useState(0);
  const [selectedFreq, setSelectedFreq] = useState(null);
  const [protein, setProtein]  = useState('');

  const goTo = (idx) => {
    scrollRef.current?.scrollTo({ x: idx * SW, animated: true });
    setPage(idx);
  };

  const handleFreqSelect = (id) => {
    setSelectedFreq(id);
    setTimeout(() => goTo(2), 380);
  };

  const handleComplete = () => {
    Keyboard.dismiss();
    const val = protein.trim() || '30';
    AsyncStorage.setItem(ONBOARDING_KEY, 'true').catch(() => {});
    onComplete(val);
  };

  return (
    <SafeAreaView style={ob.root}>
      <StatusBar style="dark" />

      {/* ── Horizontal pager ────────────────────────────────────────────── */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
      >

        {/* ────────────────────────────────────────────────────────────────
            Screen 1 · The Hook
        ──────────────────────────────────────────────────────────────── */}
        <View style={ob.screen}>
          <View style={ob.iconRound}>
            <Ionicons name="restaurant-outline" size={32} color={C.accent} />
          </View>

          <Text style={ob.headline}>
            {"Dining out\nshouldn't pause\nyour progress."}
          </Text>
          <Text style={ob.sub}>
            {"Most tracking apps assume you cook 100% of your meals at home. We built a tool for the real world."}
          </Text>

          <View style={{ flex: 1 }} />

          <TouchableOpacity style={ob.btn} onPress={() => goTo(1)} activeOpacity={0.85}>
            <Text style={ob.btnTxt}>Get Started</Text>
          </TouchableOpacity>
        </View>

        {/* ────────────────────────────────────────────────────────────────
            Screen 2 · The Assessment
        ──────────────────────────────────────────────────────────────── */}
        <View style={ob.screen}>
          <Text style={[ob.headline, ob.headlineMd]}>
            {"How often do you eat out\nor order takeaway?"}
          </Text>
          <Text style={[ob.sub, { marginBottom: 24 }]}>
            {"We'll personalise your experience."}
          </Text>

          <View style={{ gap: 12 }}>
            {FREQ_OPTIONS.map(opt => {
              const active = selectedFreq === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[ob.optCard, active && ob.optCardActive]}
                  onPress={() => handleFreqSelect(opt.id)}
                  activeOpacity={0.78}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[ob.optLabel, active && ob.optLabelActive]}>
                      {opt.label}
                    </Text>
                    <Text style={ob.optSub}>{opt.sub}</Text>
                  </View>
                  <View style={[ob.optDot, active && ob.optDotActive]}>
                    {active && <Ionicons name="checkmark" size={12} color={C.white} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ────────────────────────────────────────────────────────────────
            Screen 3 · The Insight
        ──────────────────────────────────────────────────────────────── */}
        <View style={ob.screen}>
          <View style={ob.iconRound}>
            <Ionicons name="stats-chart-outline" size={28} color={C.accent} />
          </View>

          <Text style={ob.headline}>{"The Restaurant\nBlindspot."}</Text>

          <View style={ob.insightCard}>
            <Text style={ob.insightQuote}>
              {"Tracking data shows that people are significantly more likely to sustain a successful transformation when they consistently log their restaurant meals."}
            </Text>
            <View style={ob.insightDivider} />
            <Text style={ob.insightBody}>
              {"Know exactly what to eat no matter where you are."}
            </Text>
          </View>

          <View style={{ flex: 1 }} />

          <TouchableOpacity style={ob.btn} onPress={() => goTo(3)} activeOpacity={0.85}>
            <Text style={ob.btnTxt}>Continue</Text>
          </TouchableOpacity>
        </View>

        {/* ────────────────────────────────────────────────────────────────
            Screen 4 · The Core Setup
        ──────────────────────────────────────────────────────────────── */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ width: SW, flex: 1 }}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={ob.screen}>
              <View style={ob.iconRound}>
                <Ionicons name="barbell-outline" size={30} color={C.accent} />
              </View>

              <Text style={ob.headline}>{"Set Your\nFoundation."}</Text>
              <Text style={ob.sub}>
                {"What is your target protein goal for your heavy meals? We'll use this to calculate your exact decimal serving sizes on any menu."}
              </Text>

              <View style={ob.inputCard}>
                <Text style={ob.inputCardLabel}>Protein Target</Text>
                <View style={ob.inputRow}>
                  <TextInput
                    style={ob.proteinInput}
                    value={protein}
                    onChangeText={t => setProtein(t.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="30"
                    placeholderTextColor={C.muted}
                    returnKeyType="done"
                    maxLength={4}
                    onSubmitEditing={Keyboard.dismiss}
                    selectTextOnFocus
                  />
                  <Text style={ob.inputUnit}>g</Text>
                </View>
              </View>

              <Text style={ob.inputNote}>You can change this for every meal</Text>

              <View style={{ flex: 1 }} />

              <TouchableOpacity style={ob.btn} onPress={handleComplete} activeOpacity={0.85}>
                <Text style={ob.btnTxt}>See My Dashboard →</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>

      </ScrollView>

      {/* ── Pill dot indicators ─────────────────────────────────────────── */}
      <View style={ob.dotsRow}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={[ob.dot, page === i && ob.dotActive]} />
        ))}
      </View>
    </SafeAreaView>
  );
}

const ob = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  screen: {
    width: SW, flex: 1,
    paddingHorizontal: 28, paddingTop: 52, paddingBottom: 32,
  },

  // ── Icon bubble ────────────────────────────────────────────────────────────
  iconRound: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: 'rgba(0,122,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 28, alignSelf: 'flex-start',
  },

  // ── Typography ─────────────────────────────────────────────────────────────
  headline: {
    fontSize: 34, fontWeight: '800', color: C.gray,
    letterSpacing: -0.8, lineHeight: 41, marginBottom: 14,
  },
  headlineMd: { fontSize: 27, lineHeight: 34 },
  sub: {
    fontSize: 16, color: C.muted, lineHeight: 25, fontWeight: '400',
  },

  // ── Assessment option cards ────────────────────────────────────────────────
  optCard: {
    backgroundColor: C.card, borderRadius: 14, padding: 18,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#F2F2F7',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 5, elevation: 1,
  },
  optCardActive: {
    borderColor: C.accent,
    backgroundColor: 'rgba(0,122,255,0.04)',
  },
  optLabel:       { fontSize: 16, fontWeight: '700', color: C.gray, marginBottom: 3 },
  optLabelActive: { color: C.accent },
  optSub:         { fontSize: 13, color: C.muted },
  optDot: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  optDotActive: { backgroundColor: C.accent, borderColor: C.accent },

  // ── Insight card ───────────────────────────────────────────────────────────
  insightCard: {
    backgroundColor: C.card, borderRadius: 16, padding: 22, marginTop: 20,
    borderWidth: 1, borderColor: '#F2F2F7',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  insightQuote: {
    fontSize: 15, fontWeight: '600', color: C.gray,
    lineHeight: 23, fontStyle: 'italic',
  },
  insightDivider: { height: 1, backgroundColor: '#F2F2F7', marginVertical: 14 },
  insightBody:    { fontSize: 14, color: C.muted, lineHeight: 22 },

  // ── Protein input card ─────────────────────────────────────────────────────
  inputCard: {
    backgroundColor: C.card, borderRadius: 16, padding: 22, marginTop: 24,
    borderWidth: 1, borderColor: '#F2F2F7',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  inputCardLabel: {
    fontSize: 11, fontWeight: '700', color: C.muted,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10,
  },
  inputRow:     { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  proteinInput: {
    fontSize: 52, fontWeight: '900', color: C.gray,
    letterSpacing: -2, minWidth: 100,
    padding: 0, includeFontPadding: false,
  },
  inputUnit: {
    fontSize: 24, fontWeight: '600', color: C.muted, letterSpacing: -0.5,
  },
  inputNote: {
    fontSize: 13, color: C.muted, marginTop: 12, fontWeight: '400',
  },

  // ── CTA button ─────────────────────────────────────────────────────────────
  btn:    { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 17, alignItems: 'center', width: '100%' },
  btnTxt: { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },

  // ── Pill dots ──────────────────────────────────────────────────────────────
  dotsRow:   { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingBottom: 28, gap: 7 },
  dot:       { width: 7,  height: 7, borderRadius: 3.5, backgroundColor: '#D1D1D6' },
  dotActive: { width: 22, height: 7, borderRadius: 3.5, backgroundColor: C.accent },
});
