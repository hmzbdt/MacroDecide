import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, SafeAreaView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, Keyboard, ScrollView,
  Modal, StyleSheet,
} from 'react-native';
import { StatusBar }  from 'expo-status-bar';
import { Ionicons, AntDesign } from '@expo/vector-icons';
import { doc, setDoc }         from 'firebase/firestore';
import { db }                  from '../config/firebase';
import { C }                   from '../styles/appStyles';
import { useAuth }             from '../context/AuthContext';

export default function LoginScreen({ initialMode = 'signin', pendingProtein }) {
  const { login, signup } = useAuth();

  const [mode,            setMode]           = useState(initialMode);
  const [email,           setEmail]          = useState('');
  const [password,        setPassword]       = useState('');
  const [showPass,        setShowPass]       = useState(false);
  const [loading,         setLoading]        = useState(false);
  const [error,           setError]          = useState('');
  const [showGoogleModal, setShowGoogleModal] = useState(false);

  const isSignIn = mode === 'signin';

  const resetForm = () => { setEmail(''); setPassword(''); setError(''); setShowPass(false); };
  const toggleMode = () => { setMode(m => m === 'signin' ? 'signup' : 'signin'); resetForm(); };

  const authErrorMessage = (code, forSignUp) => {
    switch (code) {
      case 'auth/email-already-in-use':  return 'An account with this email already exists. Sign in instead.';
      case 'auth/weak-password':         return 'Password must be at least 6 characters.';
      case 'auth/invalid-email':         return 'Please enter a valid email address.';
      case 'auth/user-not-found':        return 'No account found with that email.';
      case 'auth/wrong-password':        return 'Incorrect password. Please try again.';
      case 'auth/invalid-credential':    return 'Incorrect email or password.';
      case 'auth/too-many-requests':     return 'Too many attempts. Please try again later.';
      default:                           return forSignUp ? 'Sign up failed. Please try again.' : 'Sign in failed. Please try again.';
    }
  };

  const handleSignIn = async () => {
    Keyboard.dismiss();
    if (!email.trim() || !password) { setError('Please enter your email and password.'); return; }
    setLoading(true); setError('');
    try {
      await login(email.trim(), password);
    } catch (err) {
      setLoading(false);
      setError(authErrorMessage(err.code, false));
    }
  };

  const handleSignUp = async () => {
    Keyboard.dismiss();
    if (!email.trim() || !password) { setError('Please enter your email and password.'); return; }
    if (password.length < 6)        { setError('Password must be at least 6 characters.'); return; }
    setLoading(true); setError('');
    try {
      const { user } = await signup(email.trim(), password);
      await setDoc(doc(db, 'users', user.uid), {
        email:         email.trim(),
        targetProtein: parseInt(pendingProtein, 10) || 200,
        isAdmin:       false,
        scanTokens:    3,
        createdAt:     new Date(),
      });
    } catch (err) {
      setLoading(false);
      setError(authErrorMessage(err.code, true));
    }
  };

  return (
    <SafeAreaView style={ls.root}>
      <StatusBar style="dark" />

      {/* ── Google Sign-In Info Modal ──────────────────────────────── */}
      <Modal
        visible={showGoogleModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGoogleModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowGoogleModal(false)}>
          <View style={ls.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={ls.modalCard}>
                <View style={ls.modalIconWrap}>
                  <AntDesign name="google" size={24} color="#EA4335" />
                </View>
                <Text style={ls.modalTitle}>Sign in with Google</Text>
                <Text style={ls.modalBody}>
                  {"Google Sign-In is being optimized for the App Store build. Please use Email & Password above for instant preview access."}
                </Text>
                <TouchableOpacity
                  style={ls.modalBtn}
                  onPress={() => setShowGoogleModal(false)}
                  activeOpacity={0.85}
                >
                  <Text style={ls.modalBtnTxt}>Got it</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={ls.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Icon ───────────────────────────────────────────────── */}
          <View style={ls.iconRound}>
            <Ionicons name="stats-chart-outline" size={28} color={C.accent} />
          </View>

          {/* ── Headline ───────────────────────────────────────────── */}
          <Text style={ls.headline}>
            {isSignIn ? 'Welcome Back' : 'Create Your Account'}
          </Text>
          <Text style={ls.sub}>
            {isSignIn ? 'Sign in to continue.' : 'Start tracking smarter.'}
          </Text>

          {/* ── Form card ──────────────────────────────────────────── */}
          <View style={ls.card}>
            <View style={ls.fieldWrap}>
              <Text style={ls.fieldLabel}>EMAIL</Text>
              <TextInput
                style={ls.input}
                value={email}
                onChangeText={t => { setEmail(t); setError(''); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                placeholder="you@example.com"
                placeholderTextColor={C.muted}
                returnKeyType="next"
              />
            </View>

            <View style={ls.divider} />

            <View style={ls.fieldWrap}>
              <Text style={ls.fieldLabel}>PASSWORD</Text>
              <View style={ls.passRow}>
                <TextInput
                  style={[ls.input, { flex: 1 }]}
                  value={password}
                  onChangeText={t => { setPassword(t); setError(''); }}
                  secureTextEntry={!showPass}
                  placeholder="••••••••"
                  placeholderTextColor={C.muted}
                  returnKeyType="done"
                  onSubmitEditing={isSignIn ? handleSignIn : handleSignUp}
                />
                <TouchableOpacity
                  onPress={() => setShowPass(p => !p)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={showPass ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={C.muted}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* ── Error ──────────────────────────────────────────────── */}
          {!!error && <Text style={ls.error}>{error}</Text>}

          {/* ── Primary CTA ────────────────────────────────────────── */}
          <TouchableOpacity
            style={[ls.primaryBtn, loading && { opacity: 0.6 }]}
            onPress={isSignIn ? handleSignIn : handleSignUp}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={ls.primaryBtnTxt}>{isSignIn ? 'Sign In' : 'Create Account'}</Text>
            }
          </TouchableOpacity>

          {/* ── Google ─────────────────────────────────────────────── */}
          <TouchableOpacity
            style={ls.googleBtn}
            onPress={() => setShowGoogleModal(true)}
            activeOpacity={0.82}
          >
            <AntDesign name="google" size={18} color="#EA4335" />
            <Text style={ls.googleBtnTxt}>Sign in with Google</Text>
          </TouchableOpacity>

          {/* ── Toggle ─────────────────────────────────────────────── */}
          <View style={ls.toggleRow}>
            <Text style={ls.toggleTxt}>
              {isSignIn ? "Don't have an account?" : 'Already have an account?'}
            </Text>
            <TouchableOpacity onPress={toggleMode} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
              <Text style={ls.toggleLink}>
                {isSignIn ? ' Sign Up' : ' Sign In'}
              </Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const ls = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 52, paddingBottom: 40 },

  // ── Icon bubble (matches onboarding) ────────────────────────────────────────
  iconRound: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: 'rgba(0,122,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 28, alignSelf: 'flex-start',
  },

  // ── Typography ──────────────────────────────────────────────────────────────
  headline: {
    fontSize: 34, fontWeight: '800', color: C.gray,
    letterSpacing: -0.8, lineHeight: 41, marginBottom: 10,
  },
  sub: { fontSize: 16, color: C.muted, lineHeight: 25, marginBottom: 32 },

  // ── Form card ───────────────────────────────────────────────────────────────
  card: {
    backgroundColor: C.card, borderRadius: 16, paddingHorizontal: 16,
    marginBottom: 10, borderWidth: 1, borderColor: '#F2F2F7',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  fieldWrap:  { paddingVertical: 16 },
  fieldLabel: {
    fontSize: 10, fontWeight: '700', color: C.muted,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6,
  },
  input:    { fontSize: 16, fontWeight: '500', color: C.gray, padding: 0 },
  divider:  { height: 1, backgroundColor: '#F2F2F7' },
  passRow:  { flexDirection: 'row', alignItems: 'center' },

  // ── Error ───────────────────────────────────────────────────────────────────
  error: {
    fontSize: 13, color: '#FF3B30', marginBottom: 10,
    textAlign: 'center', lineHeight: 18,
  },

  // ── Primary button ──────────────────────────────────────────────────────────
  primaryBtn: {
    backgroundColor: C.accent, borderRadius: 14,
    paddingVertical: 17, alignItems: 'center', marginBottom: 12,
  },
  primaryBtnTxt: { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },

  // ── Google button ───────────────────────────────────────────────────────────
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 14, paddingVertical: 15,
    gap: 10, marginBottom: 28,
    borderWidth: 1, borderColor: '#E5E5EA',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  googleBtnTxt: { fontSize: 16, fontWeight: '600', color: C.gray },

  // ── Toggle row ──────────────────────────────────────────────────────────────
  toggleRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
  },
  toggleTxt:  { fontSize: 14, color: C.muted },
  toggleLink: { fontSize: 14, fontWeight: '700', color: C.accent },

  // ── Google info modal ───────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32,
  },
  modalCard: {
    width: '100%', backgroundColor: '#FFFFFF',
    borderRadius: 20, padding: 28, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14, shadowRadius: 24, elevation: 8,
  },
  modalIconWrap: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: 'rgba(234,67,53,0.1)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18, fontWeight: '800', color: C.gray,
    marginBottom: 10, textAlign: 'center',
  },
  modalBody: {
    fontSize: 14, color: C.muted, lineHeight: 22,
    textAlign: 'center', marginBottom: 24,
  },
  modalBtn: {
    backgroundColor: C.accent, borderRadius: 12,
    paddingVertical: 14, width: '100%', alignItems: 'center',
  },
  modalBtnTxt: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
