import { StyleSheet } from 'react-native';

export const C = {
  bg:     '#001a1a',
  card:   '#004d4d',
  accent: '#00796b',
  white:  '#ffffff',
  gray:   '#e0e0e0',
  muted:  '#A0A0A0',
  dark:   '#0d2020',
};

export const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // ── Home ──────────────────────────────────────────────────────────────────
  homeScroll:     { flexGrow: 1, padding: 24, paddingTop: 48 },
  homeTitleBlock: { alignItems: 'center', marginBottom: 36 },
  homeTitle:      { fontSize: 34, fontWeight: '800', color: C.white, letterSpacing: 0.3 },
  homeSub:        { fontSize: 15, color: C.muted, marginTop: 8 },
  homeCard:       { backgroundColor: C.card, borderRadius: 18, padding: 22, marginBottom: 24 },
  inputGroup:     { marginBottom: 16 },
  inputLabel:     { fontSize: 13, color: C.gray, marginBottom: 6, fontWeight: '500', letterSpacing: 0.3 },
  inputField:     { backgroundColor: C.bg, borderRadius: 10, padding: 14, fontSize: 22, fontWeight: '700', color: C.white, textAlign: 'center' },
  ctaBtn:         { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  ctaBtnDim:      { backgroundColor: 'rgba(0,121,107,0.3)' },
  ctaTxt:         { color: C.white, fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },

  // ── Shared ────────────────────────────────────────────────────────────────
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.dark, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  headerIcon:  { padding: 8, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 16 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', color: C.gray, marginHorizontal: 8 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  centerTxt:   { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 22 },

  // ── Smart Recommendation card ─────────────────────────────────────────────
  recCard:      { margin: 14, marginBottom: 4, backgroundColor: 'rgba(0,121,107,0.12)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(0,121,107,0.3)' },
  recHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  recHeaderTxt: { fontSize: 11, fontWeight: '700', color: C.accent, letterSpacing: 0.8, textTransform: 'uppercase' },
  recBody:      { fontSize: 14, color: C.gray, lineHeight: 22, marginBottom: 4 },
  recHighlight: { fontWeight: '800', color: C.white, fontSize: 15 },
  recNote:      { fontSize: 11, color: C.accent, marginTop: 2, marginBottom: 6 },
  recFooter:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  recMacroTxt:  { fontSize: 12, color: C.muted, flex: 1 },
  recLogBtn:    { backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  recLogBtnTxt: { fontSize: 13, fontWeight: '700', color: C.white },

  // ── Feed radius slider ─────────────────────────────────────────────────────
  radiusRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  radiusLabel:  { fontSize: 12, color: C.muted, width: 44 },
  radiusSlider: { flex: 1, height: 36, marginHorizontal: 4 },
  radiusValue:  { fontSize: 12, fontWeight: '700', color: C.accent, width: 34, textAlign: 'right' },

  // ── Feed ──────────────────────────────────────────────────────────────────
  feedList:    { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 20 },
  feedCard:    { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  feedThumb:   { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 14, backgroundColor: C.card },
  feedInitials:{ fontSize: 16, fontWeight: '800', color: C.white },
  feedCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  feedName:    { fontSize: 15, fontWeight: '700', color: C.white, flex: 1, marginRight: 8 },
  feedSub:     { fontSize: 12, color: C.muted },
  badge:       { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTxt:    { fontSize: 11, fontWeight: '700', color: C.white },

  // ── Detail match bar ──────────────────────────────────────────────────────
  matchBar:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.dark, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  barsWrap:     { flex: 1, marginLeft: 14 },
  barRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  barLabel:     { width: 14, fontSize: 11, fontWeight: '700', color: C.muted, marginRight: 6 },
  barTrack:     { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden', marginRight: 6 },
  barFill:      { height: '100%', borderRadius: 3 },
  barValue:     { fontSize: 11, fontWeight: '600', color: C.gray, width: 52, textAlign: 'right' },
  barValueOver: { color: '#ff6b6b' },
  barTarget:    { fontWeight: '400', color: C.muted },
  cachedLabel:  { fontSize: 10, color: C.muted, marginTop: 3 },

  // ── Scan row ──────────────────────────────────────────────────────────────
  scanRow:    { paddingHorizontal: 16, paddingVertical: 8 },
  scanBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(79,195,247,0.3)', backgroundColor: 'rgba(79,195,247,0.07)' },
  scanBtnTxt: { fontSize: 13, fontWeight: '600', color: '#4fc3f7' },

  // ── Menu list ─────────────────────────────────────────────────────────────
  section:         { paddingHorizontal: 16, marginBottom: 4 },
  sectionLabel:    { fontSize: 10, fontWeight: '800', color: C.muted, letterSpacing: 1.2, marginBottom: 8, marginTop: 12, textTransform: 'uppercase' },
  menuRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', marginBottom: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  menuRowActive:   { backgroundColor: 'rgba(0,121,107,0.18)', borderColor: 'rgba(0,121,107,0.5)' },
  menuName:        { fontSize: 14, fontWeight: '600', color: C.muted, marginBottom: 3 },
  menuNameActive:  { color: C.white },
  pillRow:         { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 2 },
  pill:            { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  pillTxt:         { fontSize: 11, color: C.muted, fontWeight: '500' },
  tagVerified:     { backgroundColor: 'rgba(0,200,83,0.15)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tagVerifiedTxt:  { fontSize: 10, color: '#00e676', fontWeight: '600' },
  tagAI:           { backgroundColor: 'rgba(255,167,38,0.15)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tagAITxt:        { fontSize: 10, color: '#ffb74d', fontWeight: '600' },
  tagEdited:       { backgroundColor: 'rgba(144,202,249,0.15)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tagEditedTxt:    { fontSize: 10, color: '#90caf9', fontWeight: '600' },
  tagOfficial:     { backgroundColor: 'rgba(0,200,83,0.18)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tagOfficialTxt:  { fontSize: 10, color: '#00e676', fontWeight: '700', letterSpacing: 0.3 },
  verifyBtn:       { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(0,121,107,0.5)' },
  verifyBtnTxt:    { fontSize: 12, fontWeight: '700', color: C.accent },

  // ── Tab bar ───────────────────────────────────────────────────────────────
  tabBar:          { flexDirection: 'row', marginHorizontal: 14, marginTop: 10, marginBottom: 2, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', padding: 3 },
  tabBtn:          { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
  tabBtnActive:    { backgroundColor: C.card },
  tabBtnTxt:       { fontSize: 12, fontWeight: '600', color: C.muted, letterSpacing: 0.2 },
  tabBtnTxtActive: { color: C.white },

  // ── Protein density badge ─────────────────────────────────────────────────
  densityBadge:    { backgroundColor: 'rgba(0,121,107,0.2)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  densityBadgeTxt: { fontSize: 10, fontWeight: '700', color: C.accent, letterSpacing: 0.2 },

  // ── Coach chip (per-item serving suggestion) ─────────────────────────────
  coachChip:    { flexDirection: 'row', alignItems: 'center', marginTop: 6, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, alignSelf: 'flex-start', borderWidth: 1 },
  coachChipTxt: { fontSize: 10, fontWeight: '600', letterSpacing: 0.1 },

  // ── Steppers ──────────────────────────────────────────────────────────────
  stepRow:         { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn:         { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8 },
  stepBtnDim:      { backgroundColor: 'rgba(255,255,255,0.03)' },
  stepIcon:        { fontSize: 18, color: C.white, fontWeight: '300', lineHeight: 22 },
  stepIconDim:     { color: 'rgba(255,255,255,0.2)' },
  stepCount:       { fontSize: 14, fontWeight: '600', color: C.muted, minWidth: 24, textAlign: 'center' },
  stepCountActive: { color: C.white },
  stepInput:       { padding: 0, minWidth: 32, height: 22 },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.white, textAlign: 'center' },
  emptySub:   { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20 },
  emptyBtn:   { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  emptyBtnTxt:{ fontSize: 15, fontWeight: '700', color: C.white },

  // ── Confirm bar ───────────────────────────────────────────────────────────
  confirmWrap:       { padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  confirmSummary:    { backgroundColor: 'rgba(0,121,107,0.15)', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 10 },
  confirmSummaryTxt: { fontSize: 13, color: C.gray, textAlign: 'center', fontWeight: '600' },
  confirmBtn:        { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  confirmBtnDim:     { backgroundColor: 'rgba(0,121,107,0.25)' },
  confirmBtnTxt:     { fontSize: 16, fontWeight: '700', color: C.white },

  // ── Macro edit modal ──────────────────────────────────────────────────────
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  modalCard:       { width: '100%', backgroundColor: C.dark, borderRadius: 18, padding: 24, borderWidth: 1, borderColor: 'rgba(0,121,107,0.3)' },
  modalTitle:      { fontSize: 17, fontWeight: '800', color: C.white, marginBottom: 4 },
  modalSub:        { fontSize: 12, color: C.muted, marginBottom: 16 },
  modalNameInput:  { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,121,107,0.4)', paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '600', color: C.white, marginBottom: 16 },
  modalFields:     { flexDirection: 'row', gap: 12, marginBottom: 16 },
  modalField:      { flex: 1, alignItems: 'center' },
  modalFieldLabel: { fontSize: 12, color: C.muted, marginBottom: 6, fontWeight: '600' },
  modalFieldWrap:  { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(0,121,107,0.35)' },
  modalFieldInput: { fontSize: 20, fontWeight: '700', color: C.white, width: 48, textAlign: 'center' },
  modalFieldUnit:  { fontSize: 12, color: C.muted, marginLeft: 2 },
  modalBtnRow:     { flexDirection: 'row', gap: 12 },
  modalCancelBtn:  { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center' },
  modalCancelTxt:  { fontSize: 14, fontWeight: '600', color: C.muted },
  modalSaveBtn:    { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: C.accent, alignItems: 'center' },
  modalSaveTxt:    { fontSize: 14, fontWeight: '700', color: C.white },
});
