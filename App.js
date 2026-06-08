// App.js — MacroDecide MVP  ·  Home → Feed → Detail
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Text, View, TextInput, TouchableOpacity, SafeAreaView,
  TouchableWithoutFeedback, Keyboard, KeyboardAvoidingView,
  Platform, ScrollView, Modal, Alert, ActivityIndicator,
} from 'react-native';
import { StatusBar }    from 'expo-status-bar';
import { Ionicons }     from '@expo/vector-icons';
import AsyncStorage     from '@react-native-async-storage/async-storage';
import * as ImagePicker  from 'expo-image-picker';
import * as Location     from 'expo-location';

import { calculateMatchPercentage }                          from './src/utils/engine';
import { suggestServing, findBestItem }                      from './src/utils/macroMath';
import MatchRing                                             from './src/components/MatchRing';
import { getCurrentLocation, searchNearbyRestaurantsLive }  from './src/services/proximityService';
import { analyzeMenuImage, MenuVisionRateLimitError }        from './src/services/menuVisionService';
import { submitMenuToCommunity }                             from './src/services/communityService';
import { RESTAURANT_DB }                                     from './src/data/restaurantDB';
import { VERIFIED_MENUS }                                    from './src/data/verifiedMenus';
import ChipotleBuilder                                       from './src/components/ChipotleBuilder';
import { s, C }                                              from './src/styles/appStyles';
import Onboarding, { ONBOARDING_KEY }                        from './src/components/Onboarding';
import Slider                                                from '@react-native-community/slider';
import { collection, query, where, orderBy, onSnapshot, addDoc, deleteDoc, doc, updateDoc, increment } from 'firebase/firestore';
import { db }                                                from './src/config/firebase';
import { AuthProvider, useAuth }                             from './src/context/AuthContext';
import LoginScreen                                           from './src/components/LoginScreen';
import PaywallModal                                          from './src/components/PaywallModal';

// ─── Constants ────────────────────────────────────────────────────────────────
const CACHE_PREFIX   = 'menu_v2_';
const UPL_PREFIX     = 'user_upload_v1_';
const CACHE_TTL_MS   = 7 * 24 * 60 * 60 * 1000;
const GEO_RADIUS_M   = 200;
const SEARCH_CTX_KEY  = '@md_search_ctx';
const HISTORY_KEY     = '@md_meal_history_v1';
const PROTEIN_GOAL_KEY = '@md_protein_goal';

// Merged lookup for feed bestPct (VERIFIED_MENUS takes precedence over RESTAURANT_DB)
const COMBINED_MENUS = { ...RESTAURANT_DB, ...VERIFIED_MENUS };

// ─── Pure helpers ─────────────────────────────────────────────────────────────
function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6_371_000, r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function cacheRead(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const { items, cachedAt } = JSON.parse(raw);
    if (!Array.isArray(items) || !items.length) return null;
    if (Date.now() - cachedAt > CACHE_TTL_MS) { AsyncStorage.removeItem(key); return null; }
    return items;
  } catch { return null; }
}

async function cacheWrite(key, items) {
  try { await AsyncStorage.setItem(key, JSON.stringify({ items, cachedAt: Date.now() })); } catch {}
}

// ─── Smart Recommendation Engine ─────────────────────────────────────────────
// Items prefixed 'ws_bi_' are 6-piece bone-in wing bundles from verifiedMenus.js.
// Per-piece calories are derived from macros (4/4/9 kcal per g P/C/F) since
// verifiedMenus.js does not store a calories field.
const _WING_BUNDLE    = 6;
const _DRY_RUB_IDS   = new Set(['ws_bi_plain','ws_bi_caj','ws_bi_atm','ws_bi_lr','ws_bi_lp','ws_bi_hhr']);

function getOptimalOrder(targets, items) {
  const tP = targets.protein || 0;
  const tF = targets.fat     || 0;
  const tC = targets.carbs   || 0;
  if (tP <= 0) return null;

  const wingPool = items.filter(i => i.id?.startsWith('ws_bi_'));
  if (wingPool.length === 0) return null;

  const wings = wingPool.map(i => {
    const ppP   = i.protein / _WING_BUNDLE;
    const ppC   = i.carbs   / _WING_BUNDLE;
    const ppF   = i.fat     / _WING_BUNDLE;
    const ppCal = ppP * 4 + ppC * 4 + ppF * 9;
    return { ...i, ppP, ppC, ppF, ppCal, density: ppCal > 0 ? (ppP / ppCal) * 100 : 0 };
  });

  // Fat headroom: if the remaining fat target is < 60 % of the protein target
  // (in grams), the user is rationing fat → steer toward dry rubs over wet sauces.
  const isHighOnFat = tP > 0 && (tF / tP) < 0.6;

  const sorted = [...wings].sort((a, b) => {
    if (isHighOnFat) {
      const aD = _DRY_RUB_IDS.has(a.id) ? 1 : 0;
      const bD = _DRY_RUB_IDS.has(b.id) ? 1 : 0;
      if (aD !== bD) return bD - aD;   // dry rubs first
      return a.ppF - b.ppF;            // lower fat per piece within group
    }
    return b.density - a.density;      // default: highest protein density
  });

  const best       = sorted[0];
  const count      = Math.min(Math.ceil(tP / best.ppP), 24);
  const bundleQty  = Math.max(1, Math.round(count / _WING_BUNDLE));
  const flavorName = best.name.replace(/^6pc Classic /, '');

  return {
    sentence:        `${count} ${flavorName} Traditional Wings`,
    count,
    bundleQty,
    flavorName,
    isHighOnFat,
    isDryRub:        _DRY_RUB_IDS.has(best.id),
    estimatedMacros: {
      protein: Math.round(count * best.ppP),
      carbs:   Math.round(count * best.ppC),
      fat:     Math.round(count * best.ppF),
    },
    logQty: { [best.name]: bundleQty },
  };
}

function formatHistoryDate(ts) {
  const d = new Date(ts);
  const mon = d.toLocaleString('default', { month: 'short' });
  const h = d.getHours(), m = d.getMinutes().toString().padStart(2, '0');
  return `${mon} ${d.getDate()}, ${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ─── Meal history grouping ────────────────────────────────────────────────────
const SESSION_GAP_MS = 45 * 60 * 1000;

function getDayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getRelativeDayLabel(ts) {
  const d   = new Date(ts);
  const now = new Date();
  const dDay = new Date(d.getFullYear(),   d.getMonth(),   d.getDate());
  const nDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((nDay - dDay) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('default', { month: 'short', day: 'numeric' });
}

function groupByDayAndRestaurant(entries) {
  if (!entries.length) return [];
  const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);
  const trips = [];
  let cur = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const timeDiff = sorted[i].timestamp - sorted[i - 1].timestamp;
    const sameRest = sorted[i].restaurant === sorted[i - 1].restaurant;
    if (timeDiff <= SESSION_GAP_MS && sameRest) {
      cur.push(sorted[i]);
    } else {
      trips.push(cur);
      cur = [sorted[i]];
    }
  }
  trips.push(cur);
  const dayMap = new Map();
  for (const trip of trips) {
    const key = getDayKey(trip[0].timestamp);
    const label = getRelativeDayLabel(trip[0].timestamp);
    if (!dayMap.has(key)) dayMap.set(key, { label, trips: [] });
    dayMap.get(key).trips.push(trip);
  }
  return [...dayMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, v]) => ({ dayLabel: v.label, trips: v.trips.reverse() }));
}

// ─────────────────────────────────────────────────────────────────────────────
function AppInner() {

  // ── View stack: 'home' | 'feed' | 'detail' ───────────────────────────────
  const [view, setView] = useState('home');

  // ── Home: meal macro targets ──────────────────────────────────────────────
  const [targetP, setTargetP] = useState('');
  const [targetC, setTargetC] = useState('');
  const [targetF, setTargetF] = useState('');

  // ── Feed ──────────────────────────────────────────────────────────────────
  const [restaurants,   setRestaurants]   = useState([]);
  const [feedLoading,   setFeedLoading]   = useState(false);
  const [searchRadius,  setSearchRadius]  = useState(0);
  const [feedMode,      setFeedMode]      = useState('near_me');
  const [feedQuery,     setFeedQuery]     = useState('');
  const searchCtxRef   = useRef(null);
  const searchRadiusRef = useRef(5);

  // ── Detail: selected restaurant ───────────────────────────────────────────
  const [selName,    setSelName]    = useState('');
  const [selAddress, setSelAddress] = useState('');
  const [selCoords,  setSelCoords]  = useState(null);
  const selPlaceId = useRef('');

  // ── Detail: menu state ────────────────────────────────────────────────────
  const [menuItems,    setMenuItems]    = useState(null); // null = loading
  const [menuLoading,  setMenuLoading]  = useState(false);
  const [menuFromCache,setMenuFromCache]= useState(false);
  const [itemQty,      setItemQty]      = useState({});
  const [stepDraft,    setStepDraft]    = useState({ name: null, text: '' });

  // ── Detail: OCR scan ──────────────────────────────────────────────────────
  const [ocrItems,      setOcrItems]      = useState([]);
  const [ocrLoading,    setOcrLoading]    = useState(false);
  const [ocrFromCache,  setOcrFromCache]  = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitRestName,  setSubmitRestName]  = useState('');
  const [submitAddr,      setSubmitAddr]      = useState('');
  const [submitStatus,    setSubmitStatus]    = useState('idle');
  const [submitError,     setSubmitError]     = useState('');
  const [verifiedIds,   setVerifiedIds]   = useState(new Set());
  const [activeMenuTab, setActiveMenuTab] = useState('official');

  // ── Auth ─────────────────────────────────────────────────────────────────
  const { user, loading: authLoading, isAdmin, logout, isPremium, scanTokens, setScanTokens } = useAuth();

  // ── Meal history ──────────────────────────────────────────────────────────
  const [mealHistory,     setMealHistory]     = useState([]);
  const [historyLoading,  setHistoryLoading]  = useState(false);
  const [expandedMealIds, setExpandedMealIds] = useState(new Set());

  // ── Quick Scan (home screen universal scanner) ────────────────────────────
  const [quickScanItems,        setQuickScanItems]        = useState([]);
  const [quickScanLoading,      setQuickScanLoading]      = useState(false);
  const [showQuickScan,         setShowQuickScan]         = useState(false);
  const [quickScanName,         setQuickScanName]         = useState('');
  const [quickScanAddr,         setQuickScanAddr]         = useState('');
  const [quickScanQty,          setQuickScanQty]          = useState({});
  const [quickScanSubmitStatus, setQuickScanSubmitStatus] = useState('idle');
  const [quickScanSubmitError,  setQuickScanSubmitError]  = useState('');
  const [showQuickScanSubmit,   setShowQuickScanSubmit]   = useState(false);

  // ── Paywall ──────────────────────────────────────────────────────────────
  const [showPaywall, setShowPaywall] = useState(false);

  const toggleMealExpand = (id) => setExpandedMealIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // ── Onboarding gate ──────────────────────────────────────────────────────
  const [onboardingDone, setOnboardingDone] = useState(null); // null = loading
  const [pendingProtein, setPendingProtein] = useState(null); // protein from onboarding, cleared on auth

  // ── Detail: inline macro edit modal ──────────────────────────────────────
  const [editItem, setEditItem] = useState(null);
  const [editName, setEditName] = useState('');
  const [editP, setEditP] = useState('');
  const [editC, setEditC] = useState('');
  const [editF, setEditF] = useState('');

  // ─── Restore persisted search context on mount ────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(SEARCH_CTX_KEY)
      .then(raw => { if (raw) searchCtxRef.current = JSON.parse(raw); })
      .catch(() => {});
  }, []);

  // ─── Load meal history from Firestore ────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    setHistoryLoading(true);
    const q = query(
      collection(db, 'meal_history'),
      where('uid', '==', user.uid),
      orderBy('timestamp', 'desc'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMealHistory(snap.docs.map(d => ({ ...d.data(), id: d.id })));
        setHistoryLoading(false);
      },
      () => setHistoryLoading(false),
    );
    return unsub;
  }, [user]);

  // ─── Onboarding check ─────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then(val => setOnboardingDone(val === 'true'))
      .catch(() => setOnboardingDone(true)); // fail open — never block the app
  }, []);

  // ─── Clear pendingProtein once the user is authenticated ─────────────────
  useEffect(() => { if (user) setPendingProtein(null); }, [user]);

  // ─── Load persisted protein goal (set during onboarding) ─────────────────
  useEffect(() => {
    AsyncStorage.getItem(PROTEIN_GOAL_KEY)
      .then(val => { if (val) setTargetP(val); })
      .catch(() => {});
  }, []);

  // ─── Nearby restaurant loader ─────────────────────────────────────────────
  const loadFeed = useCallback(async (force = false) => {
    setFeedLoading(true);
    try {
      const loc = await getCurrentLocation();
      if (!force && searchCtxRef.current && loc) {
        const { lat, lon, ts, results } = searchCtxRef.current;
        if (haversineM(loc.latitude, loc.longitude, lat, lon) < 500 &&
            Date.now() - ts < 4 * 3600_000 && results?.length) {
          setRestaurants(results);
          return;
        }
      }
      const center  = loc ?? { latitude: 29.2130, longitude: -95.4010 };
      const results = await searchNearbyRestaurantsLive(center, searchRadiusRef.current * 1609.34);
      setRestaurants(results);
      if (results.length) {
        const ctx = { lat: center.latitude, lon: center.longitude, ts: Date.now(), results };
        searchCtxRef.current = ctx;
        AsyncStorage.setItem(SEARCH_CTX_KEY, JSON.stringify(ctx)).catch(() => {});
      }
    } catch {
      try {
        const raw = await AsyncStorage.getItem(SEARCH_CTX_KEY);
        if (raw) { const ctx = JSON.parse(raw); if (ctx.results?.length) setRestaurants(ctx.results); }
      } catch {}
    } finally {
      setFeedLoading(false);
    }
  }, []);

  // ─── Navigation ───────────────────────────────────────────────────────────
  const goHome = () => setView('home');

  const goFeed = () => { Keyboard.dismiss(); setView('feed'); loadFeed(); };

  const openDetail = (r) => {
    setSelName(r.name ?? '');
    setSelAddress(r.address ?? '');
    setSelCoords(r.latitude != null ? { latitude: r.latitude, longitude: r.longitude } : null);
    selPlaceId.current = r.placeId ?? '';
    setMenuItems([]);
    setItemQty({}); setOcrItems([]); setVerifiedIds(new Set());
    setMenuFromCache(false);
    setActiveMenuTab('official');
    setView('detail');
  };

  // ─── Menu loader ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (view !== 'detail' || !selName) return;
    let cancelled = false;
    setMenuItems(null); setMenuLoading(true);

    (async () => {
      const cacheKey = `${CACHE_PREFIX}${selPlaceId.current || selName}`;

      // 1. Verified chain manifest — instant, no network
      const vm = VERIFIED_MENUS[selName];
      if (vm?.length) {
        if (!cancelled) { setMenuItems(vm); setMenuLoading(false); }
        return;
      }

      // 2. Legacy local DB
      const db = RESTAURANT_DB[selName];
      if (db?.length) {
        if (!cancelled) { setMenuItems(db); setMenuLoading(false); }
        return;
      }

      // 3. AsyncStorage TTL cache (keyed by place_id when available)
      const cached = await cacheRead(cacheKey);
      if (!cancelled && cached) {
        setMenuItems(cached); setMenuFromCache(true); setMenuLoading(false);
        return;
      }
      if (cancelled) return;

      // 4. No data — prompt user to scan
      setMenuItems([]); setMenuLoading(false);
    })();

    return () => { cancelled = true; };
  }, [view, selName]);

  // ─── Load persisted User Uploaded items ──────────────────────────────────
  useEffect(() => {
    if (view !== 'detail' || !selName) return;
    setOcrFromCache(false);
    AsyncStorage.getItem(`${UPL_PREFIX}${selName}`)
      .then(raw => {
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (Array.isArray(saved) && saved.length) {
          setOcrItems(saved);
          setOcrFromCache(true);
        }
      })
      .catch(() => {});
  }, [view, selName]);

  // ─── Derived: totals + match % ────────────────────────────────────────────
  const totals = useMemo(() => {
    let p = 0, c = 0, f = 0;
    for (const item of [...(menuItems ?? []), ...ocrItems]) {
      const q = parseFloat(itemQty[item.name]) || 0;
      if (q) { p += item.protein * q; c += item.carbs * q; f += item.fat * q; }
    }
    const r = (n) => Math.round(n * 10) / 10;
    return { protein: r(p), carbs: r(c), fat: r(f) };
  }, [menuItems, ocrItems, itemQty]);

  const matchPct = useMemo(() => {
    const tP = parseFloat(targetP) || 0, tC = parseFloat(targetC) || 0, tF = parseFloat(targetF) || 0;
    if (!tP && !tC && !tF) return 0;
    if (!Object.values(itemQty).some(q => q > 0)) return 0;
    return Math.min(100, Math.round(calculateMatchPercentage({ protein: tP, carbs: tC, fat: tF }, totals)));
  }, [totals, targetP, targetC, targetF, itemQty]);

  const rec = useMemo(() => {
    const tP = parseFloat(targetP) || 0;
    const tC = parseFloat(targetC) || 0;
    const tF = parseFloat(targetF) || 0;
    if (!tP || !menuItems) return null;
    return getOptimalOrder({ protein: tP, carbs: tC, fat: tF }, menuItems);
  }, [targetP, targetC, targetF, menuItems]);

  const instructionBanner = useMemo(() => {
    const tPv = parseFloat(targetP) || 0;
    const tCv = parseFloat(targetC) || 0;
    const tFv = parseFloat(targetF) || 0;
    if (!tPv || !menuItems?.length) return null;
    const proteins = menuItems.filter(i => i.category === 'protein' && i.protein > 0);
    if (!proteins.length) return null;
    const best = findBestItem({ protein: tPv, carbs: tCv, fat: tFv }, proteins);
    if (!best) return null;
    const { item, sug, density } = best;
    const isWarning = !!sug.limitedBy;
    const isPerfect = !isWarning && density >= 15;
    const text = isWarning
      ? `Eat ${sug.servings.toFixed(1)} servings of ${item.name}, but watch your ${sug.limitedBy} cap.`
      : `You should eat ${sug.servings.toFixed(1)} servings of ${item.name} to best match your remaining macros.`;
    return { text, isWarning, isPerfect, projP: sug.projP, projC: sug.projC, projF: sug.projF, item, sug };
  }, [targetP, targetC, targetF, menuItems]);

  const uploadedBanner = useMemo(() => {
    const tPv = parseFloat(targetP) || 0;
    const tCv = parseFloat(targetC) || 0;
    const tFv = parseFloat(targetF) || 0;
    if (!tPv || !ocrItems?.length) return null;
    const proteins = ocrItems.filter(i => i.category === 'protein' && i.protein > 0);
    if (!proteins.length) return null;
    const best = findBestItem({ protein: tPv, carbs: tCv, fat: tFv }, proteins);
    if (!best) return null;
    const { item, sug, density } = best;
    const isWarning = !!sug.limitedBy;
    const isPerfect = !isWarning && density >= 15;
    const text = isWarning
      ? `Eat ${sug.servings.toFixed(1)} servings of ${item.name}, but watch your ${sug.limitedBy} cap.`
      : `You should eat ${sug.servings.toFixed(1)} servings of ${item.name} to best match your remaining macros.`;
    return { text, isWarning, isPerfect, projP: sug.projP, projC: sug.projC, projF: sug.projF, item, sug };
  }, [targetP, targetC, targetF, ocrItems]);

  // ─── Quick Scan derived state ─────────────────────────────────────────────
  const quickScanTotals = useMemo(() => {
    let p = 0, c = 0, f = 0;
    for (const item of quickScanItems) {
      const q = parseFloat(quickScanQty[item.name]) || 0;
      if (q) { p += item.protein * q; c += item.carbs * q; f += item.fat * q; }
    }
    const r = (n) => Math.round(n * 10) / 10;
    return { protein: r(p), carbs: r(c), fat: r(f) };
  }, [quickScanItems, quickScanQty]);

  const quickScanMatchPct = useMemo(() => {
    const tP = parseFloat(targetP)||0, tC = parseFloat(targetC)||0, tF = parseFloat(targetF)||0;
    if (!tP && !tC && !tF) return 0;
    if (!Object.values(quickScanQty).some(q => q > 0)) return 0;
    return Math.min(100, Math.round(calculateMatchPercentage({ protein: tP, carbs: tC, fat: tF }, quickScanTotals)));
  }, [quickScanTotals, targetP, targetC, targetF, quickScanQty]);

  const quickScanBanner = useMemo(() => {
    const tPv = parseFloat(targetP)||0, tCv = parseFloat(targetC)||0, tFv = parseFloat(targetF)||0;
    if (!tPv || !quickScanItems.length) return null;
    const proteins = quickScanItems.filter(i => i.category === 'protein' && i.protein > 0);
    if (!proteins.length) return null;
    const best = findBestItem({ protein: tPv, carbs: tCv, fat: tFv }, proteins);
    if (!best) return null;
    const { item, sug, density } = best;
    const isWarning = !!sug.limitedBy;
    const isPerfect = !isWarning && density >= 15;
    const text = isWarning
      ? `Eat ${sug.servings.toFixed(1)} servings of ${item.name}, but watch your ${sug.limitedBy} cap.`
      : `You should eat ${sug.servings.toFixed(1)} servings of ${item.name} to best match your remaining macros.`;
    return { text, isWarning, isPerfect, projP: sug.projP, projC: sug.projC, projF: sug.projF, item, sug };
  }, [targetP, targetC, targetF, quickScanItems]);

  // ─── Pre-scan list cleaner ────────────────────────────────────────────────
  // Purges items with impossible single-serving macros or all-zero data from
  // non-verified sources before we hand the name list to Gemini.
  const cleanMenuItems = (items) => items.filter(item =>
    item.protein <= 300 && item.carbs <= 400 && item.fat <= 200 &&
    !(item.protein === 0 && item.carbs === 0 && item.fat === 0 && item.dataSource !== 'verified'),
  );

  // ─── Mock items for 429 failover ─────────────────────────────────────────
  const MOCK_OCR_ITEMS = [
    { id: 'mock_ocr_1', name: "Dave's Single Slider",  category: 'protein', isMandatory: true,  protein: 28, carbs: 26, fat: 14, isAIResult: true, dataSource: 'ocr' },
    { id: 'mock_ocr_2', name: 'French Fries',          category: 'addon',   isMandatory: false, protein:  4, carbs: 48, fat: 17, isAIResult: true, dataSource: 'ocr' },
    { id: 'mock_ocr_3', name: 'Mac & Cheese',          category: 'base',    isMandatory: false, protein:  8, carbs: 42, fat: 18, isAIResult: true, dataSource: 'ocr' },
  ];

  // ─── OCR scan ─────────────────────────────────────────────────────────────
  // GEOFENCE DISABLED — testing from home (re-enable GEO_RADIUS_M check before ship)
  const runOcr = useCallback(async (base64, _photoCoords) => {
    const doScan = async () => {
      setOcrItems([]); setOcrLoading(true); setOcrFromCache(false);
      try {
        const existing = ocrItems.map(i => i.name);
        const items    = await analyzeMenuImage(base64, selName, existing);
        if (!items.length) Alert.alert('Scan Failed', "Couldn't find items. Try a clearer photo.");
        else {
          setOcrItems(items);
          setActiveMenuTab('uploaded');
          AsyncStorage.setItem(`${UPL_PREFIX}${selName}`, JSON.stringify(items)).catch(() => {});
          if (!isPremium && user) {
            updateDoc(doc(db, 'users', user.uid), { scanTokens: increment(-1) }).catch(() => {});
            setScanTokens(prev => Math.max(0, prev - 1));
          }
        }
      } catch (err) {
        console.log('FULL_API_ERROR:', JSON.stringify(err, null, 2));
        Alert.alert('Scan Error', err?.message ?? JSON.stringify(err));
      } finally { setOcrLoading(false); }
    };

    await doScan();
  }, [ocrItems, selName, isPremium, user]);

  const pickAndScan = async (source) => {
    let base64 = null, coords = null;
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Needed', 'Camera access required.'); return; }
      try {
        const { status: ls } = await Location.requestForegroundPermissionsAsync();
        if (ls === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        }
      } catch {}
      const r = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
      if (!r.canceled && r.assets?.[0]?.base64) base64 = r.assets[0].base64;
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Needed', 'Library access required.'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7, exif: true });
      if (!r.canceled && r.assets?.[0]?.base64) {
        base64 = r.assets[0].base64;
        const exif = r.assets[0].exif;
        if (exif?.GPSLatitude != null) {
          // Photo has embedded GPS — use it directly
          coords = { latitude: exif.GPSLatitude, longitude: exif.GPSLongitude };
        } else {
          // No EXIF GPS — fall back to live device location for the geofence check
          console.log('[MenuVision] No photo GPS — using live location as geofence fallback.');
          try {
            const { status: ls } = await Location.requestForegroundPermissionsAsync();
            if (ls === 'granted') {
              const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
              coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            }
          } catch {}
        }
      }
    }
    if (base64) runOcr(base64, coords);
  };

  const promptScan = () => {
    if (!isPremium && scanTokens <= 0) { setShowPaywall(true); return; }
    Alert.alert('Scan Menu', 'Add items from a photo:', [
      { text: 'Take Photo',          onPress: () => pickAndScan('camera')  },
      { text: 'Choose from Library', onPress: () => pickAndScan('library') },
      { text: 'Cancel',              style: 'cancel' },
    ]);
  };

  const clearOcrCache = () => {
    AsyncStorage.removeItem(`${UPL_PREFIX}${selName}`).catch(() => {});
    setOcrItems([]);
    setOcrFromCache(false);
    promptScan();
  };

  const openSubmitModal = () => {
    setSubmitRestName(selName);
    setSubmitAddr(selAddress);
    setSubmitStatus('idle');
    setSubmitError('');
    setShowSubmitModal(true);
  };

  const handleSubmitToDb = async () => {
    if (!submitRestName.trim()) { setSubmitError('Restaurant name is required.'); return; }
    if (!submitAddr.trim())     { setSubmitError('Address is required.'); return; }
    setSubmitStatus('loading');
    setSubmitError('');
    try {
      await submitMenuToCommunity({ restaurantName: submitRestName, address: submitAddr, items: ocrItems, uid: user?.uid });
      setSubmitStatus('success');
    } catch (err) {
      setSubmitStatus('error');
      setSubmitError(err?.message ?? 'Submission failed. Please try again.');
    }
  };

  // ─── Verify OCR item → merge into main list + cache ──────────────────────
  const verifyOcrItem = useCallback(async (item) => {
    const cacheKey = `${CACHE_PREFIX}${selPlaceId.current || selName}`;
    const verified = { ...item, dataSource: 'verified', isAIResult: false };
    setMenuItems(prev => {
      const merged = [...(prev ?? []).filter(e => e.name.toLowerCase() !== item.name.toLowerCase()), verified];
      cacheWrite(cacheKey, merged);
      return merged;
    });
    setVerifiedIds(prev => new Set([...prev, item.id]));
  }, [selName]);

  // ─── Macro edit ───────────────────────────────────────────────────────────
  const openEdit = (item) => { setEditItem(item); setEditName(item.name); setEditP(String(item.protein)); setEditC(String(item.carbs)); setEditF(String(item.fat)); };

  const saveMacroEdit = () => {
    if (!editItem) return;
    const p = Math.max(0, Math.round(parseFloat(editP) || 0));
    const c = Math.max(0, Math.round(parseFloat(editC) || 0));
    const f = Math.max(0, Math.round(parseFloat(editF) || 0));
    const patch = { name: editName.trim() || editItem.name, protein: p, carbs: c, fat: f, dataSource: 'userCorrected' };
    if (ocrItems.some(it => it.name === editItem.name)) {
      setOcrItems(prev => {
        const updated = prev.map(it => it.name === editItem.name ? { ...it, ...patch } : it);
        AsyncStorage.setItem(`${UPL_PREFIX}${selName}`, JSON.stringify(updated)).catch(() => {});
        return updated;
      });
    } else {
      const cacheKey = `${CACHE_PREFIX}${selPlaceId.current || selName}`;
      setMenuItems(prev => {
        if (!prev) return prev;
        const updated = prev.map(it => it.name === editItem.name ? { ...it, ...patch } : it);
        cacheWrite(cacheKey, updated);
        return updated;
      });
    }
    setEditItem(null);
  };

  // ─── Qty helpers ──────────────────────────────────────────────────────────
  const incQty = (name) => setItemQty(p => {
    const next = Math.round(((p[name] || 0) + 0.5) * 10) / 10;
    return { ...p, [name]: next };
  });
  const decQty = (name) => setItemQty(p => {
    const next = Math.round(((p[name] || 0) - 0.5) * 10) / 10;
    if (next <= 0) { const n = { ...p }; delete n[name]; return n; }
    return { ...p, [name]: next };
  });

  // ─── History: confirm & delete ────────────────────────────────────────────
  const confirmMeal = useCallback(async () => {
    const allItems = [...(menuItems ?? []), ...ocrItems];
    const newEntries = allItems.reduce((acc, item) => {
      const qty = parseFloat(itemQty[item.name]) || 0;
      if (qty <= 0) return acc;
      acc.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        restaurant: selName,
        itemName:   item.name,
        qty,
        protein: item.protein ?? 0,
        carbs:   item.carbs   ?? 0,
        fat:     item.fat     ?? 0,
        source:  ocrItems.some(o => o.name === item.name) ? 'uploaded' : 'official',
      });
      return acc;
    }, []);
    if (!newEntries.length) return;
    if (user) {
      newEntries.forEach(e =>
        addDoc(collection(db, 'meal_history'), { ...e, uid: user.uid }),
      );
    }
    setView('home');
  }, [menuItems, ocrItems, itemQty, selName, user]);

  const deleteHistoryEntry = useCallback((id) => {
    Alert.alert('Delete Entry', 'Remove this meal from history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => {
          setMealHistory(prev => prev.filter(e => e.id !== id)); // optimistic
          if (user) deleteDoc(doc(db, 'meal_history', id)).catch(console.error);
        },
      },
    ]);
  }, [user]);

  // ─── Quick Scan handlers ──────────────────────────────────────────────────
  const quickScanOcr = useCallback(async (base64) => {
    setQuickScanItems([]); setQuickScanQty({}); setQuickScanName(''); setQuickScanAddr('');
    setQuickScanLoading(true); setShowQuickScan(true);
    try {
      const items = await analyzeMenuImage(base64, '', []);
      if (!items.length) {
        Alert.alert('Scan Failed', "Couldn't find items. Try a clearer photo.");
        setShowQuickScan(false);
      } else {
        setQuickScanItems(items);
        if (!isPremium && user) {
          updateDoc(doc(db, 'users', user.uid), { scanTokens: increment(-1) }).catch(() => {});
          setScanTokens(prev => Math.max(0, prev - 1));
        }
      }
    } catch (err) {
      if (err instanceof MenuVisionRateLimitError)
        Alert.alert('Scan Limit Reached', 'Monthly scan limit reached. Please try again later.');
      else Alert.alert('Scan Error', err?.message ?? 'Unknown error');
      setShowQuickScan(false);
    } finally { setQuickScanLoading(false); }
  }, [isPremium, user]);

  const pickAndScanQuick = async (source) => {
    let base64 = null;
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Needed', 'Camera access required.'); return; }
      const r = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
      if (!r.canceled && r.assets?.[0]?.base64) base64 = r.assets[0].base64;
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Needed', 'Library access required.'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7 });
      if (!r.canceled && r.assets?.[0]?.base64) base64 = r.assets[0].base64;
    }
    if (base64) quickScanOcr(base64);
  };

  const promptQuickScan = () => {
    if (!isPremium && scanTokens <= 0) { setShowPaywall(true); return; }
    Alert.alert('Scan Any Menu', 'Add items from a photo:', [
      { text: 'Take Photo',          onPress: () => pickAndScanQuick('camera')  },
      { text: 'Choose from Library', onPress: () => pickAndScanQuick('library') },
      { text: 'Cancel',              style: 'cancel' },
    ]);
  };

  const incQuickQty = (name) => setQuickScanQty(p => ({ ...p, [name]: Math.round(((p[name]||0)+0.5)*10)/10 }));
  const decQuickQty = (name) => setQuickScanQty(p => {
    const next = Math.round(((p[name]||0)-0.5)*10)/10;
    if (next <= 0) { const n = {...p}; delete n[name]; return n; }
    return { ...p, [name]: next };
  });

  const confirmQuickScan = useCallback(async () => {
    const label = quickScanName.trim() || 'Quick Scan';
    const newEntries = quickScanItems.reduce((acc, item) => {
      const qty = parseFloat(quickScanQty[item.name]) || 0;
      if (qty <= 0) return acc;
      acc.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
        timestamp: Date.now(),
        restaurant: label,
        itemName:   item.name,
        qty,
        protein: item.protein ?? 0,
        carbs:   item.carbs   ?? 0,
        fat:     item.fat     ?? 0,
        source:  'uploaded',
      });
      return acc;
    }, []);
    if (!newEntries.length) return;
    if (quickScanName.trim())
      AsyncStorage.setItem(`${UPL_PREFIX}${quickScanName.trim()}`, JSON.stringify(quickScanItems)).catch(() => {});
    if (user) {
      newEntries.forEach(e =>
        addDoc(collection(db, 'meal_history'), { ...e, uid: user.uid }),
      );
    }
    setShowQuickScan(false);
    setQuickScanItems([]); setQuickScanQty({});
  }, [quickScanItems, quickScanQty, quickScanName, user]);

  const handleQuickScanSubmit = async () => {
    if (!quickScanName.trim()) { setQuickScanSubmitError('Restaurant name is required.'); return; }
    if (!quickScanAddr.trim()) { setQuickScanSubmitError('Address is required.'); return; }
    setQuickScanSubmitStatus('loading'); setQuickScanSubmitError('');
    try {
      await submitMenuToCommunity({ restaurantName: quickScanName.trim(), address: quickScanAddr.trim(), items: quickScanItems, uid: user?.uid });
      AsyncStorage.setItem(`${UPL_PREFIX}${quickScanName.trim()}`, JSON.stringify(quickScanItems)).catch(() => {});
      setQuickScanSubmitStatus('success');
    } catch (err) {
      setQuickScanSubmitStatus('error');
      setQuickScanSubmitError(err?.message ?? 'Submission failed. Please try again.');
    }
  };

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

  // ═══════════════════════════════════════════════════════════════════════════
  // HOME
  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Onboarding gate ─────────────────────────────────────────────────────
  if (onboardingDone === null || authLoading) return null;
  if (!onboardingDone) return (
    <Onboarding
      onComplete={(protein) => {
        setTargetP(protein);
        setPendingProtein(protein);
        AsyncStorage.setItem(PROTEIN_GOAL_KEY, protein).catch(() => {});
        setOnboardingDone(true);
      }}
    />
  );
  if (!user) return (
    <LoginScreen
      initialMode={pendingProtein !== null ? 'signup' : 'signin'}
      pendingProtein={pendingProtein}
    />
  );

  const hasTargets = (parseFloat(targetP)||0) + (parseFloat(targetC)||0) + (parseFloat(targetF)||0) > 0;

  if (view === 'home') return (
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

  // ═══════════════════════════════════════════════════════════════════════════
  // FEED
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === 'feed') {
    const targets = { protein: parseFloat(targetP)||0, carbs: parseFloat(targetC)||0, fat: parseFloat(targetF)||0 };
    const hasTargets = targets.protein > 0 || targets.carbs > 0 || targets.fat > 0;

    // ── Near Me cards ─────────────────────────────────────────────────────────
    const rawList = restaurants.length > 0 ? restaurants
      : (!feedLoading ? Object.keys(COMBINED_MENUS).map(name => ({ name, distance: null, address: null, latitude: null, longitude: null, placeId: null })) : []);

    const nearMeCards = rawList.map(r => {
      const key = Object.keys(COMBINED_MENUS).find(k =>
        k.toLowerCase() === r.name.toLowerCase() ||
        r.name.toLowerCase().includes(k.toLowerCase()) ||
        k.toLowerCase().includes(r.name.toLowerCase()));
      let bestPct = null, bestFit = null;
      if (key) {
        let best = 0;
        for (const item of COMBINED_MENUS[key]) {
          const pct = calculateMatchPercentage(targets, { protein: item.protein, carbs: item.carbs, fat: item.fat });
          if (pct > best) { best = pct; if (item.category === 'protein') bestFit = item.name; }
        }
        bestPct = Math.round(best);
      }
      return { ...r, bestPct, bestFit };
    }).sort((a, b) => {
      if (a.bestPct !== null && b.bestPct !== null) return b.bestPct - a.bestPct;
      if (a.bestPct !== null) return -1; if (b.bestPct !== null) return 1;
      return (a.distance ?? Infinity) - (b.distance ?? Infinity);
    });

    // ── Plan Ahead cards ──────────────────────────────────────────────────────
    const planAheadCards = Object.keys(COMBINED_MENUS)
      .filter(name => !feedQuery || name.toLowerCase().includes(feedQuery.toLowerCase()))
      .map(name => {
        let bestPct = 0, bestFit = null;
        for (const item of COMBINED_MENUS[name]) {
          const pct = calculateMatchPercentage(targets, { protein: item.protein, carbs: item.carbs, fat: item.fat });
          if (pct > bestPct) { bestPct = pct; if (item.category === 'protein') bestFit = item.name; }
        }
        return { name, bestPct: Math.round(bestPct), bestFit, distance: null, address: null, latitude: null, longitude: null, placeId: null };
      })
      .sort((a, b) => hasTargets
        ? (b.bestPct - a.bestPct) || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name)
      );

    const renderFeedCard = (r, i) => {
      const bg = r.bestPct == null ? '#8E8E93' : r.bestPct >= 80 ? '#34C759' : r.bestPct >= 50 ? '#FF9500' : '#8E8E93';
      return (
        <TouchableOpacity key={`${r.name}-${i}`} style={s.feedCard} onPress={() => openDetail(r)} activeOpacity={0.78}>
          <View style={s.feedThumb}><Text style={s.feedInitials}>{r.name?.[0]?.toUpperCase() ?? '?'}</Text></View>
          <View style={{ flex: 1 }}>
            <View style={s.feedCardTop}>
              <Text style={s.feedName} numberOfLines={1}>{r.name}</Text>
              <View style={[s.badge, { backgroundColor: bg }]}>
                <Text style={s.badgeTxt}>{r.bestPct != null ? `${r.bestPct}% Match` : 'Tap to load'}</Text>
              </View>
            </View>
            {r.bestFit
              ? <Text style={s.feedSub} numberOfLines={1}>Best: {r.bestFit}</Text>
              : r.distance != null
                ? <Text style={s.feedSub}>{r.distance < 0.1 ? 'Nearby' : `${r.distance.toFixed(1)} mi`}</Text>
                : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
        </TouchableOpacity>
      );
    };

    return (
      <SafeAreaView style={s.root}>
        <StatusBar style="dark" />
        <View style={s.header}>
          <TouchableOpacity onPress={goHome} style={s.headerIcon} activeOpacity={0.7}>
            <Ionicons name="arrow-back-outline" size={20} color={C.accent} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{feedMode === 'plan_ahead' ? 'Search Popular Chains' : 'Nearby Restaurants'}</Text>
          <TouchableOpacity onPress={goHome} style={s.headerIcon} activeOpacity={0.7}>
            <Ionicons name="home-outline" size={20} color={C.gray} />
          </TouchableOpacity>
        </View>

        {/* Mode toggle */}
        <View style={s.feedModeBar}>
          <TouchableOpacity
            style={[s.feedModeBtn, feedMode === 'near_me' && s.feedModeBtnActive]}
            onPress={() => setFeedMode('near_me')}
            activeOpacity={0.8}
          >
            <Ionicons name="location-outline" size={13} color={feedMode === 'near_me' ? C.gray : C.muted} style={{ marginRight: 5 }} />
            <Text style={[s.feedModeTxt, feedMode === 'near_me' && s.feedModeTxtActive]}>Near Me</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.feedModeBtn, feedMode === 'plan_ahead' && s.feedModeBtnActive]}
            onPress={() => { setFeedMode('plan_ahead'); setFeedQuery(''); }}
            activeOpacity={0.8}
          >
            <Ionicons name="calendar-outline" size={13} color={feedMode === 'plan_ahead' ? C.gray : C.muted} style={{ marginRight: 5 }} />
            <Text style={[s.feedModeTxt, feedMode === 'plan_ahead' && s.feedModeTxtActive]}>Search Popular Chains</Text>
          </TouchableOpacity>
        </View>

        {/* Radius slider — Near Me only */}
        {feedMode === 'near_me' && (
          <View style={s.radiusRow}>
            <Text style={s.radiusLabel}>Radius</Text>
            <Slider
              style={s.radiusSlider}
              minimumValue={0}
              maximumValue={15}
              step={5}
              value={searchRadius}
              onSlidingComplete={(val) => {
                searchRadiusRef.current = val;
                setSearchRadius(val);
                setRestaurants([]);
                loadFeed(true);
              }}
              minimumTrackTintColor={C.accent}
              maximumTrackTintColor='#E5E5EA'
              thumbTintColor={C.accent}
            />
            <Text style={s.radiusValue}>{searchRadius} mi</Text>
          </View>
        )}

        {/* Search bar — Plan Ahead only */}
        {feedMode === 'plan_ahead' && (
          <View style={s.feedSearchRow}>
            <Ionicons name="search-outline" size={16} color={C.muted} style={{ marginRight: 8 }} />
            <TextInput
              style={s.feedSearchInput}
              value={feedQuery}
              onChangeText={setFeedQuery}
              placeholder="Search all restaurants…"
              placeholderTextColor={C.muted}
              returnKeyType="search"
              clearButtonMode="while-editing"
              autoCorrect={false}
            />
            {feedQuery.length > 0 && (
              <TouchableOpacity onPress={() => setFeedQuery('')} activeOpacity={0.7} style={{ marginLeft: 6 }}>
                <Ionicons name="close-circle" size={16} color={C.muted} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Content */}
        {feedMode === 'near_me' ? (
          feedLoading ? (
            <View style={s.center}><ActivityIndicator size="large" color={C.accent} /><Text style={s.centerTxt}>Finding restaurants nearby…</Text></View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={s.feedList} showsVerticalScrollIndicator={false}>
              {nearMeCards.length === 0
                ? <View style={s.center}><Ionicons name="location-outline" size={48} color={C.muted} /><Text style={s.centerTxt}>No restaurants found.{'\n'}Check location permissions.</Text></View>
                : nearMeCards.map(renderFeedCard)
              }
              <View style={{ height: 40 }} />
            </ScrollView>
          )
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.feedList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {planAheadCards.length === 0
              ? <View style={s.center}><Ionicons name="search-outline" size={48} color={C.muted} /><Text style={s.centerTxt}>{`No results for "${feedQuery}"`}</Text></View>
              : planAheadCards.map(renderFeedCard)
            }
            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DETAIL
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === 'detail') {
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
          <View style={s.stepRow}>
            <TouchableOpacity style={[s.stepBtn, !qty && s.stepBtnDim]} onPress={() => decQty(item.name)} hitSlop={{ top:10, bottom:10, left:10, right:6 }} activeOpacity={qty ? 0.65 : 1}>
              <Text style={[s.stepIcon, !qty && s.stepIconDim]}>−</Text>
            </TouchableOpacity>
            <TextInput
              style={[s.stepCount, active && s.stepCountActive, s.stepInput]}
              keyboardType="numeric"
              returnKeyType="done"
              maxLength={4}
              selectTextOnFocus
              value={stepDraft.name === item.name ? stepDraft.text : (qty ? qty.toFixed(1) : '0')}
              onChangeText={(t) => {
                const sanitized = t.replace(/[^0-9.]/g, '').match(/^\d*\.?\d?/)?.[0] ?? '';
                setStepDraft({ name: item.name, text: sanitized });
              }}
              onBlur={() => {
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
            <TouchableOpacity style={s.stepBtn} onPress={() => incQty(item.name)} hitSlop={{ top:10, bottom:10, left:6, right:10 }} activeOpacity={0.65}>
              <Text style={s.stepIcon}>+</Text>
            </TouchableOpacity>
          </View>
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

  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
