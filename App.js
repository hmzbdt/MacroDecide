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
import { RESTAURANT_DB }                                     from './src/data/restaurantDB';
import { VERIFIED_MENUS }                                    from './src/data/verifiedMenus';
import ChipotleBuilder                                       from './src/components/ChipotleBuilder';
import { s, C }                                              from './src/styles/appStyles';
import Slider                                                from '@react-native-community/slider';

// ─── Constants ────────────────────────────────────────────────────────────────
const CACHE_PREFIX   = 'menu_v2_';
const UPL_PREFIX     = 'user_upload_v1_';
const CACHE_TTL_MS   = 7 * 24 * 60 * 60 * 1000;
const GEO_RADIUS_M   = 200;
const SEARCH_CTX_KEY = '@md_search_ctx';

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

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {

  // ── View stack: 'home' | 'feed' | 'detail' ───────────────────────────────
  const [view, setView] = useState('home');

  // ── Home: meal macro targets ──────────────────────────────────────────────
  const [targetP, setTargetP] = useState('');
  const [targetC, setTargetC] = useState('');
  const [targetF, setTargetF] = useState('');

  // ── Feed ──────────────────────────────────────────────────────────────────
  const [restaurants,   setRestaurants]   = useState([]);
  const [feedLoading,   setFeedLoading]   = useState(false);
  const [searchRadius,  setSearchRadius]  = useState(5);
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
  const [verifiedIds,   setVerifiedIds]   = useState(new Set());
  const [activeMenuTab, setActiveMenuTab] = useState('official');

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
    AsyncStorage.getItem(`${UPL_PREFIX}${selName}`)
      .then(raw => {
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (Array.isArray(saved) && saved.length) setOcrItems(saved);
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
      setOcrItems([]); setOcrLoading(true);
      try {
        const existing = ocrItems.map(i => i.name);
        const items    = await analyzeMenuImage(base64, selName, existing);
        if (!items.length) Alert.alert('Scan Failed', "Couldn't find items. Try a clearer photo.");
        else {
          setOcrItems(items);
          setActiveMenuTab('uploaded');
          AsyncStorage.setItem(`${UPL_PREFIX}${selName}`, JSON.stringify(items)).catch(() => {});
        }
      } catch (err) {
        console.log('FULL_API_ERROR:', JSON.stringify(err, null, 2));
        Alert.alert('Scan Error', err?.message ?? JSON.stringify(err));
      } finally { setOcrLoading(false); }
    };

    await doScan();
  }, [ocrItems, selName]);

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

  const promptScan = () => Alert.alert('Scan Menu', 'Add items from a photo:', [
    { text: 'Take Photo',          onPress: () => pickAndScan('camera')  },
    { text: 'Choose from Library', onPress: () => pickAndScan('library') },
    { text: 'Cancel',              style: 'cancel' },
  ]);

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

  // ═══════════════════════════════════════════════════════════════════════════
  // HOME
  // ═══════════════════════════════════════════════════════════════════════════
  const hasTargets = (parseFloat(targetP)||0) + (parseFloat(targetC)||0) + (parseFloat(targetF)||0) > 0;

  if (view === 'home') return (
    <SafeAreaView style={s.root}>
      <StatusBar style="light" />
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
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // FEED
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === 'feed') {
    const targets = { protein: parseFloat(targetP)||0, carbs: parseFloat(targetC)||0, fat: parseFloat(targetF)||0 };

    const rawList = restaurants.length > 0 ? restaurants
      : (!feedLoading ? Object.keys(COMBINED_MENUS).map(name => ({ name, distance: null, address: null, latitude: null, longitude: null, placeId: null })) : []);

    const cards = rawList.map(r => {
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

    return (
      <SafeAreaView style={s.root}>
        <StatusBar style="light" />
        <View style={s.header}>
          <TouchableOpacity onPress={goHome} style={s.headerIcon} activeOpacity={0.7}>
            <Ionicons name="home-outline" size={20} color={C.gray} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Nearby Restaurants</Text>
          <TouchableOpacity onPress={() => { setRestaurants([]); loadFeed(true); }} style={s.headerIcon} activeOpacity={0.7}>
            <Ionicons name="refresh-outline" size={20} color={C.accent} />
          </TouchableOpacity>
        </View>
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
            maximumTrackTintColor='rgba(255,255,255,0.15)'
            thumbTintColor={C.accent}
          />
          <Text style={s.radiusValue}>{searchRadius} mi</Text>
        </View>
        {feedLoading ? (
          <View style={s.center}><ActivityIndicator size="large" color={C.accent} /><Text style={s.centerTxt}>Finding restaurants nearby…</Text></View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.feedList} showsVerticalScrollIndicator={false}>
            {cards.length === 0
              ? <View style={s.center}><Ionicons name="location-outline" size={48} color={C.muted} /><Text style={s.centerTxt}>No restaurants found.{'\n'}Check location permissions.</Text></View>
              : cards.map((r, i) => {
                  const bg = r.bestPct == null ? '#444' : r.bestPct >= 80 ? C.accent : r.bestPct >= 50 ? '#D4860A' : '#444';
                  return (
                    <TouchableOpacity key={`${r.name}-${i}`} style={s.feedCard} onPress={() => openDetail(r)} activeOpacity={0.78}>
                      <View style={s.feedThumb}><Text style={s.feedInitials}>{r.name?.[0]?.toUpperCase() ?? '?'}</Text></View>
                      <View style={{ flex: 1 }}>
                        <View style={s.feedCardTop}>
                          <Text style={s.feedName} numberOfLines={1}>{r.name}</Text>
                          <View style={[s.badge, { backgroundColor: bg }]}><Text style={s.badgeTxt}>{r.bestPct != null ? `${r.bestPct}% Match` : 'Tap to load'}</Text></View>
                        </View>
                        {r.bestFit ? <Text style={s.feedSub} numberOfLines={1}>Best: {r.bestFit}</Text>
                          : r.distance != null ? <Text style={s.feedSub}>{r.distance < 0.1 ? 'Nearby' : `${r.distance.toFixed(1)} mi`}</Text>
                          : null}
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.25)" />
                    </TouchableOpacity>
                  );
                })
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
        ? { borderColor: 'rgba(255,183,77,0.35)', backgroundColor: 'rgba(255,183,77,0.1)' }
        : { borderColor: 'rgba(0,121,107,0.4)',   backgroundColor: 'rgba(0,121,107,0.1)' };
      const chipColor = sug?.limitedBy ? '#ffb74d' : '#00796b';
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
        <StatusBar style="light" />
        <View style={s.header}>
          <TouchableOpacity onPress={goHome} style={s.headerIcon} activeOpacity={0.7}>
            <Ionicons name="home-outline" size={20} color={C.gray} />
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>{selName}</Text>
          <TouchableOpacity onPress={() => setView('feed')} style={s.headerIcon} activeOpacity={0.7}>
            <Ionicons name="arrow-back-outline" size={20} color={C.accent} />
          </TouchableOpacity>
        </View>

        {/* Macro match bar */}
        <View style={s.matchBar}>
          <MatchRing percentage={matchPct} size={80} />
          <View style={s.barsWrap}>
            {[
              { label: 'P', val: totals.protein, target: tP, color: '#4fc3f7' },
              { label: 'C', val: totals.carbs,   target: tC, color: '#aed581' },
              { label: 'F', val: totals.fat,      target: tF, color: '#ffb74d' },
            ].map(({ label, val, target, color }) => {
              const pct = target > 0 ? Math.min(100, (val / target) * 100) : 0;
              const over = target > 0 && val > target;
              return (
                <View key={label} style={s.barRow}>
                  <Text style={s.barLabel}>{label}</Text>
                  <View style={s.barTrack}><View style={[s.barFill, { width: `${pct}%`, backgroundColor: over ? '#ff6b6b' : color }]} /></View>
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
              ? <ActivityIndicator size="small" color="#4fc3f7" />
              : <><Ionicons name="camera-outline" size={14} color="#4fc3f7" style={{ marginRight: 6 }} /><Text style={s.scanBtnTxt}>Scan Physical Menu</Text></>
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
                <Text style={[s.tabBtnTxt, activeMenuTab === 'uploaded' && s.tabBtnTxtActive]}>
                  {`User Uploaded${ocrItems.length > 0 ? ` (${ocrItems.length})` : ''}`}
                </Text>
              </TouchableOpacity>
            </View>
            {activeMenuTab === 'official' ? (
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                {instructionBanner && (
                  <View style={[
                    s.recCard,
                    { borderLeftWidth: 4 },
                    instructionBanner.isWarning
                      ? { backgroundColor: 'rgba(255,183,77,0.08)', borderColor: 'rgba(255,183,77,0.25)', borderLeftColor: '#ffb74d' }
                      : { borderLeftColor: instructionBanner.isPerfect ? '#00e676' : C.accent },
                  ]}>
                    <View style={s.recHeaderRow}>
                      <Ionicons
                        name={instructionBanner.isWarning ? 'warning-outline' : 'flash'}
                        size={13}
                        color={instructionBanner.isWarning ? '#ffb74d' : instructionBanner.isPerfect ? '#00e676' : C.accent}
                      />
                      <Text style={[s.recHeaderTxt,
                        instructionBanner.isWarning && { color: '#ffb74d' },
                        instructionBanner.isPerfect && { color: '#00e676' },
                      ]}>
                        {instructionBanner.isWarning ? 'Cap Warning' : instructionBanner.isPerfect ? 'Perfect Match' : 'Smart Suggestion'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
                      <Text style={{
                        flex: 1, fontSize: 15, fontWeight: '800', lineHeight: 22, marginRight: 10,
                        color: instructionBanner.isWarning ? '#ffb74d' : instructionBanner.isPerfect ? '#00e676' : '#00796b',
                      }}>
                        {instructionBanner.text}
                      </Text>
                      <TouchableOpacity
                        style={[s.recLogBtn, { alignSelf: 'flex-start' }, instructionBanner.isWarning && { backgroundColor: '#d4860a' }]}
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
                      color: instructionBanner.isWarning ? '#ffb74d' : instructionBanner.isPerfect ? '#00e676' : C.accent,
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
                    {uploadedBanner && (
                      <View style={[
                        s.recCard,
                        { borderLeftWidth: 4 },
                        uploadedBanner.isWarning
                          ? { backgroundColor: 'rgba(255,183,77,0.08)', borderColor: 'rgba(255,183,77,0.25)', borderLeftColor: '#ffb74d' }
                          : { borderLeftColor: uploadedBanner.isPerfect ? '#00e676' : C.accent },
                      ]}>
                        <View style={s.recHeaderRow}>
                          <Ionicons
                            name={uploadedBanner.isWarning ? 'warning-outline' : 'flash'}
                            size={13}
                            color={uploadedBanner.isWarning ? '#ffb74d' : uploadedBanner.isPerfect ? '#00e676' : C.accent}
                          />
                          <Text style={[s.recHeaderTxt,
                            uploadedBanner.isWarning && { color: '#ffb74d' },
                            uploadedBanner.isPerfect && { color: '#00e676' },
                          ]}>
                            {uploadedBanner.isWarning ? 'Cap Warning' : uploadedBanner.isPerfect ? 'Perfect Match' : 'Smart Suggestion'}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
                          <Text style={{
                            flex: 1, fontSize: 15, fontWeight: '800', lineHeight: 22, marginRight: 10,
                            color: uploadedBanner.isWarning ? '#ffb74d' : uploadedBanner.isPerfect ? '#00e676' : '#00796b',
                          }}>
                            {uploadedBanner.text}
                          </Text>
                          <TouchableOpacity
                            style={[s.recLogBtn, { alignSelf: 'flex-start' }, uploadedBanner.isWarning && { backgroundColor: '#d4860a' }]}
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
                          color: uploadedBanner.isWarning ? '#ffb74d' : uploadedBanner.isPerfect ? '#00e676' : C.accent,
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
            onPress={hasSelect ? () => Alert.alert('Meal Confirmed ✓',
              `${totals.protein}g P · ${totals.carbs}g C · ${totals.fat}g F`,
              [{ text: 'Done', onPress: goHome }]) : undefined}
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
      </SafeAreaView>
    );
  }

  return null;
}
