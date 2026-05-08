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
import MatchRing                                             from './src/components/MatchRing';
import { getCurrentLocation, searchNearbyRestaurantsLive }  from './src/services/proximityService';
import { analyzeMenuImage, MenuVisionRateLimitError }        from './src/services/menuVisionService';
import { RESTAURANT_DB }                                     from './src/data/restaurantDB';
import { VERIFIED_MENUS }                                    from './src/data/verifiedMenus';
import ChipotleBuilder                                       from './src/components/ChipotleBuilder';
import { s, C }                                              from './src/styles/appStyles';

// ─── Constants ────────────────────────────────────────────────────────────────
const CACHE_PREFIX   = 'menu_v2_';
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

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {

  // ── View stack: 'home' | 'feed' | 'detail' ───────────────────────────────
  const [view, setView] = useState('home');

  // ── Home: meal macro targets ──────────────────────────────────────────────
  const [targetP, setTargetP] = useState('');
  const [targetC, setTargetC] = useState('');
  const [targetF, setTargetF] = useState('');

  // ── Feed ──────────────────────────────────────────────────────────────────
  const [restaurants, setRestaurants] = useState([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const searchCtxRef = useRef(null);

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

  // ── Detail: OCR scan ──────────────────────────────────────────────────────
  const [ocrItems,    setOcrItems]    = useState([]);
  const [ocrLoading,  setOcrLoading]  = useState(false);
  const [verifiedIds, setVerifiedIds] = useState(new Set());

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
      const results = await searchNearbyRestaurantsLive(center);
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
    setMenuItems([]);  // Flush any stale FatSecret/cached data immediately on entry
    setItemQty({}); setOcrItems([]); setVerifiedIds(new Set());
    setMenuFromCache(false);
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

  // ─── Derived: totals + match % ────────────────────────────────────────────
  const totals = useMemo(() => {
    let p = 0, c = 0, f = 0;
    for (const item of menuItems ?? []) {
      const q = itemQty[item.name] || 0;
      if (q) { p += item.protein * q; c += item.carbs * q; f += item.fat * q; }
    }
    return { protein: Math.round(p), carbs: Math.round(c), fat: Math.round(f) };
  }, [menuItems, itemQty]);

  const matchPct = useMemo(() => {
    const tP = parseFloat(targetP) || 0, tC = parseFloat(targetC) || 0, tF = parseFloat(targetF) || 0;
    if (!tP && !tC && !tF) return 0;
    if (!Object.values(itemQty).some(q => q > 0)) return 0;
    return Math.min(100, Math.round(calculateMatchPercentage({ protein: tP, carbs: tC, fat: tF }, totals)));
  }, [totals, targetP, targetC, targetF, itemQty]);

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
      // Purge stale FatSecret/cached data so scan results are the source of truth
      setMenuItems([]);

      // Clean impossible macro items before building the dedup list
      const cleanItems = cleanMenuItems(menuItems ?? []);

      setOcrItems([]); setOcrLoading(true);
      try {
        const existing = cleanItems.map(i => i.name);
        const items    = await analyzeMenuImage(base64, selName, existing);
        if (!items.length) Alert.alert('Scan Failed', "Couldn't find items. Try a clearer photo.");
        else setOcrItems(items);
      } catch (err) {
        console.log('FULL_API_ERROR:', JSON.stringify(err, null, 2));
        // Raw error message from Google — no custom wrappers so the real response is visible
        Alert.alert('Scan Error', err?.message ?? JSON.stringify(err));
      } finally { setOcrLoading(false); }
    };

    // Geofence bypass — home testing in Spring, TX
    // const isVerified = true; // TODO: replace with real haversine check pre-ship
    await doScan();
  }, [menuItems, selName]);

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
    const cacheKey = `${CACHE_PREFIX}${selPlaceId.current || selName}`;
    setMenuItems(prev => {
      if (!prev) return prev;
      const updated = prev.map(it => it.name === editItem.name
        ? { ...it, name: editName.trim() || it.name, protein: p, carbs: c, fat: f, dataSource: 'userCorrected' }
        : it);
      cacheWrite(cacheKey, updated);
      return updated;
    });
    setEditItem(null);
  };

  // ─── Qty helpers ──────────────────────────────────────────────────────────
  const incQty = (name) => setItemQty(p => ({ ...p, [name]: (p[name] || 0) + 1 }));
  const decQty = (name) => setItemQty(p => {
    const next = (p[name] || 0) - 1;
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
    const proteins  = items.filter(i => i.category === 'protein');
    const bases     = items.filter(i => i.category === 'base');
    const addons    = items.filter(i => i.category === 'addon');
    const hasMenu   = items.length > 0 || ocrItems.length > 0;
    const hasSelect = Object.values(itemQty).some(q => q > 0);

    const renderItem = (item) => {
      const qty    = itemQty[item.name] || 0;
      const active = qty > 0;
      const macro  = [item.protein > 0 ? `${item.protein}P` : '', item.carbs > 0 ? `${item.carbs}C` : '', item.fat > 0 ? `${item.fat}F` : ''].filter(Boolean).join(' · ');
      const scaled = qty > 1 ? `  ×${qty} = ${Math.round(item.protein*qty)}P ${Math.round(item.carbs*qty)}C ${Math.round(item.fat*qty)}F` : '';
      return (
        <View key={item.name} style={[s.menuRow, active && s.menuRowActive]}>
          <TouchableOpacity style={{ flex: 1, marginRight: 8 }} onPress={() => openEdit(item)} activeOpacity={0.7}>
            <Text style={[s.menuName, active && s.menuNameActive]}>{item.name}</Text>
            <View style={s.pillRow}>
              <View style={s.pill}><Text style={s.pillTxt}>{macro}{scaled}</Text></View>
              {item.dataSource === 'verified' && <View style={s.tagOfficial}><Text style={s.tagOfficialTxt}>★ OFFICIAL</Text></View>}
              {item.isAIResult && item.dataSource !== 'userCorrected' && <View style={s.tagAI}><Text style={s.tagAITxt}>✨ AI</Text></View>}
              {item.dataSource === 'userCorrected' && <View style={s.tagEdited}><Text style={s.tagEditedTxt}>✏️ Edited</Text></View>}
            </View>
          </TouchableOpacity>
          <View style={s.stepRow}>
            <TouchableOpacity style={[s.stepBtn, !qty && s.stepBtnDim]} onPress={() => decQty(item.name)} hitSlop={{ top:10, bottom:10, left:10, right:6 }} activeOpacity={qty ? 0.65 : 1}>
              <Text style={[s.stepIcon, !qty && s.stepIconDim]}>−</Text>
            </TouchableOpacity>
            <Text style={[s.stepCount, active && s.stepCountActive]}>{qty || '0'}</Text>
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
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {ocrItems.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionLabel}>✨ SCANNED — TAP VERIFY TO SAVE</Text>
                {ocrItems.map(item => {
                  const isVfd  = verifiedIds.has(item.id);
                  const macro  = [item.protein > 0 ? `${item.protein}P` : '', item.carbs > 0 ? `${item.carbs}C` : '', item.fat > 0 ? `${item.fat}F` : ''].filter(Boolean).join(' · ');
                  return (
                    <View key={item.id} style={[s.menuRow, isVfd && s.menuRowActive]}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={[s.menuName, isVfd && s.menuNameActive]}>{item.name}</Text>
                        <View style={s.pillRow}>
                          <View style={s.pill}><Text style={s.pillTxt}>{macro}</Text></View>
                          {!isVfd && <View style={s.tagAI}><Text style={s.tagAITxt}>Draft</Text></View>}
                        </View>
                      </View>
                      {isVfd
                        ? <Text style={{ fontSize: 20 }}>✅</Text>
                        : <TouchableOpacity style={s.verifyBtn} onPress={() => verifyOcrItem(item)} activeOpacity={0.75}><Text style={s.verifyBtnTxt}>Verify ✓</Text></TouchableOpacity>
                      }
                    </View>
                  );
                })}
              </View>
            )}
            {renderSection('PROTEINS', proteins)}
            {renderSection('BASES',    bases)}
            {renderSection('ADD-ONS',  addons)}
            <View style={{ height: 120 }} />
          </ScrollView>
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
