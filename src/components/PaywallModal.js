import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Modal, SafeAreaView,
  ScrollView, ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { Ionicons }  from '@expo/vector-icons';
import { doc, updateDoc } from 'firebase/firestore';
import { db }        from '../config/firebase';
import { useAuth }   from '../context/AuthContext';
import { getOfferings, purchasePackage } from '../services/billingService';
import { C }         from '../styles/appStyles';

export default function PaywallModal({ visible, onClose }) {
  const { user, setIsPremium, scanTokens } = useAuth();

  const [offering,     setOffering]     = useState(null);
  const [offerLoading, setOfferLoading] = useState(false);
  const [selected,     setSelected]     = useState('macro_yearly');
  const [purchasing,   setPurchasing]   = useState(false);

  useEffect(() => {
    if (!visible) return;
    setOfferLoading(true);
    getOfferings()
      .then(setOffering)
      .catch(() => setOffering(null))
      .finally(() => setOfferLoading(false));
  }, [visible]);

  const monthlyPkg = offering?.availablePackages?.find(p => p.identifier === 'macro_monthly');
  const yearlyPkg  = offering?.availablePackages?.find(p => p.identifier === 'macro_yearly');

  const handlePurchase = async () => {
    const pkg = selected === 'macro_monthly' ? monthlyPkg : yearlyPkg;
    if (!pkg) {
      Alert.alert('Not Available', 'Pricing could not be loaded. Please try again shortly.');
      return;
    }
    setPurchasing(true);
    try {
      await purchasePackage(pkg);
      setIsPremium(true);
      if (user) {
        updateDoc(doc(db, 'users', user.uid), { isPremium: true }).catch(() => {});
      }
      onClose();
    } catch (err) {
      if (!err.userCancelled) {
        Alert.alert('Purchase Failed', err?.message ?? 'Something went wrong. Please try again.');
      }
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={purchasing ? undefined : onClose}
    >
      <SafeAreaView style={pw.root}>
        {/* Header */}
        <View style={pw.header}>
          <TouchableOpacity
            onPress={onClose}
            style={pw.closeBtn}
            activeOpacity={0.7}
            disabled={purchasing}
          >
            <Ionicons name="close" size={18} color={C.muted} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={pw.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={pw.heroWrap}>
            <Text style={pw.headline}>Unlock Unlimited Clarity</Text>
            <Text style={pw.subtext}>
              Stop overthinking the menu. Don't feel bad about your diet when eating out
              with friends, and stop guessing your metrics at the drive-thru. Hit your
              macro targets seamlessly while living a normal life.
            </Text>
            {scanTokens !== null && scanTokens <= 0 && (
              <View style={pw.tokensEmpty}>
                <Text style={pw.tokensEmptyTxt}>You've used all your free scans</Text>
              </View>
            )}
          </View>

          {/* Feature list */}
          <View style={pw.featureList}>
            {[
              { tag: 'Social Freedom:',   sub: ' Order with confidence at any restaurant' },
              { tag: 'Zero Guesswork:',   sub: ' Instantly find the highest protein options' },
              { tag: 'Stay Accountable:', sub: ' Log your dining out history in one tap' },
              { tag: 'Pure Precision:',   sub: ' Tailored entirely to your heavy macro targets' },
            ].map(({ tag, sub }) => (
              <View key={tag} style={pw.featureRow}>
                <Text style={pw.featureTxt}>
                  <Text style={pw.featureTag}>{tag}</Text>{sub}
                </Text>
              </View>
            ))}
          </View>

          {/* Plan selector */}
          <Text style={pw.plansLabel}>Choose your plan</Text>

          {offerLoading ? (
            <ActivityIndicator color={C.accent} style={{ marginVertical: 28 }} />
          ) : (
            <>
              {/* Annual card */}
              <TouchableOpacity
                style={[pw.planCard, selected === 'macro_yearly' && pw.planCardSelected]}
                onPress={() => setSelected('macro_yearly')}
                activeOpacity={0.8}
                disabled={purchasing}
              >
                <View style={pw.planTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={pw.planName}>Annual</Text>
                    <Text style={pw.planDesc}>Best value · billed once per year</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={pw.planPrice}>
                      {yearlyPkg?.product?.priceString ?? '—'}
                    </Text>
                    <View style={pw.saveBadge}>
                      <Text style={pw.saveBadgeTxt}>SAVE 50%</Text>
                    </View>
                  </View>
                </View>
                {selected === 'macro_yearly' && (
                  <View style={pw.checkWrap}>
                    <Ionicons name="checkmark-circle" size={20} color={C.accent} />
                  </View>
                )}
              </TouchableOpacity>

              {/* Monthly card */}
              <TouchableOpacity
                style={[pw.planCard, selected === 'macro_monthly' && pw.planCardSelected]}
                onPress={() => setSelected('macro_monthly')}
                activeOpacity={0.8}
                disabled={purchasing}
              >
                <View style={pw.planTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={pw.planName}>Monthly</Text>
                    <Text style={pw.planDesc}>Flexible · cancel anytime</Text>
                  </View>
                  <Text style={pw.planPrice}>
                    {monthlyPkg?.product?.priceString ?? '—'}
                  </Text>
                </View>
                {selected === 'macro_monthly' && (
                  <View style={pw.checkWrap}>
                    <Ionicons name="checkmark-circle" size={20} color={C.accent} />
                  </View>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* CTA */}
          <TouchableOpacity
            style={[pw.ctaBtn, (purchasing || offerLoading) && pw.ctaBtnDim]}
            onPress={handlePurchase}
            activeOpacity={0.85}
            disabled={purchasing || offerLoading}
          >
            {purchasing
              ? <ActivityIndicator color="#fff" />
              : <Text style={pw.ctaTxt}>Activate Premium Access</Text>
            }
          </TouchableOpacity>

          <Text style={pw.legalTxt}>
            Subscription auto-renews unless cancelled 24 hours before the end of the
            billing period. Cancel anytime in your App Store settings.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const pw = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  header: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
    alignItems: 'flex-end',
  },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#E5E5EA',
    alignItems: 'center', justifyContent: 'center',
  },
  scroll: { paddingHorizontal: 24, paddingBottom: 48 },

  heroWrap:   { alignItems: 'center', paddingVertical: 28 },
  headline: {
    fontSize: 30, fontWeight: '800', color: '#1D1D1F',
    textAlign: 'center', letterSpacing: -0.5, marginBottom: 12,
  },
  subtext: {
    fontSize: 15, color: '#86868B', textAlign: 'center', lineHeight: 23,
  },
  tokensEmpty: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 14, paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: 'rgba(255,59,48,0.08)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(255,59,48,0.15)',
  },
  tokensEmptyTxt: { fontSize: 13, fontWeight: '600', color: '#FF3B30' },

  featureList: { marginTop: 4 },
  featureRow:  { marginBottom: 20 },
  featureTag:  { fontSize: 15, fontWeight: '700', color: '#1D1D1F' },
  featureTxt:  { fontSize: 15, fontWeight: '400', color: '#1D1D1F', lineHeight: 22 },

  plansLabel: {
    fontSize: 11, fontWeight: '800', color: '#86868B',
    letterSpacing: 1.2, textTransform: 'uppercase',
    marginTop: 30, marginBottom: 14,
  },

  planCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18,
    marginBottom: 12, borderWidth: 2, borderColor: '#E5E5EA',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  planCardSelected: {
    borderColor: C.accent,
    shadowColor: C.accent, shadowOpacity: 0.12,
  },
  planTop:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planName: { fontSize: 17, fontWeight: '700', color: '#1D1D1F', marginBottom: 3 },
  planDesc: { fontSize: 12, color: '#86868B' },
  planPrice:{ fontSize: 22, fontWeight: '800', color: '#1D1D1F' },
  checkWrap:{ position: 'absolute', top: 14, right: 14 },

  saveBadge: {
    marginTop: 5, backgroundColor: C.accent,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    alignSelf: 'flex-end',
  },
  saveBadgeTxt: {
    fontSize: 10, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5,
  },

  ctaBtn: {
    backgroundColor: C.accent, borderRadius: 14,
    paddingVertical: 18, alignItems: 'center', justifyContent: 'center',
    marginTop: 28,
    shadowColor: C.accent, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 14, elevation: 5,
  },
  ctaBtnDim: { backgroundColor: 'rgba(0,122,255,0.4)', shadowOpacity: 0 },
  ctaTxt:    { fontSize: 17, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.2 },

  legalTxt: {
    fontSize: 11, color: '#86868B', textAlign: 'center',
    marginTop: 18, lineHeight: 17,
  },
});
