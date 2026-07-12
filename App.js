// App.js — MacroDecide MVP  ·  Home → Feed → Detail
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Keyboard, Alert } from 'react-native';
import AsyncStorage     from '@react-native-async-storage/async-storage';
import * as ImagePicker  from 'expo-image-picker';
import * as Location     from 'expo-location';

import { calculateMatchPercentage, findBestItem } from './src/utils/macroMath';
import { getCurrentLocation, searchNearbyRestaurantsLive }  from './src/services/proximityService';
import { analyzeMenuImage, MenuVisionRateLimitError }        from './src/services/menuVisionService';
import { submitMenuToCommunity }                             from './src/services/communityService';
import { subscribeMealHistory, logMealEntries, deleteMealEntry, decrementScanToken } from './src/services/firebaseService';
import { RESTAURANT_DB }                                     from './src/data/restaurantDB';
import { VERIFIED_MENUS }                                    from './src/data/verifiedMenus';
import OnboardingStack, { ONBOARDING_KEY }                   from './src/components/OnboardingStack';
import { AuthProvider, useAuth }                             from './src/context/AuthContext';
import LoginScreen                                           from './src/components/LoginScreen';
import HomeView                                              from './src/components/HomeView';
import FeedView                                               from './src/components/FeedView';
import DetailView                                             from './src/components/DetailView';

// ─── Constants ────────────────────────────────────────────────────────────────
const CACHE_PREFIX   = 'menu_v2_';
const UPL_PREFIX     = 'user_upload_v1_';
const CACHE_TTL_MS   = 7 * 24 * 60 * 60 * 1000;
const SEARCH_CTX_KEY  = '@md_search_ctx';
const PROTEIN_GOAL_KEY = '@md_protein_goal';

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
    const unsub = subscribeMealHistory(
      user.uid,
      (entries) => { setMealHistory(entries); setHistoryLoading(false); },
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
    selPlaceId.current = r.placeId ?? '';
    setMenuItems([]);
    setItemQty({}); setOcrItems([]);
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

  // ─── OCR scan ─────────────────────────────────────────────────────────────
  // GEOFENCE DISABLED — testing from home (re-enable geofence check before ship)
  const runOcr = useCallback(async (base64, _photoCoords) => {
    const doScan = async () => {
      setOcrItems([]); setOcrLoading(true); setOcrFromCache(false);
      try {
        const existing = ocrItems.map(i => i.name);
        const items    = await analyzeMenuImage(base64, selName, existing);
        if (!items.length) {
          setOcrLoading(false);
          Alert.alert('Scan Failed', "Couldn't find items. Try a clearer photo.");
          return;
        }
        // Land payload → switch tab → stop skeleton in one batch
        setOcrItems(items);
        setActiveMenuTab('uploaded');
        setOcrLoading(false);
        AsyncStorage.setItem(`${UPL_PREFIX}${selName}`, JSON.stringify(items)).catch(() => {});
        if (!isPremium && user) {
          decrementScanToken(user.uid);
          setScanTokens(prev => Math.max(0, prev - 1));
        }
      } catch (err) {
        setOcrLoading(false);
        if (err instanceof MenuVisionRateLimitError)
          Alert.alert('Scan Limit Reached', 'Monthly scan limit reached. Please try again later.');
        else
          Alert.alert('Scan Error', err?.message ?? 'Scan failed. Please try again.');
      }
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
    if (user) logMealEntries(newEntries, user.uid);
    setView('home');
  }, [menuItems, ocrItems, itemQty, selName, user]);

  const deleteHistoryEntry = useCallback((id) => {
    Alert.alert('Delete Entry', 'Remove this meal from history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => {
          setMealHistory(prev => prev.filter(e => e.id !== id)); // optimistic
          if (user) deleteMealEntry(id).catch(console.error);
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
          decrementScanToken(user.uid);
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
    if (user) logMealEntries(newEntries, user.uid);
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Onboarding / auth gate
  // ═══════════════════════════════════════════════════════════════════════════
  if (onboardingDone === null || authLoading) return null;
  if (!onboardingDone) return (
    <OnboardingStack
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
    <HomeView
      targetP={targetP} setTargetP={setTargetP}
      targetC={targetC} setTargetC={setTargetC}
      targetF={targetF} setTargetF={setTargetF}
      hasTargets={hasTargets} goFeed={goFeed} promptQuickScan={promptQuickScan}
      isPremium={isPremium} scanTokens={scanTokens} isAdmin={isAdmin} user={user} logout={logout}
      mealHistory={mealHistory} historyLoading={historyLoading}
      expandedMealIds={expandedMealIds} toggleMealExpand={toggleMealExpand} deleteHistoryEntry={deleteHistoryEntry}
      showPaywall={showPaywall} setShowPaywall={setShowPaywall}
      showQuickScan={showQuickScan} setShowQuickScan={setShowQuickScan} quickScanLoading={quickScanLoading}
      quickScanName={quickScanName} setQuickScanName={setQuickScanName}
      quickScanAddr={quickScanAddr} setQuickScanAddr={setQuickScanAddr}
      quickScanItems={quickScanItems} quickScanQty={quickScanQty} setQuickScanQty={setQuickScanQty}
      quickScanBanner={quickScanBanner} quickScanMatchPct={quickScanMatchPct} quickScanTotals={quickScanTotals}
      incQuickQty={incQuickQty} decQuickQty={decQuickQty} confirmQuickScan={confirmQuickScan}
      showQuickScanSubmit={showQuickScanSubmit} setShowQuickScanSubmit={setShowQuickScanSubmit}
      quickScanSubmitStatus={quickScanSubmitStatus} setQuickScanSubmitStatus={setQuickScanSubmitStatus}
      quickScanSubmitError={quickScanSubmitError} setQuickScanSubmitError={setQuickScanSubmitError}
      handleQuickScanSubmit={handleQuickScanSubmit}
    />
  );

  if (view === 'feed') return (
    <FeedView
      goHome={goHome} openDetail={openDetail}
      targetP={targetP} targetC={targetC} targetF={targetF}
      restaurants={restaurants} feedLoading={feedLoading} setRestaurants={setRestaurants}
      feedMode={feedMode} setFeedMode={setFeedMode}
      feedQuery={feedQuery} setFeedQuery={setFeedQuery}
      searchRadius={searchRadius} setSearchRadius={setSearchRadius}
      searchRadiusRef={searchRadiusRef} loadFeed={loadFeed}
    />
  );

  if (view === 'detail') return (
    <DetailView
      setView={setView} goHome={goHome} selName={selName}
      targetP={targetP} targetC={targetC} targetF={targetF}
      menuItems={menuItems} ocrItems={ocrItems}
      itemQty={itemQty} setItemQty={setItemQty} incQty={incQty} decQty={decQty}
      stepDraft={stepDraft} setStepDraft={setStepDraft}
      totals={totals} matchPct={matchPct} menuFromCache={menuFromCache} menuLoading={menuLoading}
      promptScan={promptScan} ocrLoading={ocrLoading} ocrFromCache={ocrFromCache} clearOcrCache={clearOcrCache}
      instructionBanner={instructionBanner} uploadedBanner={uploadedBanner} rec={rec}
      activeMenuTab={activeMenuTab} setActiveMenuTab={setActiveMenuTab}
      openEdit={openEdit}
      editItem={editItem} setEditItem={setEditItem} editName={editName} setEditName={setEditName}
      editP={editP} setEditP={setEditP} editC={editC} setEditC={setEditC} editF={editF} setEditF={setEditF}
      saveMacroEdit={saveMacroEdit}
      openSubmitModal={openSubmitModal} showSubmitModal={showSubmitModal} setShowSubmitModal={setShowSubmitModal}
      submitRestName={submitRestName} setSubmitRestName={setSubmitRestName}
      submitAddr={submitAddr} setSubmitAddr={setSubmitAddr}
      submitStatus={submitStatus} submitError={submitError} handleSubmitToDb={handleSubmitToDb}
      confirmMeal={confirmMeal}
      showPaywall={showPaywall} setShowPaywall={setShowPaywall}
    />
  );

  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
