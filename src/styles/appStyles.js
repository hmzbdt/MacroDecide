import { StyleSheet } from 'react-native';

export const C = {
  bg:      '#F5F5F7',  // canvas background
  card:    '#FFFFFF',  // card surfaces
  accent:  '#007AFF',  // Apple Blue — primary action/accent
  success: '#34C759',  // Apple Green — success/match states
  white:   '#ffffff',  // text on colored buttons/badges
  gray:    '#1D1D1F',  // primary text (crisp off-black)
  muted:   '#86868B',  // secondary/label text
  dark:    '#FFFFFF',  // header surface
  border:  '#D1D1D6',  // native iOS border
  track:   '#E5E5EA',  // progress/slider track
  surface: '#F5F5F7',  // secondary fill / input background
};

const card = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 2,
};

export const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // ── Home ────────────────────────────────────────────────────────────────────
  homeScroll:     { flexGrow: 1, padding: 24, paddingTop: 48 },
  homeTitleBlock: { alignItems: 'center', marginBottom: 36 },
  homeTitle:      { fontSize: 34, fontWeight: '800', color: C.gray, letterSpacing: -0.5 },
  homeSub:        { fontSize: 15, color: C.muted, marginTop: 8 },
  homeCard:       { backgroundColor: C.card, borderRadius: 16, padding: 22, marginBottom: 24, ...card },
  inputGroup:     { marginBottom: 16 },
  inputLabel:     { fontSize: 13, color: C.muted, marginBottom: 6, fontWeight: '500', letterSpacing: 0.3 },
  inputField:     { backgroundColor: C.surface, borderRadius: 10, padding: 14, fontSize: 22, fontWeight: '700', color: C.gray, textAlign: 'center', borderWidth: 1, borderColor: C.border },
  ctaBtn:         { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  ctaBtnDim:      { backgroundColor: 'rgba(0,122,255,0.3)' },
  ctaTxt:         { color: C.white, fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },

  // ── Shared ──────────────────────────────────────────────────────────────────
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: '#F2F2F7' },
  headerIcon:  { padding: 8, backgroundColor: C.surface, borderRadius: 16 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', color: C.gray, marginHorizontal: 8 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  centerTxt:   { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 22 },

  // ── Smart Recommendation card ─────────────────────────────────────────────
  recCard:      { margin: 14, marginBottom: 4, backgroundColor: 'rgba(0,122,255,0.05)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(0,122,255,0.12)' },
  recHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  recHeaderTxt: { fontSize: 11, fontWeight: '700', color: C.accent, letterSpacing: 0.8, textTransform: 'uppercase' },
  recBody:      { fontSize: 14, color: C.gray, lineHeight: 22, marginBottom: 4 },
  recHighlight: { fontWeight: '800', color: C.gray, fontSize: 15 },
  recNote:      { fontSize: 11, color: C.accent, marginTop: 2, marginBottom: 6 },
  recFooter:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  recMacroTxt:  { fontSize: 12, color: C.muted, flex: 1 },
  recLogBtn:    { backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  recLogBtnTxt: { fontSize: 13, fontWeight: '700', color: C.white },

  // ── Feed radius slider ────────────────────────────────────────────────────
  radiusRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F2F2F7' },
  radiusLabel:  { fontSize: 12, color: C.muted, width: 44 },
  radiusSlider: { flex: 1, height: 36, marginHorizontal: 4 },
  radiusValue:  { fontSize: 12, fontWeight: '700', color: C.accent, width: 34, textAlign: 'right' },

  // ── Feed mode toggle (iOS-style segmented control) ────────────────────────
  feedModeBar:       { flexDirection: 'row', marginHorizontal: 16, marginTop: 10, marginBottom: 4, borderRadius: 10, backgroundColor: C.track, padding: 3 },
  feedModeBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 8 },
  feedModeBtnActive: { backgroundColor: C.card, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
  feedModeTxt:       { fontSize: 12, fontWeight: '600', color: C.muted },
  feedModeTxtActive: { color: C.gray },
  feedSearchRow:     { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 6, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  feedSearchInput:   { flex: 1, fontSize: 14, color: C.gray, paddingVertical: 0 },

  // ── Feed ─────────────────────────────────────────────────────────────────
  feedList:    { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 20 },
  feedCard:    { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 10, ...card },
  feedThumb:   { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 14, backgroundColor: C.surface },
  feedInitials:{ fontSize: 16, fontWeight: '800', color: C.gray },
  feedCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  feedName:    { fontSize: 15, fontWeight: '700', color: C.gray, flex: 1, marginRight: 8 },
  feedSub:     { fontSize: 12, color: C.muted },
  badge:       { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTxt:    { fontSize: 11, fontWeight: '700', color: C.white },

  // ── Detail match bar ──────────────────────────────────────────────────────
  matchBar:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: '#F2F2F7' },
  barsWrap:     { flex: 1, marginLeft: 14 },
  barRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  barLabel:     { width: 14, fontSize: 11, fontWeight: '700', color: C.muted, marginRight: 6 },
  barTrack:     { flex: 1, height: 6, backgroundColor: C.track, borderRadius: 3, overflow: 'hidden', marginRight: 6 },
  barFill:      { height: '100%', borderRadius: 3 },
  barValue:     { fontSize: 11, fontWeight: '600', color: C.gray, width: 52, textAlign: 'right' },
  barValueOver: { color: '#FF3B30' },
  barTarget:    { fontWeight: '400', color: C.muted },
  cachedLabel:  { fontSize: 10, color: C.muted, marginTop: 3 },

  // ── Scan row ──────────────────────────────────────────────────────────────
  scanRow:    { paddingHorizontal: 16, paddingVertical: 8 },
  scanBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0,122,255,0.25)', backgroundColor: 'rgba(0,122,255,0.06)' },
  scanBtnTxt: { fontSize: 13, fontWeight: '600', color: C.accent },
  ocrCacheBar:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 2 },
  ocrCacheTxt:   { flex: 1, fontSize: 11, color: C.muted },
  ocrRescanBtn:  { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  ocrRescanTxt:  { fontSize: 11, fontWeight: '600', color: C.muted },
  submitDbBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 16, marginTop: 20, marginBottom: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: C.accent },
  submitDbBtnTxt: { fontSize: 14, fontWeight: '700', color: C.white },
  submitItemCount:{ fontSize: 11, color: C.muted, marginBottom: 10 },
  submitErrorTxt: { fontSize: 12, color: '#FF3B30', marginBottom: 10 },

  // ── Menu list ─────────────────────────────────────────────────────────────
  section:         { paddingHorizontal: 16, marginBottom: 4 },
  sectionLabel:    { fontSize: 10, fontWeight: '800', color: C.muted, letterSpacing: 1.2, marginBottom: 8, marginTop: 12, textTransform: 'uppercase' },
  menuRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.card, marginBottom: 6, borderWidth: 1, borderColor: '#F2F2F7', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  menuRowActive:   { backgroundColor: 'rgba(0,122,255,0.06)', borderColor: 'rgba(0,122,255,0.2)' },
  menuName:        { fontSize: 14, fontWeight: '600', color: C.muted, marginBottom: 3 },
  menuNameActive:  { color: C.gray },
  pillRow:         { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 2 },
  pill:            { backgroundColor: C.surface, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  pillTxt:         { fontSize: 11, color: C.muted, fontWeight: '500' },
  tagVerified:     { backgroundColor: 'rgba(52,199,89,0.12)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tagVerifiedTxt:  { fontSize: 10, color: '#34C759', fontWeight: '600' },
  tagAI:           { backgroundColor: 'rgba(255,149,0,0.12)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tagAITxt:        { fontSize: 10, color: '#FF9500', fontWeight: '600' },
  tagEdited:       { backgroundColor: 'rgba(0,122,255,0.1)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tagEditedTxt:    { fontSize: 10, color: '#007AFF', fontWeight: '600' },
  tagOfficial:     { backgroundColor: 'rgba(52,199,89,0.12)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tagOfficialTxt:  { fontSize: 10, color: '#34C759', fontWeight: '700', letterSpacing: 0.3 },
  verifyBtn:       { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(0,122,255,0.3)' },
  verifyBtnTxt:    { fontSize: 12, fontWeight: '700', color: C.accent },

  // ── Tab bar (iOS-style segmented control) ─────────────────────────────────
  tabBar:          { flexDirection: 'row', marginHorizontal: 14, marginTop: 10, marginBottom: 2, borderRadius: 10, backgroundColor: C.track, padding: 3 },
  tabBtn:          { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
  tabBtnActive:    { backgroundColor: C.card, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
  tabBtnTxt:       { fontSize: 12, fontWeight: '600', color: C.muted, letterSpacing: 0.2 },
  tabBtnTxtActive: { color: C.gray },

  // ── Protein density badge ─────────────────────────────────────────────────
  densityBadge:    { backgroundColor: 'rgba(0,122,255,0.1)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  densityBadgeTxt: { fontSize: 10, fontWeight: '700', color: C.accent, letterSpacing: 0.2 },

  // ── Coach chip (per-item serving suggestion) ─────────────────────────────
  coachChip:    { flexDirection: 'row', alignItems: 'center', marginTop: 6, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, alignSelf: 'flex-start', borderWidth: 1 },
  coachChipTxt: { fontSize: 10, fontWeight: '600', letterSpacing: 0.1 },

  // ── Steppers ──────────────────────────────────────────────────────────────
  stepRow:         { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn:         { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, borderRadius: 8 },
  stepBtnDim:      { backgroundColor: '#F2F2F7' },
  stepIcon:        { fontSize: 18, color: C.gray, fontWeight: '300', lineHeight: 22 },
  stepIconDim:     { color: '#C7C7CC' },
  stepCount:       { fontSize: 14, fontWeight: '600', color: C.muted, minWidth: 24, textAlign: 'center' },
  stepCountActive: { color: C.gray },
  stepInput:       { padding: 0, minWidth: 32, height: 22 },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.gray, textAlign: 'center' },
  emptySub:   { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20 },
  emptyBtn:   { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  emptyBtnTxt:{ fontSize: 15, fontWeight: '700', color: C.white },

  // ── Meal History (Home Screen) ────────────────────────────────────────────
  historyHeader:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, marginBottom: 10, paddingHorizontal: 2 },
  historySectionLabel:  { fontSize: 10, fontWeight: '800', color: C.muted, letterSpacing: 1.2, textTransform: 'uppercase' },
  historyCount:         { fontSize: 11, color: C.muted },
  historyDayLabel:      { fontSize: 11, fontWeight: '700', color: C.muted, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 16, marginBottom: 8, paddingHorizontal: 2 },
  historyEmpty:         { alignItems: 'center', gap: 10, paddingVertical: 32 },
  historyEmptyTxt:      { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 20 },
  historyCard:          { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 10, ...card },
  historyCardTop:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  historyRestaurant:    { fontSize: 11, fontWeight: '700', color: C.accent, textTransform: 'uppercase', letterSpacing: 0.5, flex: 1, marginRight: 8 },
  historySourceBadge:   { backgroundColor: 'rgba(52,199,89,0.12)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  historySourceBadgeUpl:{ backgroundColor: 'rgba(255,149,0,0.12)' },
  historySourceTxt:     { fontSize: 9, fontWeight: '700', color: '#34C759', letterSpacing: 0.3 },
  historySourceTxtUpl:  { color: '#FF9500' },
  historyItemName:      { fontSize: 15, fontWeight: '700', color: C.gray, marginBottom: 10, lineHeight: 20 },
  historyMacroRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  historyProteinBlock:  { marginRight: 16 },
  historyProteinNum:    { fontSize: 30, fontWeight: '900', color: C.accent, lineHeight: 32 },
  historyProteinLabel:  { fontSize: 10, fontWeight: '600', color: 'rgba(0,122,255,0.7)', marginTop: 1 },
  historySecondaryMacros:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
  historyCalTxt:        { fontSize: 13, color: C.muted, fontWeight: '500' },
  historyDot:           { fontSize: 13, color: C.border },
  historyFatTxt:        { fontSize: 13, color: C.muted, fontWeight: '500' },
  historyFooter:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  historyDate:          { fontSize: 11, color: C.muted },
  historyServings:      { fontSize: 11, fontWeight: '600', color: C.gray },

  // ── Meal Session Cards (grouped history) ─────────────────────────────────
  mealSessionCard:       { backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 10, ...card },
  mealSessionHeader:     { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  mealSessionTitle:      { fontSize: 15, fontWeight: '700', color: C.gray, marginBottom: 3 },
  mealSessionRestaurant: { fontSize: 11, fontWeight: '600', color: C.accent, textTransform: 'uppercase', letterSpacing: 0.4 },
  mealSessionMeta:       { flexDirection: 'row', alignItems: 'center', marginLeft: 8, marginTop: 2 },
  mealSessionTime:       { fontSize: 11, color: C.muted },
  mealSessionTotals:       { marginBottom: 4 },
  mealTotalProteinBlock:   { flexDirection: 'row', alignItems: 'baseline', gap: 3, marginBottom: 4 },
  mealTotalProteinNum:     { fontSize: 28, fontWeight: '900', color: C.accent, lineHeight: 30 },
  mealTotalProteinLabel:   { fontSize: 11, fontWeight: '600', color: 'rgba(0,122,255,0.65)' },
  mealTotalSecondary:      { flexDirection: 'row', alignItems: 'center', gap: 5 },
  mealTotalSecTxt:         { fontSize: 12, color: C.muted, fontWeight: '500' },
  mealTotalDot:            { fontSize: 12, color: C.border },
  mealExpandedWrap:      { borderTopWidth: 1, borderTopColor: '#F2F2F7', marginTop: 10, paddingTop: 10, gap: 8 },
  mealItemRow:           { backgroundColor: C.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#F2F2F7' },
  mealItemHeader:        { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 6 },
  mealItemQty:           { fontSize: 13, fontWeight: '700', color: C.accent, minWidth: 28 },
  mealItemName:          { fontSize: 13, fontWeight: '600', color: C.gray, flex: 1, lineHeight: 18 },
  mealItemMacroGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  mealMacroCell:              { backgroundColor: C.card, borderRadius: 7, paddingVertical: 5, paddingHorizontal: 8, alignItems: 'center', minWidth: 58, borderWidth: 1, borderColor: '#F2F2F7' },
  mealMacroCellProtein:       { backgroundColor: 'rgba(0,122,255,0.06)', borderColor: 'rgba(0,122,255,0.15)' },
  mealMacroCellVal:           { fontSize: 13, fontWeight: '700', color: C.gray },
  mealMacroCellValProtein:    { fontSize: 15, fontWeight: '900', color: C.accent },
  mealMacroCellLabel:         { fontSize: 9, fontWeight: '500', color: C.muted, marginTop: 1 },
  mealMacroCellLabelProtein:  { color: 'rgba(0,122,255,0.65)' },
  mealExpandHint:             { fontSize: 10, color: '#C7C7CC', textAlign: 'center', marginTop: 4 },

  // ── Confirm bar ───────────────────────────────────────────────────────────
  confirmWrap:       { padding: 16, borderTopWidth: 1, borderTopColor: '#E5E5EA' },
  confirmSummary:    { backgroundColor: 'rgba(0,122,255,0.07)', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 10 },
  confirmSummaryTxt: { fontSize: 13, color: C.gray, textAlign: 'center', fontWeight: '600' },
  confirmBtn:        { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  confirmBtnDim:     { backgroundColor: 'rgba(0,122,255,0.3)' },
  confirmBtnTxt:     { fontSize: 16, fontWeight: '700', color: C.white },

  // ── Macro edit modal ──────────────────────────────────────────────────────
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  modalCard:       { width: '100%', backgroundColor: C.card, borderRadius: 20, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 8 },
  modalTitle:      { fontSize: 17, fontWeight: '800', color: C.gray, marginBottom: 4 },
  modalSub:        { fontSize: 12, color: C.muted, marginBottom: 16 },
  modalNameInput:  { backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '600', color: C.gray, marginBottom: 16 },
  modalFields:     { flexDirection: 'row', gap: 12, marginBottom: 16 },
  modalField:      { flex: 1, alignItems: 'center' },
  modalFieldLabel: { fontSize: 12, color: C.muted, marginBottom: 6, fontWeight: '600' },
  modalFieldWrap:  { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: C.border },
  modalFieldInput: { fontSize: 20, fontWeight: '700', color: C.gray, width: 48, textAlign: 'center' },
  modalFieldUnit:  { fontSize: 12, color: C.muted, marginLeft: 2 },
  modalBtnRow:     { flexDirection: 'row', gap: 12 },
  modalCancelBtn:  { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center' },
  modalCancelTxt:  { fontSize: 14, fontWeight: '600', color: C.muted },
  modalSaveBtn:    { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: C.accent, alignItems: 'center' },
  modalSaveTxt:    { fontSize: 14, fontWeight: '700', color: C.white },
});
