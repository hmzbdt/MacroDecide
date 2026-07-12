import React from 'react';
import {
  Text, View, TextInput, TouchableOpacity, SafeAreaView,
  TouchableWithoutFeedback, Keyboard, ScrollView, Modal, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import MatchRing from './MatchRing';
import ChipotleBuilder from './ChipotleBuilder';
import PortionStepper from './PortionStepper';
import PaywallModal from './PaywallModal';
import { suggestServing } from '../utils/macroMath';
import { s, C } from '../styles/appStyles';

export default function DetailView({
  setView, goHome, selName,
  targetP, targetC, targetF,
  menuItems, ocrItems, itemQty, setItemQty, incQty, decQty,
  stepDraft, setStepDraft,
  totals, matchPct, menuFromCache, menuLoading,
  promptScan, ocrLoading, ocrFromCache, clearOcrCache,
  instructionBanner, uploadedBanner, rec,
  activeMenuTab, setActiveMenuTab,
  openEdit,
  editItem, setEditItem, editName, setEditName,
  editP, setEditP, editC, setEditC, editF, setEditF, saveMacroEdit,
  openSubmitModal, showSubmitModal, setShowSubmitModal,
  submitRestName, setSubmitRestName, submitAddr, setSubmitAddr,
  submitStatus, submitError, handleSubmitToDb,
  confirmMeal,
  showPaywall, setShowPaywall,
}) {
  const tP = parseFloat(targetP)||0, tC = parseFloat(targetC)||0, tF = parseFloat(targetF)||0;
  const items     = menuItems ?? [];
  const densityOf = i => { const c = i.protein * 4 + (i.carbs || 0) * 4 + (i.fat || 0) * 9; return c > 0 ? i.protein / c : 0; };
  const pinnedName = instructionBanner?.item?.name;
  const proteins  = items.filter(i => i.category === 'protein' && i.name !== pinnedName).sort((a, b) => densityOf(b) - densityOf(a));
  const bases     = items.filter(i => i.category === 'base').sort((a, b) => densityOf(b) - densityOf(a));
  const addons    = items.filter(i => i.category === 'addon').sort((a, b) => densityOf(b) - densityOf(a));
  const uploadedPinnedName  = uploadedBanner?.item?.name;
  const uploadedItemsSorted = ocrItems.filter(i => i.name !== uploadedPinnedName).sort((a, b) => densityOf(b) - densityOf(a));
  const hasMenu   = items.length > 0 || ocrItems.length > 0;
  const hasSelect = Object.values(itemQty).some(q => q > 0);

  const renderItem = (item) => {
    const qty    = itemQty[item.name] || 0;
    const active = qty > 0;
    const macro  = [item.protein > 0 ? `${item.protein}P` : '', item.carbs > 0 ? `${item.carbs}C` : '', item.fat > 0 ? `${item.fat}F` : ''].filter(Boolean).join(' · ');
    const scaled = qty > 0 && qty !== 1 ? `  ×${qty.toFixed(1)} = ${Math.round(item.protein*qty)}P ${Math.round(item.carbs*qty)}C ${Math.round(item.fat*qty)}F` : '';

    const itemCal = item.protein * 4 + (item.carbs || 0) * 4 + (item.fat || 0) * 9;
    const densityPct = itemCal > 0 ? Math.round((item.protein / itemCal) * 100) : 0;

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
          <TouchableOpacity onPress={() => openEdit(item)} activeOpacity={0.7}>
            <Text style={[s.menuName, active && s.menuNameActive]}>{item.name}</Text>
            <View style={s.pillRow}>
              <View style={s.pill}><Text style={s.pillTxt}>{macro}{scaled}</Text></View>
              {item.dataSource === 'verified' && <View style={s.tagOfficial}><Text style={s.tagOfficialTxt}>★ OFFICIAL</Text></View>}
              {item.isAIResult && item.dataSource !== 'userCorrected' && <View style={s.tagAI}><Text style={s.tagAITxt}>✨ AI</Text></View>}
              {item.dataSource === 'userCorrected' && <View style={s.tagEdited}><Text style={s.tagEditedTxt}>✏️ Edited</Text></View>}
              {densityPct > 0 && <View style={s.densityBadge}><Text style={s.densityBadgeTxt}>{densityPct}% P</Text></View>}
            </View>
          </TouchableOpacity>
          {chipText && (
            <TouchableOpacity
              style={[s.coachChip, chipStyle]}
              onPress={() => setItemQty(p => ({ ...p, [item.name]: sug.servings }))}
              activeOpacity={0.75}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={[s.coachChipTxt, { color: chipColor }]}>{chipText}</Text>
            </TouchableOpacity>
          )}
        </View>
        <PortionStepper
          qty={qty}
          onInc={() => incQty(item.name)}
          onDec={() => decQty(item.name)}
          editable
          isDrafting={stepDraft.name === item.name}
          draftValue={stepDraft.text}
          onDraftChange={(t) => {
            const sanitized = t.replace(/[^0-9.]/g, '').match(/^\d*\.?\d?/)?.[0] ?? '';
            setStepDraft({ name: item.name, text: sanitized });
          }}
          onDraftBlur={() => {
            if (stepDraft.name !== item.name) return;
            const v = parseFloat(stepDraft.text);
            const n = isNaN(v) || v <= 0 ? 0 : Math.round(Math.min(v, 99) * 10) / 10;
            setItemQty(p => {
              if (n === 0) { const r = { ...p }; delete r[item.name]; return r; }
              return { ...p, [item.name]: n };
            });
            setStepDraft({ name: null, text: '' });
          }}
        />
      </View>
    );
  };

  const renderSection = (label, arr) => arr?.length
    ? <View style={s.section}><Text style={s.sectionLabel}>{label}</Text>{arr.map(renderItem)}</View>
    : null;

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => setView('feed')} style={s.headerIcon} activeOpacity={0.7}>
          <Ionicons name="arrow-back-outline" size={20} color={C.accent} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{selName}</Text>
        <TouchableOpacity onPress={goHome} style={s.headerIcon} activeOpacity={0.7}>
          <Ionicons name="home-outline" size={20} color={C.gray} />
        </TouchableOpacity>
      </View>

      {/* Macro match bar */}
      <View style={s.matchBar}>
        <MatchRing percentage={matchPct} size={80} />
        <View style={s.barsWrap}>
          {[
            { label: 'P', val: totals.protein, target: tP, color: '#007AFF' },
            { label: 'C', val: totals.carbs,   target: tC, color: '#34C759' },
            { label: 'F', val: totals.fat,      target: tF, color: '#FF9500' },
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
          {menuFromCache && <Text style={s.cachedLabel}>⚡ Cached</Text>}
        </View>
      </View>

      {/* Scan button */}
      <View style={s.scanRow}>
        <TouchableOpacity style={s.scanBtn} onPress={promptScan} disabled={ocrLoading} activeOpacity={0.75}>
          {ocrLoading
            ? <ActivityIndicator size="small" color="#007AFF" />
            : <><Ionicons name="camera-outline" size={14} color="#007AFF" style={{ marginRight: 6 }} /><Text style={s.scanBtnTxt}>Scan Physical Menu</Text></>
          }
        </TouchableOpacity>
      </View>

      {menuLoading || menuItems === null ? (
        <View style={s.center}><ActivityIndicator size="large" color={C.accent} /><Text style={s.centerTxt}>Loading menu…</Text></View>
      ) : !hasMenu ? (
        <View style={s.center}>
          <Ionicons name="camera" size={56} color={C.accent} />
          <Text style={s.emptyTitle}>Verified Menu Not Found</Text>
          <Text style={s.emptySub}>Scan the physical menu to add items.</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={promptScan} disabled={ocrLoading} activeOpacity={0.8}>
            {ocrLoading ? <ActivityIndicator size="small" color={C.white} /> : <Text style={s.emptyBtnTxt}>Scan Physical Menu</Text>}
          </TouchableOpacity>
        </View>
      ) : selName === 'Chipotle' ? (
        <ChipotleBuilder menuItems={items} itemQty={itemQty} onInc={incQty} onDec={decQty} />
      ) : (
        <>
          <View style={s.tabBar}>
            <TouchableOpacity style={[s.tabBtn, activeMenuTab === 'official' && s.tabBtnActive]} onPress={() => setActiveMenuTab('official')} activeOpacity={0.8}>
              <Text style={[s.tabBtnTxt, activeMenuTab === 'official' && s.tabBtnTxtActive]}>Official Items</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.tabBtn, activeMenuTab === 'uploaded' && s.tabBtnActive]} onPress={() => setActiveMenuTab('uploaded')} activeOpacity={0.8}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[s.tabBtnTxt, activeMenuTab === 'uploaded' && s.tabBtnTxtActive]}>
                  {`User Uploaded${ocrItems.length > 0 ? ` (${ocrItems.length})` : ''}`}
                </Text>
                {ocrFromCache && (
                  <Ionicons name="time-outline" size={11} color={activeMenuTab === 'uploaded' ? C.white : C.muted} />
                )}
              </View>
            </TouchableOpacity>
          </View>
          {activeMenuTab === 'official' ? (
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {instructionBanner && (
                <View style={[
                  s.recCard,
                  { borderLeftWidth: 4 },
                  instructionBanner.isWarning
                    ? { backgroundColor: 'rgba(255,149,0,0.08)', borderColor: 'rgba(255,149,0,0.25)', borderLeftColor: '#FF9500' }
                    : { borderLeftColor: instructionBanner.isPerfect ? '#34C759' : C.accent },
                ]}>
                  <View style={s.recHeaderRow}>
                    <Ionicons
                      name={instructionBanner.isWarning ? 'warning-outline' : 'flash'}
                      size={13}
                      color={instructionBanner.isWarning ? '#FF9500' : instructionBanner.isPerfect ? '#34C759' : C.accent}
                    />
                    <Text style={[s.recHeaderTxt,
                      instructionBanner.isWarning && { color: '#FF9500' },
                      instructionBanner.isPerfect && { color: '#34C759' },
                    ]}>
                      {instructionBanner.isWarning ? 'Cap Warning' : instructionBanner.isPerfect ? 'Perfect Match' : 'Smart Suggestion'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
                    <Text style={{
                      flex: 1, fontSize: 15, fontWeight: '800', lineHeight: 22, marginRight: 10,
                      color: instructionBanner.isWarning ? '#FF9500' : instructionBanner.isPerfect ? '#34C759' : C.accent,
                    }}>
                      {instructionBanner.text}
                    </Text>
                    <TouchableOpacity
                      style={[s.recLogBtn, { alignSelf: 'flex-start' }, instructionBanner.isWarning && { backgroundColor: '#FF9500' }]}
                      onPress={() => setItemQty(p => ({ ...p, [instructionBanner.item.name]: instructionBanner.sug.servings }))}
                      activeOpacity={0.82}
                    >
                      <Text style={s.recLogBtnTxt}>Apply Suggestion</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={s.recMacroTxt}>
                    ~{instructionBanner.projP}g P · {instructionBanner.projC}g C · {instructionBanner.projF}g F
                  </Text>
                </View>
              )}
              {instructionBanner && (
                <View style={s.section}>
                  <Text style={[s.sectionLabel, {
                    color: instructionBanner.isWarning ? '#FF9500' : instructionBanner.isPerfect ? '#34C759' : C.accent,
                  }]}>
                    {instructionBanner.isWarning ? '⚠ Recommended For You' : '⚡ Recommended For You'}
                  </Text>
                  {renderItem(instructionBanner.item)}
                </View>
              )}
              {rec && (
                <View style={s.recCard}>
                  <View style={s.recHeaderRow}>
                    <Ionicons name="flash" size={13} color={C.accent} />
                    <Text style={s.recHeaderTxt}>Smart Recommendation</Text>
                  </View>
                  <Text style={s.recBody}>
                    {'To hit your targets, we recommend:\n'}
                    <Text style={s.recHighlight}>{rec.sentence}</Text>
                  </Text>
                  {rec.isHighOnFat && (
                    <Text style={s.recNote}>✓ Dry rub selected — tight fat budget today</Text>
                  )}
                  <View style={s.recFooter}>
                    <Text style={s.recMacroTxt}>
                      ~{rec.estimatedMacros.protein}g P · {rec.estimatedMacros.carbs}g C · {rec.estimatedMacros.fat}g F
                    </Text>
                    <TouchableOpacity
                      style={s.recLogBtn}
                      onPress={() => setItemQty(rec.logQty)}
                      activeOpacity={0.82}
                    >
                      <Text style={s.recLogBtnTxt}>Add to Log</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              {items.length === 0 && (
                <View style={[s.center, { marginTop: 24 }]}>
                  <Text style={s.centerTxt}>{'No official menu data.\nUse "User Uploaded" to add items via scan.'}</Text>
                </View>
              )}
              {renderSection('PROTEINS', proteins)}
              {renderSection('BASES',    bases)}
              {renderSection('ADD-ONS',  addons)}
              <View style={{ height: 120 }} />
            </ScrollView>
          ) : (
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {ocrLoading ? (
                <View style={[s.center, { marginTop: 40 }]}>
                  <ActivityIndicator size="large" color={C.accent} />
                  <Text style={s.centerTxt}>Analyzing menu photo…</Text>
                </View>
              ) : ocrItems.length === 0 ? (
                <View style={s.center}>
                  <Ionicons name="cloud-upload-outline" size={48} color={C.muted} />
                  <Text style={[s.emptyTitle, { marginTop: 8 }]}>No Uploaded Items</Text>
                  <Text style={s.emptySub}>{'Tap "Scan Physical Menu" above to add items.'}</Text>
                </View>
              ) : (
                <>
                  {ocrFromCache && (
                    <View style={s.ocrCacheBar}>
                      <Ionicons name="time-outline" size={12} color={C.muted} />
                      <Text style={s.ocrCacheTxt}>Loaded from cache</Text>
                      <TouchableOpacity onPress={clearOcrCache} style={s.ocrRescanBtn} activeOpacity={0.8}>
                        <Text style={s.ocrRescanTxt}>Re-scan</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {uploadedBanner && (
                    <View style={[
                      s.recCard,
                      { borderLeftWidth: 4 },
                      uploadedBanner.isWarning
                        ? { backgroundColor: 'rgba(255,149,0,0.08)', borderColor: 'rgba(255,149,0,0.25)', borderLeftColor: '#FF9500' }
                        : { borderLeftColor: uploadedBanner.isPerfect ? '#34C759' : C.accent },
                    ]}>
                      <View style={s.recHeaderRow}>
                        <Ionicons
                          name={uploadedBanner.isWarning ? 'warning-outline' : 'flash'}
                          size={13}
                          color={uploadedBanner.isWarning ? '#FF9500' : uploadedBanner.isPerfect ? '#34C759' : C.accent}
                        />
                        <Text style={[s.recHeaderTxt,
                          uploadedBanner.isWarning && { color: '#FF9500' },
                          uploadedBanner.isPerfect && { color: '#34C759' },
                        ]}>
                          {uploadedBanner.isWarning ? 'Cap Warning' : uploadedBanner.isPerfect ? 'Perfect Match' : 'Smart Suggestion'}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
                        <Text style={{
                          flex: 1, fontSize: 15, fontWeight: '800', lineHeight: 22, marginRight: 10,
                          color: uploadedBanner.isWarning ? '#FF9500' : uploadedBanner.isPerfect ? '#34C759' : C.accent,
                        }}>
                          {uploadedBanner.text}
                        </Text>
                        <TouchableOpacity
                          style={[s.recLogBtn, { alignSelf: 'flex-start' }, uploadedBanner.isWarning && { backgroundColor: '#FF9500' }]}
                          onPress={() => setItemQty(p => ({ ...p, [uploadedBanner.item.name]: uploadedBanner.sug.servings }))}
                          activeOpacity={0.82}
                        >
                          <Text style={s.recLogBtnTxt}>Apply Suggestion</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={s.recMacroTxt}>
                        ~{uploadedBanner.projP}g P · {uploadedBanner.projC}g C · {uploadedBanner.projF}g F
                      </Text>
                    </View>
                  )}
                  {uploadedBanner && (
                    <View style={s.section}>
                      <Text style={[s.sectionLabel, {
                        color: uploadedBanner.isWarning ? '#FF9500' : uploadedBanner.isPerfect ? '#34C759' : C.accent,
                      }]}>
                        {uploadedBanner.isWarning ? '⚠ Recommended For You' : '⚡ Recommended For You'}
                      </Text>
                      {renderItem(uploadedBanner.item)}
                    </View>
                  )}
                  <View style={s.section}>
                    <Text style={s.sectionLabel}>✨ All Scanned Items</Text>
                    {uploadedItemsSorted.map(renderItem)}
                  </View>
                  <TouchableOpacity style={s.submitDbBtn} onPress={openSubmitModal} activeOpacity={0.85}>
                    <Ionicons name="cloud-upload-outline" size={16} color={C.white} style={{ marginRight: 8 }} />
                    <Text style={s.submitDbBtnTxt}>Submit Menu to Community Database</Text>
                  </TouchableOpacity>
                </>
              )}
              <View style={{ height: 120 }} />
            </ScrollView>
          )}
        </>
      )}

      {/* Confirm */}
      <View style={s.confirmWrap}>
        {hasSelect && (
          <View style={s.confirmSummary}>
            <Text style={s.confirmSummaryTxt}>{totals.protein}g P · {totals.carbs}g C · {totals.fat}g F</Text>
          </View>
        )}
        <TouchableOpacity
          style={[s.confirmBtn, !hasSelect && s.confirmBtnDim]}
          onPress={hasSelect ? confirmMeal : undefined}
          activeOpacity={hasSelect ? 0.85 : 1}
        >
          <Text style={s.confirmBtnTxt}>{hasSelect ? 'Confirm Meal →' : 'Select items above'}</Text>
        </TouchableOpacity>
      </View>

      {/* Macro edit modal */}
      <Modal visible={!!editItem} transparent animationType="fade" onRequestClose={() => setEditItem(null)}>
        <TouchableWithoutFeedback onPress={() => setEditItem(null)}>
          <View style={s.modalOverlay}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={s.modalCard}>
                <Text style={s.modalTitle}>Edit Macros</Text>
                <Text style={s.modalSub}>Tap to rename · saved & cached immediately</Text>
                <TextInput style={s.modalNameInput} value={editName} onChangeText={setEditName}
                  placeholder="Item name" placeholderTextColor={C.muted} returnKeyType="done" onSubmitEditing={Keyboard.dismiss} />
                <View style={s.modalFields}>
                  {[
                    { label: 'Protein', value: editP, set: setEditP },
                    { label: 'Carbs',   value: editC, set: setEditC },
                    { label: 'Fat',     value: editF, set: setEditF },
                  ].map(({ label, value, set }) => (
                    <View key={label} style={s.modalField}>
                      <Text style={s.modalFieldLabel}>{label}</Text>
                      <View style={s.modalFieldWrap}>
                        <TextInput style={s.modalFieldInput} value={value} onChangeText={set}
                          keyboardType="numeric" selectTextOnFocus maxLength={4} placeholderTextColor={C.muted} />
                        <Text style={s.modalFieldUnit}>g</Text>
                      </View>
                    </View>
                  ))}
                </View>
                <View style={s.modalBtnRow}>
                  <TouchableOpacity style={s.modalCancelBtn} onPress={() => setEditItem(null)} activeOpacity={0.75}>
                    <Text style={s.modalCancelTxt}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.modalSaveBtn} onPress={saveMacroEdit} activeOpacity={0.85}>
                    <Text style={s.modalSaveTxt}>Save →</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── Community Submit Modal ──────────────────────────────────── */}
      <Modal visible={showSubmitModal} transparent animationType="fade" onRequestClose={() => submitStatus !== 'loading' && setShowSubmitModal(false)}>
        <TouchableWithoutFeedback onPress={() => submitStatus !== 'loading' && setShowSubmitModal(false)}>
          <View style={s.modalOverlay}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={s.modalCard}>
                {submitStatus === 'success' ? (
                  <>
                    <Text style={s.modalTitle}>Submitted!</Text>
                    <Text style={[s.modalSub, { marginBottom: 20 }]}>
                      Thanks for contributing. Our team will review it before adding it to the community database.
                    </Text>
                    <TouchableOpacity style={s.modalSaveBtn} onPress={() => setShowSubmitModal(false)} activeOpacity={0.85}>
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
                      value={submitRestName}
                      onChangeText={setSubmitRestName}
                      placeholder="e.g. Joe's Diner"
                      placeholderTextColor={C.muted}
                      returnKeyType="next"
                    />

                    <Text style={s.modalFieldLabel}>Street Address / Location</Text>
                    <TextInput
                      style={s.modalNameInput}
                      value={submitAddr}
                      onChangeText={setSubmitAddr}
                      placeholder="e.g. 123 Main St, Austin TX 78701"
                      placeholderTextColor={C.muted}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />

                    <Text style={s.submitItemCount}>{ocrItems.length} item{ocrItems.length !== 1 ? 's' : ''} · will be marked pending review</Text>

                    {!!submitError && <Text style={s.submitErrorTxt}>{submitError}</Text>}

                    <View style={s.modalBtnRow}>
                      <TouchableOpacity style={s.modalCancelBtn} onPress={() => setShowSubmitModal(false)} activeOpacity={0.75}>
                        <Text style={s.modalCancelTxt}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.modalSaveBtn, submitStatus === 'loading' && { opacity: 0.6 }]}
                        onPress={handleSubmitToDb}
                        disabled={submitStatus === 'loading'}
                        activeOpacity={0.85}
                      >
                        {submitStatus === 'loading'
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

      {/* ── Paywall Modal ─────────────────────────────────────────── */}
      <PaywallModal visible={showPaywall} onClose={() => setShowPaywall(false)} />
    </SafeAreaView>
  );
}
