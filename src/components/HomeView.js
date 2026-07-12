import React from 'react';
import {
  Text, View, TextInput, TouchableOpacity, SafeAreaView,
  TouchableWithoutFeedback, Keyboard, KeyboardAvoidingView,
  Platform, ScrollView, Modal, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import MatchRing from './MatchRing';
import PaywallModal from './PaywallModal';
import { showManageSubscriptions } from '../services/billingService';
import { suggestServing, groupByDayAndRestaurant } from '../utils/macroMath';
import { s, C } from '../styles/appStyles';

export default function HomeView({
  targetP, setTargetP, targetC, setTargetC, targetF, setTargetF, hasTargets,
  goFeed, promptQuickScan,
  isPremium, scanTokens, isAdmin, user, logout,
  mealHistory, historyLoading, expandedMealIds, toggleMealExpand, deleteHistoryEntry,
  showPaywall, setShowPaywall,
  // Quick Scan modal
  showQuickScan, setShowQuickScan, quickScanLoading,
  quickScanName, setQuickScanName, quickScanAddr, setQuickScanAddr,
  quickScanItems, quickScanQty, setQuickScanQty,
  quickScanBanner, quickScanMatchPct, quickScanTotals,
  incQuickQty, decQuickQty, confirmQuickScan,
  showQuickScanSubmit, setShowQuickScanSubmit,
  quickScanSubmitStatus, setQuickScanSubmitStatus, quickScanSubmitError, setQuickScanSubmitError,
  handleQuickScanSubmit,
}) {
  const renderQuickItem = (item) => {
    const qty    = quickScanQty[item.name] || 0;
    const active = qty > 0;
    const macro  = [item.protein > 0 ? `${item.protein}P` : '', item.carbs > 0 ? `${item.carbs}C` : '', item.fat > 0 ? `${item.fat}F` : ''].filter(Boolean).join(' · ');
    const scaled = qty > 0 && qty !== 1 ? `  ×${qty.toFixed(1)} = ${Math.round(item.protein*qty)}P ${Math.round(item.carbs*qty)}C ${Math.round(item.fat*qty)}F` : '';
    const itemCal    = item.protein * 4 + (item.carbs||0) * 4 + (item.fat||0) * 9;
    const densityPct = itemCal > 0 ? Math.round((item.protein / itemCal) * 100) : 0;
    const tP = parseFloat(targetP)||0, tC = parseFloat(targetC)||0, tF = parseFloat(targetF)||0;
    const sug = tP > 0 ? suggestServing(item, { protein: tP, carbs: tC, fat: tF }) : null;
    const chipStyle = sug?.limitedBy
      ? { borderColor: 'rgba(255,149,0,0.35)', backgroundColor: 'rgba(255,149,0,0.08)' }
      : { borderColor: 'rgba(0,122,255,0.3)',  backgroundColor: 'rgba(0,122,255,0.06)' };
    const chipColor = sug?.limitedBy ? '#FF9500' : '#007AFF';
    const chipText  = sug
      ? sug.limitedBy
        ? `⚠ ×${sug.servings.toFixed(1)} (${sug.limitedBy} cap) → ${sug.projP}g P`
        : `⚡ ×${sug.servings.toFixed(1)} hits ${sug.projP}g P`
      : null;
    return (
      <View key={item.name} style={[s.menuRow, active && s.menuRowActive]}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={[s.menuName, active && s.menuNameActive]}>{item.name}</Text>
          <View style={s.pillRow}>
            <View style={s.pill}><Text style={s.pillTxt}>{macro}{scaled}</Text></View>
            {item.isAIResult && item.dataSource !== 'userCorrected' && <View style={s.tagAI}><Text style={s.tagAITxt}>✨ AI</Text></View>}
            {densityPct > 0 && <View style={s.densityBadge}><Text style={s.densityBadgeTxt}>{densityPct}% P</Text></View>}
          </View>
          {chipText && (
            <TouchableOpacity
              style={[s.coachChip, chipStyle]}
              onPress={() => setQuickScanQty(p => ({ ...p, [item.name]: sug.servings }))}
              activeOpacity={0.75}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={[s.coachChipTxt, { color: chipColor }]}>{chipText}</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={s.stepRow}>
          <TouchableOpacity style={[s.stepBtn, !qty && s.stepBtnDim]} onPress={() => decQuickQty(item.name)} hitSlop={{ top:10, bottom:10, left:10, right:6 }} activeOpacity={qty ? 0.65 : 1}>
            <Text style={[s.stepIcon, !qty && s.stepIconDim]}>−</Text>
          </TouchableOpacity>
          <Text style={[s.stepCount, active && s.stepCountActive]}>{qty ? qty.toFixed(1) : '0'}</Text>
          <TouchableOpacity style={s.stepBtn} onPress={() => incQuickQty(item.name)} hitSlop={{ top:10, bottom:10, left:6, right:10 }} activeOpacity={0.65}>
            <Text style={s.stepIcon}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView contentContainerStyle={s.homeScroll} keyboardShouldPersistTaps="handled">
            <View style={s.homeTitleBlock}>
              <Text style={s.homeTitle}>MacroDecide</Text>
              <Text style={s.homeSub}>What are you targeting this meal?</Text>
            </View>

            <View style={s.homeCard}>
              {[
                { label: 'Protein (g)', val: targetP, set: setTargetP },
                { label: 'Carbs (g)',   val: targetC, set: setTargetC },
                { label: 'Fat (g)',     val: targetF, set: setTargetF },
              ].map(({ label, val, set }, i, arr) => (
                <View key={label} style={s.inputGroup}>
                  <Text style={s.inputLabel}>{label}</Text>
                  <TextInput
                    style={s.inputField} value={val} onChangeText={set}
                    keyboardType="numeric" placeholder="0" placeholderTextColor={C.muted}
                    returnKeyType={i < arr.length - 1 ? 'next' : 'done'}
                    onSubmitEditing={i === arr.length - 1 ? Keyboard.dismiss : undefined}
                  />
                </View>
              ))}
            </View>
            <TouchableOpacity style={[s.ctaBtn, !hasTargets && s.ctaBtnDim]}
              onPress={hasTargets ? goFeed : undefined} activeOpacity={hasTargets ? 0.85 : 1}>
              <Ionicons name="restaurant-outline" size={20} color={C.white} style={{ marginRight: 10 }} />
              <Text style={s.ctaTxt}>Find My Meal</Text>
            </TouchableOpacity>

            {/* ── OR divider ───────────────────────────────────────────── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 14 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
              <Text style={{ marginHorizontal: 12, fontSize: 12, fontWeight: '800', color: C.muted, letterSpacing: 1 }}>OR</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
            </View>

            {/* ── Scan Any Menu CTA ─────────────────────────────────────── */}
            <TouchableOpacity
              style={{
                backgroundColor: C.card, borderRadius: 14, padding: 16,
                flexDirection: 'row', alignItems: 'center', marginBottom: 8,
                shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
              }}
              onPress={promptQuickScan}
              activeOpacity={0.78}
            >
              <View style={{
                width: 42, height: 42, borderRadius: 10,
                backgroundColor: 'rgba(0,122,255,0.1)',
                alignItems: 'center', justifyContent: 'center', marginRight: 14,
              }}>
                <Ionicons name="camera-outline" size={22} color={C.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.gray, marginBottom: 2 }}>Scan Any Menu</Text>
                {isPremium ? (
                  <Text style={{ fontSize: 12, color: '#34C759', fontWeight: '600' }}>Premium · Unlimited scans</Text>
                ) : (
                  <Text style={{ fontSize: 12, color: scanTokens > 0 ? C.muted : '#FF3B30' }}>
                    {scanTokens > 0 ? `${scanTokens} free scan${scanTokens === 1 ? '' : 's'} remaining` : 'No scans left · Upgrade to continue'}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
            </TouchableOpacity>

            {/* ── Admin Panel (isAdmin only) ───────────────────────────── */}
            {isAdmin && (
              <TouchableOpacity
                style={{
                  backgroundColor: 'rgba(255,149,0,0.07)', borderRadius: 14,
                  padding: 16, flexDirection: 'row', alignItems: 'center',
                  marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,149,0,0.18)',
                }}
                activeOpacity={0.78}
              >
                <View style={{
                  width: 42, height: 42, borderRadius: 10,
                  backgroundColor: 'rgba(255,149,0,0.15)',
                  alignItems: 'center', justifyContent: 'center', marginRight: 14,
                }}>
                  <Ionicons name="shield-checkmark-outline" size={22} color="#FF9500" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: '#FF9500', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 }}>Admin</Text>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: C.gray, marginBottom: 1 }}>Community Review</Text>
                  <Text style={{ fontSize: 12, color: C.muted }}>Pending submissions await moderation</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
              </TouchableOpacity>
            )}

            {/* ── Meal History ─────────────────────────────────────────── */}
            <View style={s.historyHeader}>
              <Text style={s.historySectionLabel}>Meal History</Text>
              {mealHistory.length > 0 && (
                <Text style={s.historyCount}>
                  {groupByDayAndRestaurant(mealHistory).reduce((n, g) => n + g.trips.length, 0)} visits
                </Text>
              )}
            </View>

            {historyLoading ? (
              <ActivityIndicator color={C.muted} style={{ marginTop: 20 }} />
            ) : mealHistory.length === 0 ? (
              <View style={s.historyEmpty}>
                <Ionicons name="time-outline" size={32} color={C.muted} />
                <Text style={s.historyEmptyTxt}>{'No meals logged yet.\nConfirm a meal to see it here.'}</Text>
              </View>
            ) : (
              groupByDayAndRestaurant(mealHistory).map(({ dayLabel, trips }) => (
                <View key={dayLabel}>
                  <Text style={s.historyDayLabel}>{dayLabel}</Text>
                  {trips.map((trip) => {
                    const tripId = `${trip[0].restaurant}_${trip[0].timestamp}`;
                    const isExpanded = expandedMealIds.has(tripId);
                    const d = new Date(trip[0].timestamp);
                    const h = d.getHours(), m = d.getMinutes().toString().padStart(2, '0');
                    const timeStr = `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;

                    let totP = 0, totC = 0, totF = 0;
                    for (const e of trip) {
                      totP += (e.protein ?? 0) * e.qty;
                      totC += (e.carbs   ?? 0) * e.qty;
                      totF += (e.fat     ?? 0) * e.qty;
                    }
                    totP = Math.round(totP * 10) / 10;
                    totC = Math.round(totC * 10) / 10;
                    totF = Math.round(totF * 10) / 10;
                    const totCal = Math.round(totP * 4 + totC * 4 + totF * 9);
                    const hasUploaded = trip.some(e => e.source === 'uploaded');

                    return (
                      <TouchableOpacity
                        key={tripId}
                        style={s.mealSessionCard}
                        onPress={() => toggleMealExpand(tripId)}
                        activeOpacity={0.88}
                      >
                        {/* Header */}
                        <View style={s.mealSessionHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.mealSessionTitle}>{trip[0].restaurant}</Text>
                          </View>
                          <View style={s.mealSessionMeta}>
                            <Text style={s.mealSessionTime}>{timeStr}</Text>
                            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={13} color={C.muted} style={{ marginLeft: 6 }} />
                          </View>
                        </View>

                        {/* Totals */}
                        <View style={s.mealSessionTotals}>
                          <View style={s.mealTotalProteinBlock}>
                            <Text style={s.mealTotalProteinNum}>{totP}</Text>
                            <Text style={s.mealTotalProteinLabel}>g protein</Text>
                          </View>
                          <View style={s.mealTotalSecondary}>
                            <Text style={s.mealTotalSecTxt}>{totCal} cal</Text>
                            <Text style={s.mealTotalDot}>·</Text>
                            <Text style={s.mealTotalSecTxt}>{totC}g C</Text>
                            <Text style={s.mealTotalDot}>·</Text>
                            <Text style={s.mealTotalSecTxt}>{totF}g F</Text>
                            {hasUploaded && (
                              <View style={[s.historySourceBadge, s.historySourceBadgeUpl, { marginLeft: 4 }]}>
                                <Text style={[s.historySourceTxt, s.historySourceTxtUpl]}>✨ AI</Text>
                              </View>
                            )}
                          </View>
                        </View>

                        {/* Expanded items */}
                        {isExpanded && (
                          <View style={s.mealExpandedWrap}>
                            {trip.map((entry) => {
                              const eP   = Math.round((entry.protein ?? 0) * entry.qty * 10) / 10;
                              const eC   = Math.round((entry.carbs   ?? 0) * entry.qty * 10) / 10;
                              const eF   = Math.round((entry.fat     ?? 0) * entry.qty * 10) / 10;
                              const eCal = Math.round(eP * 4 + eC * 4 + eF * 9);
                              return (
                                <TouchableOpacity
                                  key={entry.id}
                                  style={s.mealItemRow}
                                  onLongPress={() => deleteHistoryEntry(entry.id)}
                                  delayLongPress={400}
                                  activeOpacity={0.75}
                                >
                                  <View style={s.mealItemHeader}>
                                    <Text style={s.mealItemQty}>{entry.qty.toFixed(1)}×</Text>
                                    <Text style={s.mealItemName} numberOfLines={2}>{entry.itemName}</Text>
                                  </View>
                                  <View style={s.mealItemMacroGrid}>
                                    <View style={[s.mealMacroCell, s.mealMacroCellProtein]}>
                                      <Text style={[s.mealMacroCellVal, s.mealMacroCellValProtein]}>{eP}g</Text>
                                      <Text style={[s.mealMacroCellLabel, s.mealMacroCellLabelProtein]}>Protein</Text>
                                    </View>
                                    {[
                                      { label: 'Cal',   val: String(eCal) },
                                      { label: 'Carbs', val: `${eC}g` },
                                      { label: 'Fat',   val: `${eF}g` },
                                    ].map(({ label, val }) => (
                                      <View key={label} style={s.mealMacroCell}>
                                        <Text style={s.mealMacroCellVal}>{val}</Text>
                                        <Text style={s.mealMacroCellLabel}>{label}</Text>
                                      </View>
                                    ))}
                                  </View>
                                </TouchableOpacity>
                              );
                            })}
                            <Text style={s.mealExpandHint}>Long press an item to remove it</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))
            )}
            {/* ── Account Footer ───────────────────────────────────────── */}
            <View style={{ marginTop: 28, marginBottom: 8 }}>
              <Text style={{
                fontSize: 10, fontWeight: '800', color: C.muted,
                letterSpacing: 1.2, textTransform: 'uppercase',
                marginBottom: 10, paddingHorizontal: 2,
              }}>
                Account
              </Text>

              <View style={{
                backgroundColor: C.card, borderRadius: 14,
                borderWidth: 1, borderColor: '#F2F2F7',
                shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
                overflow: 'hidden',
              }}>
                {/* Email display row */}
                <View style={{
                  paddingHorizontal: 16, paddingVertical: 14,
                  borderBottomWidth: 1, borderBottomColor: '#F2F2F7',
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: C.muted, marginBottom: 3 }}>
                    Signed in as
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: '#1D1D1F' }}>
                    {user?.email ?? '—'}
                  </Text>
                </View>

                {/* ── Subscription / usage row ────────────────────────── */}
                <TouchableOpacity
                  style={{
                    paddingHorizontal: 16, paddingVertical: 14,
                    borderBottomWidth: 1, borderBottomColor: '#F2F2F7',
                    flexDirection: 'row', alignItems: 'center',
                  }}
                  onPress={isPremium ? undefined : () => setShowPaywall(true)}
                  activeOpacity={isPremium ? 1 : 0.65}
                >
                  <View style={{
                    width: 34, height: 34, borderRadius: 9,
                    backgroundColor: isPremium ? 'rgba(52,199,89,0.1)' : 'rgba(0,122,255,0.08)',
                    alignItems: 'center', justifyContent: 'center', marginRight: 12,
                  }}>
                    <Ionicons
                      name={isPremium ? 'star' : 'scan-outline'}
                      size={17}
                      color={isPremium ? '#34C759' : C.accent}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#1D1D1F', marginBottom: 3 }}>
                      {isPremium ? 'Premium Access' : 'Free Plan'}
                    </Text>
                    {isPremium ? (
                      <Text style={{ fontSize: 12, color: '#34C759', fontWeight: '500' }}>
                        Active · Unlimited scans
                      </Text>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                          {[0, 1, 2].map(i => (
                            <View key={i} style={{
                              width: 8, height: 8, borderRadius: 4,
                              backgroundColor: i < Math.min(Math.max(scanTokens, 0), 3)
                                ? C.accent : '#D1D1D6',
                            }} />
                          ))}
                        </View>
                        <Text style={{ fontSize: 12, color: scanTokens <= 0 ? '#FF3B30' : C.muted }}>
                          {scanTokens <= 0
                            ? 'No scans left'
                            : `${scanTokens} of 3 scan${scanTokens === 1 ? '' : 's'} remaining`}
                        </Text>
                      </View>
                    )}
                  </View>

                  {isPremium ? (
                    <View style={{
                      backgroundColor: 'rgba(52,199,89,0.12)', borderRadius: 7,
                      paddingHorizontal: 9, paddingVertical: 4,
                    }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#34C759' }}>Active</Text>
                    </View>
                  ) : (
                    <View style={{
                      backgroundColor: C.accent, borderRadius: 8,
                      paddingHorizontal: 11, paddingVertical: 6,
                    }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Upgrade</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* ── Subscription Status Card ────────────────────────── */}
                <View style={{
                  paddingHorizontal: 16, paddingVertical: 14,
                  borderBottomWidth: 1, borderBottomColor: '#F2F2F7',
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, fontWeight: '500', color: '#86868B' }}>
                      Current Tier
                    </Text>
                    {isPremium ? (
                      <View style={{
                        backgroundColor: 'rgba(0,122,255,0.1)', borderRadius: 20,
                        paddingHorizontal: 11, paddingVertical: 4,
                      }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#007AFF', letterSpacing: 0.1 }}>
                          MacroDecide Premium
                        </Text>
                      </View>
                    ) : (
                      <View style={{
                        backgroundColor: '#F2F2F7', borderRadius: 20,
                        paddingHorizontal: 11, paddingVertical: 4,
                      }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#86868B' }}>
                          Free Tier
                        </Text>
                      </View>
                    )}
                  </View>
                  {!isPremium && (
                    <Text style={{ fontSize: 11, color: '#86868B', marginTop: 7 }}>
                      {`Remaining Scans Today: ${Math.max(scanTokens, 0)} / 3`}
                    </Text>
                  )}
                </View>

                {/* Manage Subscription / Upgrade row */}
                {isPremium ? (
                  <TouchableOpacity
                    style={{
                      paddingHorizontal: 16, paddingVertical: 14,
                      borderBottomWidth: 1, borderBottomColor: '#F2F2F7',
                      flexDirection: 'row', alignItems: 'center',
                    }}
                    onPress={() => showManageSubscriptions().catch(() => {})}
                    activeOpacity={0.65}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#1D1D1F', marginBottom: 3 }}>
                        Manage Subscription
                      </Text>
                      <Text style={{ fontSize: 12, color: C.muted }}>
                        Active Plan — Tap to manage or cancel
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={C.muted} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={{
                      paddingHorizontal: 16, paddingVertical: 14,
                      borderBottomWidth: 1, borderBottomColor: '#F2F2F7',
                      flexDirection: 'row', alignItems: 'center',
                    }}
                    onPress={() => setShowPaywall(true)}
                    activeOpacity={0.65}
                  >
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: C.accent }}>
                      Upgrade to Premium
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={C.muted} />
                  </TouchableOpacity>
                )}

                {/* Sign Out row */}
                <TouchableOpacity
                  onPress={logout}
                  activeOpacity={0.65}
                  style={{ paddingHorizontal: 16, paddingVertical: 16 }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#FF3B30' }}>
                    Sign Out
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* ── Quick Scan Modal ────────────────────────────────────────────── */}
      <Modal
        visible={showQuickScan}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { if (!quickScanLoading) setShowQuickScan(false); }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => { if (!quickScanLoading) setShowQuickScan(false); }} style={s.headerIcon} activeOpacity={0.7}>
              <Ionicons name="close-outline" size={22} color={C.accent} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Quick Scan</Text>
            <TouchableOpacity onPress={promptQuickScan} style={s.headerIcon} disabled={quickScanLoading} activeOpacity={0.7}>
              <Ionicons name="camera-outline" size={20} color={quickScanLoading ? C.muted : C.accent} />
            </TouchableOpacity>
          </View>

          {quickScanLoading ? (
            <View style={s.center}>
              <ActivityIndicator size="large" color={C.accent} />
              <Text style={s.centerTxt}>Analyzing menu photo…</Text>
            </View>
          ) : (
            <>
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                {/* Restaurant label input */}
                <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
                  <Text style={[s.inputLabel, { marginBottom: 6 }]}>Label this scan</Text>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center',
                    backgroundColor: C.card, borderRadius: 10,
                    borderWidth: 1, borderColor: C.border,
                    paddingHorizontal: 12, paddingVertical: 11,
                  }}>
                    <Ionicons name="restaurant-outline" size={15} color={C.muted} style={{ marginRight: 10 }} />
                    <TextInput
                      style={{ flex: 1, fontSize: 15, color: C.gray, fontWeight: '500' }}
                      value={quickScanName}
                      onChangeText={setQuickScanName}
                      placeholder="Restaurant name (optional)"
                      placeholderTextColor={C.muted}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                  </View>
                </View>

                {/* Smart suggestion banner */}
                {quickScanBanner && (
                  <View style={[
                    s.recCard, { borderLeftWidth: 4 },
                    quickScanBanner.isWarning
                      ? { backgroundColor: 'rgba(255,149,0,0.08)', borderColor: 'rgba(255,149,0,0.25)', borderLeftColor: '#FF9500' }
                      : { borderLeftColor: quickScanBanner.isPerfect ? '#34C759' : C.accent },
                  ]}>
                    <View style={s.recHeaderRow}>
                      <Ionicons
                        name={quickScanBanner.isWarning ? 'warning-outline' : 'flash'} size={13}
                        color={quickScanBanner.isWarning ? '#FF9500' : quickScanBanner.isPerfect ? '#34C759' : C.accent}
                      />
                      <Text style={[s.recHeaderTxt,
                        quickScanBanner.isWarning && { color: '#FF9500' },
                        quickScanBanner.isPerfect && { color: '#34C759' },
                      ]}>
                        {quickScanBanner.isWarning ? 'Cap Warning' : quickScanBanner.isPerfect ? 'Perfect Match' : 'Smart Suggestion'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
                      <Text style={{
                        flex: 1, fontSize: 15, fontWeight: '800', lineHeight: 22, marginRight: 10,
                        color: quickScanBanner.isWarning ? '#FF9500' : quickScanBanner.isPerfect ? '#34C759' : C.accent,
                      }}>
                        {quickScanBanner.text}
                      </Text>
                      <TouchableOpacity
                        style={[s.recLogBtn, { alignSelf: 'flex-start' }, quickScanBanner.isWarning && { backgroundColor: '#FF9500' }]}
                        onPress={() => setQuickScanQty(p => ({ ...p, [quickScanBanner.item.name]: quickScanBanner.sug.servings }))}
                        activeOpacity={0.82}
                      >
                        <Text style={s.recLogBtnTxt}>Apply</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={s.recMacroTxt}>
                      ~{quickScanBanner.projP}g P · {quickScanBanner.projC}g C · {quickScanBanner.projF}g F
                    </Text>
                  </View>
                )}

                {/* Match ring (appears once items are selected) */}
                {Object.values(quickScanQty).some(q => q > 0) && (
                  <View style={[s.matchBar, { marginHorizontal: 14, marginTop: 8, borderRadius: 14, borderWidth: 1, borderColor: '#F2F2F7' }]}>
                    <MatchRing percentage={quickScanMatchPct} size={72} />
                    <View style={s.barsWrap}>
                      {[
                        { label: 'P', val: quickScanTotals.protein, target: parseFloat(targetP)||0, color: '#007AFF' },
                        { label: 'C', val: quickScanTotals.carbs,   target: parseFloat(targetC)||0, color: '#34C759' },
                        { label: 'F', val: quickScanTotals.fat,      target: parseFloat(targetF)||0, color: '#FF9500' },
                      ].map(({ label, val, target, color }) => {
                        const pct = target > 0 ? Math.min(100, (val / target) * 100) : 0;
                        const over = target > 0 && val > target;
                        return (
                          <View key={label} style={s.barRow}>
                            <Text style={s.barLabel}>{label}</Text>
                            <View style={s.barTrack}><View style={[s.barFill, { width: `${pct}%`, backgroundColor: over ? '#FF3B30' : color }]} /></View>
                            <Text style={[s.barValue, over && s.barValueOver]}>{val}<Text style={s.barTarget}>/{target}g</Text></Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Recommended item (pinned from banner) */}
                {quickScanBanner && (
                  <View style={s.section}>
                    <Text style={[s.sectionLabel, {
                      color: quickScanBanner.isWarning ? '#FF9500' : quickScanBanner.isPerfect ? '#34C759' : C.accent,
                    }]}>
                      {quickScanBanner.isWarning ? '⚠ Recommended For You' : '⚡ Recommended For You'}
                    </Text>
                    {renderQuickItem(quickScanBanner.item)}
                  </View>
                )}

                {/* All remaining items */}
                <View style={s.section}>
                  <Text style={s.sectionLabel}>✨ All Scanned Items</Text>
                  {quickScanItems
                    .filter(i => i.name !== quickScanBanner?.item?.name)
                    .sort((a, b) => {
                      const calA = a.protein*4+(a.carbs||0)*4+(a.fat||0)*9;
                      const calB = b.protein*4+(b.carbs||0)*4+(b.fat||0)*9;
                      const dA = calA > 0 ? a.protein/calA : 0;
                      const dB = calB > 0 ? b.protein/calB : 0;
                      return dB - dA;
                    })
                    .map(renderQuickItem)}
                </View>

                {/* Submit to Community */}
                <TouchableOpacity
                  style={s.submitDbBtn}
                  onPress={() => { setQuickScanSubmitStatus('idle'); setQuickScanSubmitError(''); setShowQuickScanSubmit(true); }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="cloud-upload-outline" size={16} color={C.white} style={{ marginRight: 8 }} />
                  <Text style={s.submitDbBtnTxt}>Submit to Community Database</Text>
                </TouchableOpacity>

                <View style={{ height: 120 }} />
              </ScrollView>

              {/* Log Meal bottom bar */}
              <View style={s.confirmWrap}>
                {Object.values(quickScanQty).some(q => q > 0) && (
                  <View style={s.confirmSummary}>
                    <Text style={s.confirmSummaryTxt}>
                      {quickScanTotals.protein}g P · {quickScanTotals.carbs}g C · {quickScanTotals.fat}g F
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[s.confirmBtn, !Object.values(quickScanQty).some(q => q > 0) && s.confirmBtnDim]}
                  onPress={Object.values(quickScanQty).some(q => q > 0) ? confirmQuickScan : undefined}
                  activeOpacity={Object.values(quickScanQty).some(q => q > 0) ? 0.85 : 1}
                >
                  <Text style={s.confirmBtnTxt}>
                    {Object.values(quickScanQty).some(q => q > 0) ? 'Log Meal →' : 'Select items above'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Community Submit Modal */}
          <Modal visible={showQuickScanSubmit} transparent animationType="fade" onRequestClose={() => quickScanSubmitStatus !== 'loading' && setShowQuickScanSubmit(false)}>
            <TouchableWithoutFeedback onPress={() => quickScanSubmitStatus !== 'loading' && setShowQuickScanSubmit(false)}>
              <View style={s.modalOverlay}>
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                  <View style={s.modalCard}>
                    {quickScanSubmitStatus === 'success' ? (
                      <>
                        <Text style={s.modalTitle}>Submitted!</Text>
                        <Text style={[s.modalSub, { marginBottom: 20 }]}>
                          Thanks for contributing. Our team will review it before adding it to the community database.
                        </Text>
                        <TouchableOpacity style={s.modalSaveBtn} onPress={() => setShowQuickScanSubmit(false)} activeOpacity={0.85}>
                          <Text style={s.modalSaveTxt}>Done</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <Text style={s.modalTitle}>Submit to Community</Text>
                        <Text style={s.modalSub}>Help other macro-conscious eaters find this spot.</Text>

                        <Text style={s.modalFieldLabel}>Restaurant Name</Text>
                        <TextInput
                          style={s.modalNameInput}
                          value={quickScanName}
                          onChangeText={setQuickScanName}
                          placeholder="e.g. Joe's Diner"
                          placeholderTextColor={C.muted}
                          returnKeyType="next"
                        />

                        <Text style={s.modalFieldLabel}>Street Address / Location</Text>
                        <TextInput
                          style={s.modalNameInput}
                          value={quickScanAddr}
                          onChangeText={setQuickScanAddr}
                          placeholder="e.g. 123 Main St, Austin TX 78701"
                          placeholderTextColor={C.muted}
                          returnKeyType="done"
                          onSubmitEditing={Keyboard.dismiss}
                        />

                        <Text style={s.submitItemCount}>{quickScanItems.length} item{quickScanItems.length !== 1 ? 's' : ''} · will be marked pending review</Text>
                        {!!quickScanSubmitError && <Text style={s.submitErrorTxt}>{quickScanSubmitError}</Text>}

                        <View style={s.modalBtnRow}>
                          <TouchableOpacity style={s.modalCancelBtn} onPress={() => setShowQuickScanSubmit(false)} activeOpacity={0.75}>
                            <Text style={s.modalCancelTxt}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[s.modalSaveBtn, quickScanSubmitStatus === 'loading' && { opacity: 0.6 }]}
                            onPress={handleQuickScanSubmit}
                            disabled={quickScanSubmitStatus === 'loading'}
                            activeOpacity={0.85}
                          >
                            {quickScanSubmitStatus === 'loading'
                              ? <ActivityIndicator size="small" color={C.white} />
                              : <Text style={s.modalSaveTxt}>Submit →</Text>
                            }
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </View>
                </TouchableWithoutFeedback>
              </View>
            </TouchableWithoutFeedback>
          </Modal>
        </SafeAreaView>
      </Modal>

      {/* ── Paywall Modal ───────────────────────────────────────────── */}
      <PaywallModal visible={showPaywall} onClose={() => setShowPaywall(false)} />
    </SafeAreaView>
  );
}
