import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  TouchableWithoutFeedback,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Switch,
  ScrollView,
  Modal,
  Image,
  Alert,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  calculateMatchPercentage,
  exceedsConstraints,
  generateAnalysis,
  generateConciseAnalysis,
} from './src/utils/engine';
import { ALL_ITEMS } from './src/data/menuItems';
import { SNACKS } from './src/data/snacks';
import { RECIPES, RecipeItem } from './src/data/recipes';
import { STAPLE_INGREDIENTS } from './src/data/staples';
import BarcodeScanner from './src/components/BarcodeScanner';
import MatchRing from './src/components/MatchRing';
import MacroPills from './src/components/MacroPills';
import {
  getCurrentLocation,
  findAllNearbyRestaurants,
  openMapsWithDirections,
  formatDistanceLong,
  isWithinRadius,
  getMaxRadius,
} from './src/services/proximityService';
import { getRestaurantMenu } from './src/services/menuDataEngine';
import { RESTAURANT_DB } from './src/data/restaurantDB';

const STORAGE_KEY = '@macrodecide_targets';
const HISTORY_KEY = '@macrodecide_history';
const BASELINE_KEY = '@macrodecide_baseline';
const LAST_DATE_KEY = '@macrodecide_last_date';
const CUSTOM_MEALS_KEY = '@macrodecide_custom_meals';
const USER_STAPLES_KEY = '@macrodecide_user_staples';
const UNIT_PREF_KEY = '@macrodecide_unit_pref';
const MEALS_PREFIX = 'meals_';

// Date helpers — pure, no state
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const mealKey = (iso) => `${MEALS_PREFIX}${iso}`;
const shiftDate = (iso, days) => {
  const [y, m, dd] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, dd + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const formatLedgerDate = (iso) => {
  if (!iso) return '';
  const today = todayISO();
  if (iso === today) return 'Today';
  if (iso === shiftDate(today, -1)) return 'Yesterday';
  const [y, m, dd] = iso.split('-').map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

// ─── Eat Out Map constants ───────────────────────────────────────────────────
const SCREEN_HEIGHT = Dimensions.get('window').height;
const RESTAURANT_BRAND = {
  'Chipotle':    { color: '#A81612', initials: 'C'  },
  'Chick-fil-A': { color: '#E31837', initials: 'CF' },
  'Wingstop':    { color: '#FE6801', initials: 'WS' },
  'Whataburger': { color: '#F5821F', initials: 'WB' },
};

// ─── Decomposed restaurant menus for interactive detail view ─────────────────
const COLORS = {
  darkGreen: '#004d4d',
  darkBlue: '#001a1a',
  accentGreen: '#00796b',
  white: '#ffffff',
  lightGray: '#e0e0e0',
  muted: '#A0A0A0',
};

// ── Sub-view header: home icon (left) + centered title + optional back link ──
function SubViewHeader({ title, onHome, backLabel, onBack }) {
  return (
    <View style={subHeaderStyles.wrapper}>
      <View style={subHeaderStyles.bar}>
        <TouchableOpacity style={subHeaderStyles.homeBtn} onPress={onHome} activeOpacity={0.7}>
          <Ionicons name="home-outline" size={22} color="#e0e0e0" />
        </TouchableOpacity>
        <Text style={subHeaderStyles.title} numberOfLines={1}>{title}</Text>
        <View style={subHeaderStyles.spacer} />
      </View>
      {backLabel && onBack && (
        <TouchableOpacity style={subHeaderStyles.backRow} onPress={onBack} activeOpacity={0.6}>
          <Text style={subHeaderStyles.backRowText}>{backLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const subHeaderStyles = StyleSheet.create({
  wrapper: {
    width: '100%',
    backgroundColor: '#121212',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  homeBtn: {
    padding: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#e0e0e0',
    letterSpacing: 0.4,
  },
  spacer: {
    width: 46,
  },
  backRow: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backRowText: {
    fontSize: 13,
    color: '#A0A0A0',
  },
});
// ─────────────────────────────────────────────────────────────────────────────

// Baseline Editor Component
function BaselineEditor({ baseline, onSave, onCancel }) {
  const [tempProtein, setTempProtein] = useState(baseline.protein);
  const [tempCarbs, setTempCarbs] = useState(baseline.carbs);
  const [tempFat, setTempFat] = useState(baseline.fat);

  const handleSave = () => {
    Keyboard.dismiss();
    onSave({
      protein: tempProtein || '0',
      carbs: tempCarbs || '0',
      fat: tempFat || '0',
    });
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={baselineStyles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={baselineStyles.keyboardAvoid}
        >
          <View style={baselineStyles.modal}>
            <Text style={baselineStyles.title}>Set Daily Goals</Text>
            <Text style={baselineStyles.subtitle}>
              These values reset your targets each morning.
            </Text>

            <View style={baselineStyles.inputRow}>
              <Text style={baselineStyles.label}>Protein (g)</Text>
              <TextInput
                style={baselineStyles.input}
                value={tempProtein}
                onChangeText={setTempProtein}
                keyboardType="numeric"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                placeholder="70"
                placeholderTextColor={COLORS.muted}
              />
            </View>

            <View style={baselineStyles.inputRow}>
              <Text style={baselineStyles.label}>Carbs (g)</Text>
              <TextInput
                style={baselineStyles.input}
                value={tempCarbs}
                onChangeText={setTempCarbs}
                keyboardType="numeric"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                placeholder="30"
                placeholderTextColor={COLORS.muted}
              />
            </View>

            <View style={baselineStyles.inputRow}>
              <Text style={baselineStyles.label}>Fat (g)</Text>
              <TextInput
                style={baselineStyles.input}
                value={tempFat}
                onChangeText={setTempFat}
                keyboardType="numeric"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                placeholder="15"
                placeholderTextColor={COLORS.muted}
              />
            </View>

            <View style={baselineStyles.buttons}>
              <TouchableOpacity style={baselineStyles.saveButton} onPress={handleSave}>
                <Text style={baselineStyles.saveButtonText}>Save Goals</Text>
              </TouchableOpacity>
              <TouchableOpacity style={baselineStyles.cancelButton} onPress={onCancel}>
                <Text style={baselineStyles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  );
}

const baselineStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 26, 26, 0.9)',
  },
  keyboardAvoid: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: COLORS.darkGreen,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 320,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
    marginBottom: 24,
  },
  inputRow: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    color: COLORS.lightGray,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.darkBlue,
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: COLORS.white,
    textAlign: 'center',
  },
  buttons: {
    marginTop: 8,
  },
  saveButton: {
    backgroundColor: COLORS.accentGreen,
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 10,
  },
  saveButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  cancelButton: {
    paddingVertical: 10,
  },
  cancelButtonText: {
    color: COLORS.muted,
    fontSize: 14,
    textAlign: 'center',
  },
});

// ─── Ingredient Scaling Helpers ───────────────────────────────────────────────
function formatScaledNumber(num) {
  if (num <= 0) return '0';
  if (num >= 10) return String(Math.round(num));
  // 5–10: round to nearest 0.5 (half-unit kitchen steps)
  if (num >= 5) {
    const rounded = Math.round(num * 2) / 2;
    const whole = Math.floor(rounded);
    return (rounded % 1) === 0.5 ? `${whole} 1/2` : String(whole);
  }
  // < 5: round to nearest 0.25 (quarter-unit kitchen steps)
  const rounded = Math.round(num * 4) / 4;
  const whole = Math.floor(rounded);
  const frac = Math.round((rounded - whole) * 4); // 0, 1, 2, or 3
  const fracStrs = ['', ' 1/4', ' 1/2', ' 3/4'];
  const pureFracs = ['0', '1/4', '1/2', '3/4'];
  if (whole === 0) return pureFracs[frac] || '1/4';
  return `${whole}${fracStrs[frac]}`;
}

function scaleIngredient(ingredientStr, factor) {
  if (!factor || Math.abs(factor - 1) < 0.05) return ingredientStr;

  // Special case: chicken breasts with oz notation → convert to total weight
  // e.g. "2 chicken breasts (6 oz each), sliced thin" → "about 1 lb chicken breast, sliced thin"
  const chickenMatch = ingredientStr.match(
    /^(\d+)\s+chicken breasts?\s*\((\d+(?:\.\d+)?)\s*oz each\)(.*)/i
  );
  if (chickenMatch) {
    const totalOz = parseFloat(chickenMatch[1]) * parseFloat(chickenMatch[2]) * factor;
    const rest = chickenMatch[3]; // e.g. ", sliced thin"
    if (totalOz >= 16) {
      return `about ${formatScaledNumber(totalOz / 16)} lbs chicken breast${rest}`;
    }
    return `about ${Math.round(totalOz)} oz chicken breast${rest}`;
  }

  // General case: scale all numeric quantities in the string
  return ingredientStr.replace(/\d+\/\d+|\d+(?:\.\d+)?/g, (match) => {
    let val;
    if (match.includes('/')) {
      const [n, d] = match.split('/');
      val = parseFloat(n) / parseFloat(d);
    } else {
      val = parseFloat(match);
    }
    return formatScaledNumber(val * factor);
  });
}
// ──────────────────────────────────────────────────────────────────────────────

const PREF_LABELS = {
  spicy: 'Spicy',
  vegetarian: 'Vegetarian',
  under30: 'Ready in under 30 minutes',
  highProtein: 'High Protein',
};

// Returns 100 if the serving factor is in the reasonable range [0.5, 2.0].
// Outside that range the score decays proportionally so a 5x portion is ~40%.
function recipeMatchPercentage(factor) {
  if (factor == null) return 100;
  if (factor >= 0.5 && factor <= 2.0) return 100;
  if (factor < 0.5) return Math.max(0, Math.round((factor / 0.5) * 100));
  return Math.max(0, Math.round((2.0 / factor) * 100));
}

function buildAIRecipePrompt(macros, prefList) {
  const p = Math.round(macros.protein);
  const c = Math.round(macros.carbs);
  const f = Math.round(macros.fat);
  return (
    `Generate a recipe that matches these exact macros: P: ${p}g, C: ${c}g, F: ${f}g. ` +
    `The recipe must be ${prefList}. ` +
    `Return only valid JSON with the following shape: ` +
    `{ "name": string, "macros": { "protein": number, "carbs": number, "fat": number }, ` +
    `"ingredients": string[] (include scaled weights in oz or g), "steps": string[] }.`
  );
}

function verifyAIRecipeMacros(targets, returned) {
  const fields = ['protein', 'carbs', 'fat'];
  const flags = [];
  for (const field of fields) {
    const target = targets[field];
    const actual = returned[field];
    if (target > 0 && Math.abs(actual - target) / target > 0.10) {
      flags.push({ field, target, actual, pctOff: Math.round(Math.abs(actual - target) / target * 100) });
    }
  }
  return flags; // empty array = all macros within 10%
}

function generateAIRecipe(macros, preferences) {
  const prefList = Object.entries(preferences)
    .filter(([, on]) => on)
    .map(([k]) => PREF_LABELS[k])
    .filter(Boolean)
    .join(', ') || 'Balanced';

  const prompt = buildAIRecipePrompt(macros, prefList);
  console.log('[AI Recipe Prompt]\n', prompt);

  // ── Placeholder: simulate an AI response and run macro verification ──
  // Replace `simulatedResponse` with the real parsed API JSON when live.
  const simulatedResponse = null;

  if (simulatedResponse) {
    const flags = verifyAIRecipeMacros(macros, simulatedResponse.macros);
    if (flags.length > 0) {
      const flagText = flags
        .map(f => `• ${f.field}: got ${f.actual}g, target ${f.target}g (${f.pctOff}% off)`)
        .join('\n');
      console.warn('[AI Macro Mismatch]\n', flagText);
      Alert.alert(
        '⚠️ Macro Mismatch',
        `The AI recipe is off by more than 10% on:\n\n${flagText}\n\nRecalculating…`,
        [{ text: 'OK' }],
      );
      return;
    }
  }

  Alert.alert(
    '✨ AI Recipe (Coming Soon)',
    `Prompt ready for your targets:\n\nP: ${Math.round(macros.protein)}g · C: ${Math.round(macros.carbs)}g · F: ${Math.round(macros.fat)}g\n\nPreferences: ${prefList}\n\nConnect an API key to enable live generation.`,
    [{ text: 'Got it', style: 'cancel' }],
  );
}
// ──────────────────────────────────────────────────────────────────────────────

export default function App() {
  // View navigation
  const [currentView, setCurrentView] = useState('home');

  // Search inputs (what user is looking for this meal)
  const [searchProtein, setSearchProtein] = useState('');
  const [searchCarbs, setSearchCarbs] = useState('');
  const [searchFat, setSearchFat] = useState('');

  // Remaining daily balance (fuel gauge)
  const [remainingProtein, setRemainingProtein] = useState('70');
  const [remainingCarbs, setRemainingCarbs] = useState('30');
  const [remainingFat, setRemainingFat] = useState('15');

  const [results, setResults] = useState([]);
  const [noMatch, setNoMatch] = useState(false);
  const [strictMode, setStrictMode] = useState(false);
  const [history, setHistory] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannedResult, setScannedResult] = useState(null);
  const [baseline, setBaseline] = useState({ protein: '70', carbs: '30', fat: '15' });
  const [showBaselineEditor, setShowBaselineEditor] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [nearbyRestaurants, setNearbyRestaurants] = useState(new Map()); // nearest per brand — for scoring
  const [allNearbyLocations, setAllNearbyLocations] = useState([]); // all storefronts — for map markers
  const [locationLoading, setLocationLoading] = useState(false);
  const [eatOutStep, setEatOutStep] = useState('briefing'); // 'briefing' | 'map' | 'detail'
  const [eatOutTargetProtein, setEatOutTargetProtein] = useState('');
  const [eatOutTargetCarbs, setEatOutTargetCarbs] = useState('');
  const [eatOutTargetFat, setEatOutTargetFat] = useState('');
  const [eatOutSelectedRestaurant, setEatOutSelectedRestaurant] = useState(null);
  const [eatOutProteinPick, setEatOutProteinPick] = useState(null);      // radio — single protein
  const [eatOutBaseSelections, setEatOutBaseSelections] = useState({});   // checkbox — bases
  const [eatOutAddonSelections, setEatOutAddonSelections] = useState({}); // checkbox — add-ons
  const [eoMenuData, setEoMenuData] = useState(null);   // RestaurantMenuItem[] | null
  const [eoMenuLoading, setEoMenuLoading] = useState(false);
  const eoDetailPulseAnim = useRef(new Animated.Value(0)).current;
  const eoDetailWasHitRef = useRef(false);
  const [dailyActivity, setDailyActivity] = useState([]);
  const [ledgerDate, setLedgerDate] = useState('');
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [resultQuantities, setResultQuantities] = useState([1, 1, 1]);
  const [scannedQuantity, setScannedQuantity] = useState(1);
  const [resultImageErrors, setResultImageErrors] = useState([false, false, false]);
  const [scannedImageError, setScannedImageError] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [showRecipeDetail, setShowRecipeDetail] = useState(false);
  const [recipeFilters, setRecipeFilters] = useState({ spicy: false, vegetarian: false, under30: false, highProtein: false });
  const [cookRecipeStep, setCookRecipeStep] = useState('macros'); // 'macros' | 'filter' | 'results'

  // Meal Builder state
  const [mealBuilderStep, setMealBuilderStep] = useState('targets'); // 'targets' | 'build'
  const [mbTargetProtein, setMbTargetProtein] = useState('');
  const [mbTargetCarbs, setMbTargetCarbs] = useState('');
  const [mbTargetFat, setMbTargetFat] = useState('');
  const [mbIngredients, setMbIngredients] = useState({}); // { id: grams }
  const [mbActiveIngredient, setMbActiveIngredient] = useState(null);
  const [mbUnit, setMbUnit] = useState('g'); // 'g' | 'oz'
  const [mbEditingText, setMbEditingText] = useState(''); // raw text in the active stepper TextInput
  const [showMealBuilderFinalize, setShowMealBuilderFinalize] = useState(false);
  const [mealBuilderMealName, setMealBuilderMealName] = useState('');
  const [savedCustomMeals, setSavedCustomMeals] = useState([]);
  // User-created staple ingredients
  const [userStaples, setUserStaples] = useState([]);
  const [showAddCustomFood, setShowAddCustomFood] = useState(false);
  const [customFoodName, setCustomFoodName] = useState('');
  const [customFoodProtein, setCustomFoodProtein] = useState('');
  const [customFoodCarbs, setCustomFoodCarbs] = useState('');
  const [customFoodFat, setCustomFoodFat] = useState('');
  const mbPulseAnim = useRef(new Animated.Value(0)).current;
  const mbWasHitRef = useRef(false);

  const resultOpacity = useRef(new Animated.Value(0)).current;
  const resultBorderColor = useRef(new Animated.Value(0)).current;
  const resultSlideY = useRef(new Animated.Value(30)).current;
  const scannedOpacity = useRef(new Animated.Value(0)).current;
  const scannedSlideY = useRef(new Animated.Value(30)).current;
  const inputFlash = useRef(new Animated.Value(0)).current;

  // Meal Builder: pulse dashboard green when match ≥ 95%
  useEffect(() => {
    if (currentView !== 'mealBuilder' || mealBuilderStep !== 'build') {
      mbPulseAnim.stopAnimation();
      mbPulseAnim.setValue(0);
      mbWasHitRef.current = false;
      return;
    }
    const tP = parseFloat(mbTargetProtein) || 0;
    const tC = parseFloat(mbTargetCarbs) || 0;
    const tF = parseFloat(mbTargetFat) || 0;
    if (tP + tC + tF === 0) return;
    let p = 0, c = 0, f = 0;
    for (const [id, grams] of Object.entries(mbIngredients)) {
      if (!grams) continue;
      const ing = STAPLE_INGREDIENTS.find(i => i.id === id) || userStaples.find(i => i.id === id);
      if (!ing) continue;
      p += ing.macrosPer100g.protein * grams / 100;
      c += ing.macrosPer100g.carbs * grams / 100;
      f += ing.macrosPer100g.fat * grams / 100;
    }
    const pct = calculateMatchPercentage({ protein: tP, carbs: tC, fat: tF }, { protein: p, carbs: c, fat: f });
    const isHit = pct >= 95;
    if (isHit && !mbWasHitRef.current) {
      mbPulseAnim.setValue(0);
      Animated.sequence([
        Animated.timing(mbPulseAnim, { toValue: 1, duration: 450, useNativeDriver: false }),
        Animated.timing(mbPulseAnim, { toValue: 0.3, duration: 450, useNativeDriver: false }),
        Animated.timing(mbPulseAnim, { toValue: 1, duration: 450, useNativeDriver: false }),
        Animated.timing(mbPulseAnim, { toValue: 0.3, duration: 450, useNativeDriver: false }),
        Animated.timing(mbPulseAnim, { toValue: 1, duration: 450, useNativeDriver: false }),
      ]).start();
    } else if (!isHit) {
      mbPulseAnim.stopAnimation();
      Animated.timing(mbPulseAnim, { toValue: 0, duration: 300, useNativeDriver: false }).start();
    }
    mbWasHitRef.current = isHit;
  }, [mbIngredients, mbTargetProtein, mbTargetCarbs, mbTargetFat, currentView, mealBuilderStep, userStaples]);

  // Meal Builder: reformat editing text when unit changes
  useEffect(() => {
    if (mbActiveIngredient) {
      const grams = mbIngredients[mbActiveIngredient] || 0;
      setMbEditingText(mbUnit === 'oz' ? (grams / 28.35).toFixed(1) : grams.toString());
    }
  }, [mbUnit]);

  // Load saved macros, history, baseline, and check for day reset
  useEffect(() => {
    const loadData = async () => {
      try {
        const today = todayISO();
        const [savedTargets, savedHistory, savedBaseline, savedDate, savedActivity, savedCustomMealsData, savedUserStaplesData, savedUnitPref] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(HISTORY_KEY),
          AsyncStorage.getItem(BASELINE_KEY),
          AsyncStorage.getItem(LAST_DATE_KEY),
          AsyncStorage.getItem(mealKey(today)),
          AsyncStorage.getItem(CUSTOM_MEALS_KEY),
          AsyncStorage.getItem(USER_STAPLES_KEY),
          AsyncStorage.getItem(UNIT_PREF_KEY),
        ]);

        // Load baseline (or use defaults)
        const baselineData = savedBaseline
          ? JSON.parse(savedBaseline)
          : { protein: '70', carbs: '30', fat: '15' };
        setBaseline(baselineData);

        // Check if we need to reset for a new day
        const isNewDay = savedDate !== today;

        if (isNewDay) {
          // New day: reset balance to baseline. Old data stays in its dated key — never deleted.
          setRemainingProtein(baselineData.protein);
          setRemainingCarbs(baselineData.carbs);
          setRemainingFat(baselineData.fat);
          // Smart Fill search inputs
          const mealsLeft = getMealsRemaining();
          const p = Math.round((parseFloat(baselineData.protein) || 0) / mealsLeft);
          const c = Math.round((parseFloat(baselineData.carbs) || 0) / mealsLeft);
          const f = Math.round((parseFloat(baselineData.fat) || 0) / mealsLeft);
          setSearchProtein(p.toString());
          setSearchCarbs(c.toString());
          setSearchFat(f.toString());
          setDailyActivity([]);
          await AsyncStorage.setItem(LAST_DATE_KEY, today);
        } else {
          // Same day: restore remaining balance
          if (savedTargets) {
            const { protein: p, carbs: c, fat: f } = JSON.parse(savedTargets);
            setRemainingProtein(p ?? baselineData.protein);
            setRemainingCarbs(c ?? baselineData.carbs);
            setRemainingFat(f ?? baselineData.fat);
          }
          // Smart Fill search inputs based on current remaining
          const mealsLeft = getMealsRemaining();
          const remP = savedTargets ? JSON.parse(savedTargets).protein : baselineData.protein;
          const remC = savedTargets ? JSON.parse(savedTargets).carbs : baselineData.carbs;
          const remF = savedTargets ? JSON.parse(savedTargets).fat : baselineData.fat;
          setSearchProtein(Math.round((parseFloat(remP) || 0) / mealsLeft).toString());
          setSearchCarbs(Math.round((parseFloat(remC) || 0) / mealsLeft).toString());
          setSearchFat(Math.round((parseFloat(remF) || 0) / mealsLeft).toString());
          if (savedActivity) {
            setDailyActivity(JSON.parse(savedActivity));
          }
        }

        if (savedHistory) {
          setHistory(JSON.parse(savedHistory));
        }

        if (savedCustomMealsData) {
          setSavedCustomMeals(JSON.parse(savedCustomMealsData));
        }

        if (savedUserStaplesData) {
          setUserStaples(JSON.parse(savedUserStaplesData));
        }

        if (savedUnitPref === 'g' || savedUnitPref === 'oz') {
          setMbUnit(savedUnitPref);
        }
      } catch (_) {
        // First launch or corrupted data — start fresh
      } finally {
        setLoaded(true);
      }
    };
    loadData();
  }, []);

  // Auto-save remaining balance whenever it changes (skip the initial load)
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      protein: remainingProtein,
      carbs: remainingCarbs,
      fat: remainingFat,
    }));
  }, [remainingProtein, remainingCarbs, remainingFat, loaded]);

  // Persist unit preference (g / oz) so it survives restarts and is shared
  // across both the Meal Builder and the Eat Out detail view.
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(UNIT_PREF_KEY, mbUnit);
  }, [mbUnit, loaded]);

  // Fetch location and nearby restaurants on startup
  useEffect(() => {
    const fetchLocation = async () => {
      setLocationLoading(true);
      try {
        const location = await getCurrentLocation();
        if (location) {
          setUserLocation(location);
          const { nearest, all } = await findAllNearbyRestaurants(location);
          setNearbyRestaurants(nearest);   // Map<brand, nearestLoc> — for scoring
          setAllNearbyLocations(all);      // [{name, loc}] flat — for map markers
        }
      } catch (error) {
        console.log('Location not available:', error);
      } finally {
        setLocationLoading(false);
      }
    };
    fetchLocation();
  }, []);

  const animateResult = useCallback(() => {
    resultOpacity.setValue(0);
    resultBorderColor.setValue(0);
    resultSlideY.setValue(30);
    Animated.parallel([
      Animated.timing(resultOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: false,
      }),
      Animated.timing(resultSlideY, {
        toValue: 0,
        duration: 400,
        useNativeDriver: false,
      }),
      Animated.sequence([
        Animated.timing(resultBorderColor, {
          toValue: 1,
          duration: 500,
          useNativeDriver: false,
        }),
        Animated.timing(resultBorderColor, {
          toValue: 0,
          duration: 800,
          useNativeDriver: false,
        }),
      ]),
    ]).start();
  }, [resultOpacity, resultBorderColor, resultSlideY]);

  const handleFindMeal = () => {
    const target = {
      protein: parseFloat(searchProtein) || 0,
      carbs: parseFloat(searchCarbs) || 0,
      fat: parseFloat(searchFat) || 0,
    };

    if (target.protein === 0 && target.carbs === 0 && target.fat === 0) {
      setResults([]);
      setNoMatch(false);
      return;
    }

    // Select database based on current view
    const useProximity = currentView === 'eatOut';
    const database = (() => {
      if (currentView === 'quickSnack') return SNACKS;
      if (currentView === 'cookRecipe') {
        return RECIPES.filter(r => {
          if (recipeFilters.spicy && !r.isSpicy) return false;
          if (recipeFilters.vegetarian && !r.isVegetarian) return false;
          if (recipeFilters.under30 && (r.prepTimeMinutes ?? 999) > 30) return false;
          if (recipeFilters.highProtein && r.macros.protein < 45) return false;
          return true;
        });
      }
      return ALL_ITEMS;
    })();

    // Guard: no recipes match the active filters
    if (currentView === 'cookRecipe' && database.length === 0) {
      setResults([]);
      setNoMatch(true);
      return;
    }

    // Filter by strict mode constraints
    const candidates = strictMode
      ? database.filter((item) => !exceedsConstraints(target, item.macros))
      : database;

    // Calculate match % and attach location for each candidate
    const scoredCandidates = candidates.map((item) => {
      const percentage = calculateMatchPercentage(target, item.macros);
      const locationInfo = useProximity ? nearbyRestaurants.get(item.restaurant) : undefined;
      const distance = locationInfo?.distance ?? Infinity;
      const withinRadius = locationInfo ? isWithinRadius(distance) : false;

      return {
        ...item,
        percentage,
        locationInfo,
        distance,
        withinRadius,
      };
    });

    let finalCandidates;

    if (useProximity) {
      // The 10-Mile Rule: Filter to only restaurants within Consultant's Radius
      const hasLocationData = nearbyRestaurants.size > 0;
      const withinRadiusCandidates = hasLocationData
        ? scoredCandidates.filter((c) => c.withinRadius)
        : scoredCandidates;

      const sortedCandidates = [...withinRadiusCandidates].sort((a, b) => b.percentage - a.percentage);

      finalCandidates = sortedCandidates.length > 0
        ? sortedCandidates
        : [...scoredCandidates].sort((a, b) => b.percentage - a.percentage);
    } else {
      // Snacks & recipes: sort purely by match % descending
      finalCandidates = [...scoredCandidates].sort((a, b) => b.percentage - a.percentage);
    }

    // Take top 3 results
    const top3 = finalCandidates.slice(0, 3);
    const hasLocationData = useProximity && nearbyRestaurants.size > 0;

    if (top3.length > 0) {
      const isRecipeView = currentView === 'cookRecipe';

      const topResults = top3.map((match) => {
        const { pros, cons } = strictMode
          ? { pros: ['Within limits'], cons: [] }
          : generateConciseAnalysis(target, match.macros);

        // Recipe intelligence: 100% match + compute serving multiplier
        let servingMultiplier = null;
        if (isRecipeView) {
          const ratios = [];
          if (match.macros.protein > 0 && target.protein > 0)
            ratios.push(target.protein / match.macros.protein);
          if (match.macros.carbs > 0 && target.carbs > 0)
            ratios.push(target.carbs / match.macros.carbs);
          if (match.macros.fat > 0 && target.fat > 0)
            ratios.push(target.fat / match.macros.fat);
          if (ratios.length > 0) {
            servingMultiplier = Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 10) / 10;
          }
        }

        return {
          name: match.name,
          restaurant: match.restaurant,
          percentage: isRecipeView ? recipeMatchPercentage(servingMultiplier) : match.percentage,
          macros: match.macros,
          imageUrl: match.imageUrl || null,
          pros: isRecipeView ? ['Adjustable serving'] : pros,
          cons: isRecipeView ? [] : cons,
          location: match.locationInfo || null,
          outsideRadius: hasLocationData && !match.withinRadius,
          isRecipe: isRecipeView,
          servingMultiplier,
          highVolume: isRecipeView && servingMultiplier != null && servingMultiplier > 1.5,
          doubleUp: isRecipeView && servingMultiplier != null && servingMultiplier > 2,
          recipeDetails: isRecipeView ? {
            ingredients: match.ingredients || [],
            prepTime: match.prepTime || '',
            steps: match.steps || [],
          } : null,
        };
      });

      setResults(topResults);
      setResultQuantities([1, 1, 1]);
      setResultImageErrors([false, false, false]);
      setNoMatch(false);
      animateResult();

      // Save top match to history
      const bestMatch = topResults[0];
      const entry = {
        name: bestMatch.name,
        restaurant: bestMatch.restaurant,
        date: new Date().toLocaleDateString(),
      };
      const updated = [entry, ...history.filter(
        (h) => !(h.name === entry.name && h.restaurant === entry.restaurant)
      )].slice(0, 5);
      setHistory(updated);
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    } else {
      setResults([]);
      setNoMatch(strictMode);
    }
  };

  const navigateTo = (view) => {
    setResults([]);
    setNoMatch(false);
    setResultQuantities([1, 1, 1]);
    setResultImageErrors([false, false, false]);
    if (view === 'eatOut') {
      setEatOutStep('briefing');
      setEatOutSelectedRestaurant(null);
      setEatOutProteinPick(null);
      setEatOutBaseSelections({});
      setEatOutAddonSelections({});
      eoDetailWasHitRef.current = false;
      eoDetailPulseAnim.setValue(0);
      const mealsLeft = getMealsRemaining();
      const p = Math.max(0, Math.round((parseFloat(remainingProtein) || 0) / mealsLeft));
      const c = Math.max(0, Math.round((parseFloat(remainingCarbs) || 0) / mealsLeft));
      const f = Math.max(0, Math.round((parseFloat(remainingFat) || 0) / mealsLeft));
      setEatOutTargetProtein(p > 0 ? p.toString() : '');
      setEatOutTargetCarbs(c > 0 ? c.toString() : '');
      setEatOutTargetFat(f > 0 ? f.toString() : '');
    }
    if (view === 'eatAtHome') {
      setRecipeFilters({ spicy: false, vegetarian: false, under30: false, highProtein: false });
      setCookRecipeStep('filter');
      const mealsLeft = getMealsRemaining();
      const p = Math.max(0, Math.round((parseFloat(remainingProtein) || 0) / mealsLeft));
      const c = Math.max(0, Math.round((parseFloat(remainingCarbs) || 0) / mealsLeft));
      const f = Math.max(0, Math.round((parseFloat(remainingFat) || 0) / mealsLeft));
      setSearchProtein(p > 0 ? p.toString() : '');
      setSearchCarbs(c > 0 ? c.toString() : '');
      setSearchFat(f > 0 ? f.toString() : '');
    }
    if (view === 'cookRecipe') {
      setCookRecipeStep('macros');
      setRecipeFilters({ spicy: false, vegetarian: false, under30: false, highProtein: false });
    }
    if (view === 'mealBuilder') {
      setMealBuilderStep('targets');
      setMbIngredients({});
      setMbActiveIngredient(null);
      setMbUnit('g');
      setMbEditingText('');
      setMealBuilderMealName('');
      setShowMealBuilderFinalize(false);
      mbWasHitRef.current = false;
      mbPulseAnim.setValue(0);
      // Pre-fill targets with smart-split values
      const mealsLeft = getMealsRemaining();
      const p = Math.max(0, Math.round((parseFloat(remainingProtein) || 0) / mealsLeft));
      const c = Math.max(0, Math.round((parseFloat(remainingCarbs) || 0) / mealsLeft));
      const f = Math.max(0, Math.round((parseFloat(remainingFat) || 0) / mealsLeft));
      setMbTargetProtein(p > 0 ? p.toString() : '');
      setMbTargetCarbs(c > 0 ? c.toString() : '');
      setMbTargetFat(f > 0 ? f.toString() : '');
    }
    setCurrentView(view);
  };

  const goHome = () => {
    navigateTo('home');
  };

  const handleReset = () => {
    setSearchProtein('');
    setSearchCarbs('');
    setSearchFat('');
    setResults([]);
    setNoMatch(false);
    setScannedResult(null);
    setResultQuantities([1, 1, 1]);
    setScannedQuantity(1);
    setResultImageErrors([false, false, false]);
    setScannedImageError(false);
    resultOpacity.setValue(0);
    resultSlideY.setValue(30);
    scannedOpacity.setValue(0);
    scannedSlideY.setValue(30);
    setCurrentView('home');
  };

  const animateScannedResult = useCallback(() => {
    scannedOpacity.setValue(0);
    scannedSlideY.setValue(30);
    Animated.parallel([
      Animated.timing(scannedOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: false,
      }),
      Animated.timing(scannedSlideY, {
        toValue: 0,
        duration: 400,
        useNativeDriver: false,
      }),
    ]).start();
  }, [scannedOpacity, scannedSlideY]);

  const handleBarcodeScanned = (productData) => {
    setShowScanner(false);

    const target = {
      protein: parseFloat(searchProtein) || 0,
      carbs: parseFloat(searchCarbs) || 0,
      fat: parseFloat(searchFat) || 0,
    };

    const hasTargets = target.protein > 0 || target.carbs > 0 || target.fat > 0;

    // Calculate match percentage if user has targets set
    let matchPercentage = null;
    let matchAnalysis = null;
    let warnings = [];

    if (hasTargets) {
      matchPercentage = calculateMatchPercentage(target, productData.macros);

      // Check for specific issues (for highlighting why it's a poor match)
      if (target.fat > 0 && productData.macros.fat > target.fat * 1.2) {
        warnings.push('Too high in Fat');
      }
      if (target.carbs > 0 && productData.macros.carbs > target.carbs * 1.2) {
        warnings.push('Too high in Carbs');
      }
      if (target.protein > 0 && productData.macros.protein < target.protein * 0.5) {
        warnings.push('Low in Protein');
      }

      matchAnalysis = generateAnalysis(target, productData.macros);
    }

    setScannedResult({
      ...productData,
      matchPercentage,
      matchAnalysis,
      warnings,
      hasTargets,
    });
    setScannedQuantity(1);
    setScannedImageError(false);

    animateScannedResult();
  };

  const dismissScannedResult = () => {
    setScannedResult(null);
    scannedOpacity.setValue(0);
    scannedSlideY.setValue(30);
  };

  const deductMeal = (macros, mealName, restaurant = '', isAIEstimate = false, aiConfidence = null) => {
    // Validation logging
    console.log('=== DEDUCTION ===');
    console.log('Deducting:', macros.protein, 'P from', remainingProtein);
    console.log('Deducting:', macros.carbs, 'C from', remainingCarbs);
    console.log('Deducting:', macros.fat, 'F from', remainingFat);

    // Deduct from REMAINING balance (allow negatives to show overage)
    const newRemainingP = (parseFloat(remainingProtein) || 0) - macros.protein;
    const newRemainingC = (parseFloat(remainingCarbs) || 0) - macros.carbs;
    const newRemainingF = (parseFloat(remainingFat) || 0) - macros.fat;

    console.log('New remaining:', newRemainingP, 'P |', newRemainingC, 'C |', newRemainingF, 'F');

    // Update remaining balance
    setRemainingProtein(newRemainingP.toString());
    setRemainingCarbs(newRemainingC.toString());
    setRemainingFat(newRemainingF.toString());

    // Add to daily activity log
    const activityEntry = {
      id: Date.now().toString(),
      name: mealName,
      source: restaurant || 'Eat Out',
      macros: { ...macros },
      timestamp: new Date().toISOString(),
      time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      ...(isAIEstimate && { isAIEstimate: true }),
      ...(isAIEstimate && aiConfidence !== null && { aiConfidence }),
    };
    const updatedActivity = [activityEntry, ...dailyActivity];
    setDailyActivity(updatedActivity);
    AsyncStorage.setItem(mealKey(todayISO()), JSON.stringify(updatedActivity));

    // Clear search inputs to 0 (transaction complete)
    setSearchProtein('0');
    setSearchCarbs('0');
    setSearchFat('0');

    // Clear the result cards
    setResults([]);
    setScannedResult(null);
    resultOpacity.setValue(0);
    scannedOpacity.setValue(0);

    // Flash inputs to show update
    flashInputs();
  };

  const undoDeduction = (activityId) => {
    const entry = dailyActivity.find((a) => a.id === activityId);
    if (!entry) return;

    // Validation logging
    console.log('=== UNDO DEDUCTION ===');
    console.log('Restoring:', entry.macros.protein, 'P to', remainingProtein);
    console.log('Restoring:', entry.macros.carbs, 'C to', remainingCarbs);
    console.log('Restoring:', entry.macros.fat, 'F to', remainingFat);

    // Add macros back to REMAINING balance
    const restoredProtein = (parseFloat(remainingProtein) || 0) + entry.macros.protein;
    const restoredCarbs = (parseFloat(remainingCarbs) || 0) + entry.macros.carbs;
    const restoredFat = (parseFloat(remainingFat) || 0) + entry.macros.fat;

    console.log('New remaining:', restoredProtein, 'P |', restoredCarbs, 'C |', restoredFat, 'F');

    setRemainingProtein(restoredProtein.toString());
    setRemainingCarbs(restoredCarbs.toString());
    setRemainingFat(restoredFat.toString());

    // Remove from activity log
    const updatedActivity = dailyActivity.filter((a) => a.id !== activityId);
    setDailyActivity(updatedActivity);
    AsyncStorage.setItem(mealKey(todayISO()), JSON.stringify(updatedActivity));

    // Flash fuel gauge to show update
    flashInputs();
  };

  // Load any day's meals from its dated key
  const loadLedgerDate = async (iso) => {
    setLedgerLoading(true);
    setLedgerDate(iso);
    try {
      const data = await AsyncStorage.getItem(mealKey(iso));
      setLedgerEntries(data ? JSON.parse(data) : []);
    } catch (_) {
      setLedgerEntries([]);
    } finally {
      setLedgerLoading(false);
    }
  };

  // Delete an entry from a past day (no balance change)
  const deleteLedgerEntry = async (entryId) => {
    const updated = ledgerEntries.filter((e) => e.id !== entryId);
    setLedgerEntries(updated);
    await AsyncStorage.setItem(mealKey(ledgerDate), JSON.stringify(updated));
  };

  const openRestaurantDetail = (restaurantName) => {
    setEatOutSelectedRestaurant(restaurantName);
    setEatOutProteinPick(null);
    setEatOutBaseSelections({});
    setEatOutAddonSelections({});
    eoDetailWasHitRef.current = false;
    eoDetailPulseAnim.setValue(0);
    setEatOutStep('detail');
  };

  const saveBaseline = async (newBaseline) => {
    setBaseline(newBaseline);
    await AsyncStorage.setItem(BASELINE_KEY, JSON.stringify(newBaseline));
    setShowBaselineEditor(false);
  };

  const resetToBaseline = () => {
    // Reset remaining balance to baseline
    setRemainingProtein(baseline.protein);
    setRemainingCarbs(baseline.carbs);
    setRemainingFat(baseline.fat);
    // Smart fill search inputs
    const mealsLeft = getMealsRemaining();
    setSearchProtein(Math.round((parseFloat(baseline.protein) || 0) / mealsLeft).toString());
    setSearchCarbs(Math.round((parseFloat(baseline.carbs) || 0) / mealsLeft).toString());
    setSearchFat(Math.round((parseFloat(baseline.fat) || 0) / mealsLeft).toString());
    setResults([]);
    setScannedResult(null);
    setNoMatch(false);
  };

  // Calculate fuel gauge percentages
  const getFuelPercentage = (current, base) => {
    const c = parseFloat(current) || 0;
    const b = parseFloat(base) || 1;
    // Clamp between 0-100 for visual display (even if actual value is negative)
    return Math.min(100, Math.max(0, (c / b) * 100));
  };

  // Check if any macro budget is exceeded (negative)
  const isBudgetExceeded = () => {
    return (
      parseFloat(remainingProtein) < 0 ||
      parseFloat(remainingCarbs) < 0 ||
      parseFloat(remainingFat) < 0
    );
  };

  // Check if specific macro is negative
  const isNegative = (value) => parseFloat(value) < 0;

  // Determine meals remaining based on time of day
  const getMealsRemaining = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 3; // Morning: breakfast, lunch, dinner
    if (hour < 17) return 2; // Afternoon: lunch, dinner
    return 1; // Evening: dinner only
  };

  // ── Restaurant Detail: decomposed menu + live macro totals ────────────────
  // eoMenuData is the flat RestaurantMenuItem[] sourced from the data engine.
  // We reshape it into the { proteins, bases, addons } groups that renderRestaurantDetail uses.
  const eoDetailMenu = useMemo(() => {
    if (!eoMenuData || eoMenuData.length === 0) return null;
    const toGroup = (raw) => ({
      name:       raw.name,
      macros:     { protein: raw.protein, carbs: raw.carbs, fat: raw.fat },
      isMandatory: raw.isMandatory,
      isAIResult:  raw.isAIResult,
    });
    return {
      proteins: eoMenuData.filter((i) => i.category === 'protein').map(toGroup),
      bases:    eoMenuData.filter((i) => i.category === 'base').map(toGroup),
      addons:   eoMenuData.filter((i) => i.category === 'addon').map(toGroup),
    };
  }, [eoMenuData]);

  const eoDetailTotals = useMemo(() => {
    if (!eoDetailMenu) return { protein: 0, carbs: 0, fat: 0 };
    let p = 0, c = 0, f = 0;
    if (eatOutProteinPick) {
      const item = eoDetailMenu.proteins.find((i) => i.name === eatOutProteinPick);
      if (item) { p += item.macros.protein; c += item.macros.carbs; f += item.macros.fat; }
    }
    Object.entries(eatOutBaseSelections).forEach(([name, checked]) => {
      if (checked) {
        const item = eoDetailMenu.bases.find((i) => i.name === name);
        if (item) { p += item.macros.protein; c += item.macros.carbs; f += item.macros.fat; }
      }
    });
    Object.entries(eatOutAddonSelections).forEach(([name, checked]) => {
      if (checked) {
        const item = eoDetailMenu.addons.find((i) => i.name === name);
        if (item) { p += item.macros.protein; c += item.macros.carbs; f += item.macros.fat; }
      }
    });
    return { protein: p, carbs: c, fat: f };
  }, [eoDetailMenu, eatOutProteinPick, eatOutBaseSelections, eatOutAddonSelections]);

  const eoDetailMatchPct = useMemo(() => {
    const tP = parseFloat(eatOutTargetProtein) || 0;
    const tC = parseFloat(eatOutTargetCarbs)   || 0;
    const tF = parseFloat(eatOutTargetFat)     || 0;
    if (tP === 0 && tC === 0 && tF === 0) return 0;
    if (!eatOutProteinPick) return 0;
    return Math.min(100, Math.round(calculateMatchPercentage(
      { protein: tP, carbs: tC, fat: tF },
      eoDetailTotals,
    )));
  }, [eoDetailTotals, eatOutTargetProtein, eatOutTargetCarbs, eatOutTargetFat, eatOutProteinPick]);

  // ── Load restaurant menu via data engine when entering the detail step ──────
  useEffect(() => {
    if (currentView !== 'eatOut' || eatOutStep !== 'detail' || !eatOutSelectedRestaurant) return;
    let cancelled = false;
    setEoMenuLoading(true);
    setEoMenuData(null);
    getRestaurantMenu(eatOutSelectedRestaurant)
      .then((menu) => {
        if (!cancelled) {
          setEoMenuData(menu.items);
          setEoMenuLoading(false);
        }
      })
      .catch((err) => {
        console.warn('[MenuDataEngine]', err);
        if (!cancelled) setEoMenuLoading(false);
      });
    return () => { cancelled = true; };
  }, [currentView, eatOutStep, eatOutSelectedRestaurant]);

  // Flash animation for input fields
  const flashInputs = useCallback(() => {
    inputFlash.setValue(1);
    Animated.timing(inputFlash, {
      toValue: 0,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [inputFlash]);

  // Smart Fill: divide remaining by meals left - ONLY sets search inputs
  const smartFill = useCallback((shouldFlash = true) => {
    const mealsLeft = getMealsRemaining();

    // Use REMAINING balance for calculation (treat negatives as 0)
    const pVal = Math.max(0, parseFloat(remainingProtein) || 0);
    const cVal = Math.max(0, parseFloat(remainingCarbs) || 0);
    const fVal = Math.max(0, parseFloat(remainingFat) || 0);

    // Calculate per-meal targets (negatives become 0 suggestions)
    const p = pVal > 0 ? Math.round(pVal / mealsLeft) : 0;
    const c = cVal > 0 ? Math.round(cVal / mealsLeft) : 0;
    const f = fVal > 0 ? Math.round(fVal / mealsLeft) : 0;

    // ONLY set search inputs - NOT remaining balance
    setSearchProtein(p.toString());
    setSearchCarbs(c.toString());
    setSearchFat(f.toString());

    console.log('Smart Fill:', p, 'P |', c, 'C |', f, 'F (from', pVal, '/', mealsLeft, 'meals)');

    // Visual feedback
    if (shouldFlash) {
      flashInputs();
    }
  }, [remainingProtein, remainingCarbs, remainingFat, flashInputs]);

  const handleSmartFill = () => {
    // Smart Fill uses remaining balance to calculate search inputs
    smartFill(true);
  };

  const handleMbSmartFill = useCallback(() => {
    const mealsLeft = getMealsRemaining();
    const pVal = Math.max(0, parseFloat(remainingProtein) || 0);
    const cVal = Math.max(0, parseFloat(remainingCarbs) || 0);
    const fVal = Math.max(0, parseFloat(remainingFat) || 0);
    const p = pVal > 0 ? Math.round(pVal / mealsLeft) : 0;
    const c = cVal > 0 ? Math.round(cVal / mealsLeft) : 0;
    const f = fVal > 0 ? Math.round(fVal / mealsLeft) : 0;
    setMbTargetProtein(p.toString());
    setMbTargetCarbs(c.toString());
    setMbTargetFat(f.toString());
    flashInputs();
  }, [remainingProtein, remainingCarbs, remainingFat, flashInputs]);

  const handleAddCustomFood = async () => {
    const name = customFoodName.trim();
    if (!name) return;
    const protein = parseFloat(customFoodProtein) || 0;
    const carbs   = parseFloat(customFoodCarbs)   || 0;
    const fat     = parseFloat(customFoodFat)     || 0;
    // Auto-assign category by dominant caloric contribution
    const pCal = protein * 4, cCal = carbs * 4, fCal = fat * 9;
    const maxCal = Math.max(pCal, cCal, fCal);
    const category = maxCal === fCal ? 'Fats' : maxCal === cCal ? 'Carbs' : 'Proteins';
    const newStaple = {
      id: `custom_${Date.now()}`,
      name,
      category,
      macrosPer100g: { protein, carbs, fat },
      isCustom: true,
    };
    const updated = [...userStaples, newStaple];
    setUserStaples(updated);
    await AsyncStorage.setItem(USER_STAPLES_KEY, JSON.stringify(updated));
    // Reset form and close modal
    setCustomFoodName('');
    setCustomFoodProtein('');
    setCustomFoodCarbs('');
    setCustomFoodFat('');
    setShowAddCustomFood(false);
  };

  // Triggers the recipe search from Step 2, then advances to Step 3 (results)
  const handleRecipeSearch = () => {
    const target = {
      protein: parseFloat(searchProtein) || 0,
      carbs: parseFloat(searchCarbs) || 0,
      fat: parseFloat(searchFat) || 0,
    };
    if (target.protein === 0 && target.carbs === 0 && target.fat === 0) return;
    handleFindMeal();
    setCookRecipeStep('results');
  };

  // Step progress indicator for the 3-step Cook a Recipe flow
  const renderCookRecipeStepIndicator = (step) => (
    <View style={styles.stepIndicatorContainer}>
      <View style={styles.stepDots}>
        {[1, 2, 3].map((n) => (
          <View key={n} style={[styles.stepDot, n <= step && styles.stepDotActive]} />
        ))}
      </View>
      <Text style={styles.stepIndicatorText}>Step {step} of 3</Text>
    </View>
  );

  // ─── Meal Builder: derived macros, match %, suggestion ───────────────────────
  // Merge hardcoded staples with user-created staples for the full ingredient list
  const allStaples = [...STAPLE_INGREDIENTS, ...userStaples];

  const mbCurrentMacros = (() => {
    let p = 0, c = 0, f = 0;
    for (const [id, grams] of Object.entries(mbIngredients)) {
      if (!grams || grams <= 0) continue;
      const ingredient = allStaples.find(i => i.id === id);
      if (!ingredient) continue;
      const factor = grams / 100;
      p += ingredient.macrosPer100g.protein * factor;
      c += ingredient.macrosPer100g.carbs * factor;
      f += ingredient.macrosPer100g.fat * factor;
    }
    return {
      protein: Math.round(p * 10) / 10,
      carbs:   Math.round(c * 10) / 10,
      fat:     Math.round(f * 10) / 10,
    };
  })();

  const mbMatchPct = (() => {
    const tP = parseFloat(mbTargetProtein) || 0;
    const tC = parseFloat(mbTargetCarbs) || 0;
    const tF = parseFloat(mbTargetFat) || 0;
    if (tP + tC + tF === 0) return null;
    return calculateMatchPercentage(
      { protein: tP, carbs: tC, fat: tF },
      mbCurrentMacros,
    );
  })();

  const mbIsTargetHit = mbMatchPct !== null && mbMatchPct >= 95;

  const mbSuggestion = (() => {
    if (currentView !== 'mealBuilder' || mealBuilderStep !== 'build') return null;
    const total = mbCurrentMacros.protein + mbCurrentMacros.carbs + mbCurrentMacros.fat;
    if (total < 20) return null;
    let best = null, bestScore = 0;
    for (const recipe of RECIPES) {
      const score = calculateMatchPercentage(mbCurrentMacros, recipe.macros);
      if (score >= 70 && score > bestScore) { bestScore = score; best = recipe; }
    }
    return best ? { recipe: best, score: bestScore } : null;
  })();

  const handleMealBuilderFinalize = async () => {
    const name = mealBuilderMealName.trim() || 'Custom Meal';
    const macros = {
      protein: Math.round(mbCurrentMacros.protein),
      carbs:   Math.round(mbCurrentMacros.carbs),
      fat:     Math.round(mbCurrentMacros.fat),
    };

    // Deduct from remaining fuel gauge
    setRemainingProtein(((parseFloat(remainingProtein) || 0) - macros.protein).toString());
    setRemainingCarbs(((parseFloat(remainingCarbs) || 0) - macros.carbs).toString());
    setRemainingFat(((parseFloat(remainingFat) || 0) - macros.fat).toString());

    // Add to daily activity
    const activityEntry = {
      id: Date.now().toString(),
      name,
      source: 'Meal Builder',
      macros,
      timestamp: new Date().toISOString(),
      time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    };
    const updatedActivity = [activityEntry, ...dailyActivity];
    setDailyActivity(updatedActivity);
    await AsyncStorage.setItem(mealKey(todayISO()), JSON.stringify(updatedActivity));

    // Save to custom meals library
    const customEntry = {
      id: Date.now().toString(),
      name,
      date: new Date().toLocaleDateString(),
      macros,
      ingredients: Object.entries(mbIngredients)
        .filter(([, g]) => g > 0)
        .map(([id, grams]) => {
          const ing = STAPLE_INGREDIENTS.find(i => i.id === id) || userStaples.find(i => i.id === id);
          return { name: ing?.name || id, grams };
        }),
    };
    const updatedCustomMeals = [customEntry, ...savedCustomMeals].slice(0, 20);
    setSavedCustomMeals(updatedCustomMeals);
    await AsyncStorage.setItem(CUSTOM_MEALS_KEY, JSON.stringify(updatedCustomMeals));

    // Reset and go home
    setShowMealBuilderFinalize(false);
    setMealBuilderMealName('');
    flashInputs();
    navigateTo('home');
  };
  // ─────────────────────────────────────────────────────────────────────────────

  const viewTitle = currentView === 'eatOut' ? 'Eat Out'
                  : currentView === 'quickSnack' ? 'Quick Snack'
                  : currentView === 'cookRecipe' ? 'Cook a Recipe'
                  : currentView === 'mealBuilder' ? 'Meal Builder'
                  : currentView === 'eatAtHome' ? 'Eat at Home'
                  : '';

  const findButtonText = currentView === 'quickSnack' ? 'Find a Snack'
                       : currentView === 'cookRecipe' ? 'Find a Recipe'
                       : 'Find My Meal';

  // Recipe preference filter screen
  const renderRecipeFilterScreen = () => {
    const FILTERS = [
      { key: 'spicy',       label: '🌶  Spicy' },
      { key: 'vegetarian',  label: '🥗  Vegetarian' },
      { key: 'under30',     label: '⏱  Under 30 Mins' },
      { key: 'highProtein', label: '💪  High Protein' },
    ];
    return (
      <View style={styles.filterScreenContainer}>
        <Text style={styles.filterScreenTitle}>What are you craving?</Text>
        <Text style={styles.filterScreenSubtitle}>Optionally filter by preference</Text>
        <View style={styles.filterGrid}>
          {FILTERS.map(({ key, label }) => {
            const active = recipeFilters[key];
            return (
              <TouchableOpacity
                key={key}
                style={[styles.filterToggle, active && styles.filterToggleActive]}
                onPress={() => setRecipeFilters(prev => ({ ...prev, [key]: !prev[key] }))}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterToggleText, active && styles.filterToggleTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  // Shared fuel gauge component
  const renderFuelGauge = () => (
    <View style={styles.fuelGaugeContainer}>
      <View style={styles.fuelGaugeHeader}>
        <Text style={styles.fuelGaugeTitle}>Remaining Today</Text>
        <TouchableOpacity onPress={() => setShowBaselineEditor(true)}>
          <Text style={styles.editBaselineLink}>Edit Goals</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.fuelGaugeRow}>
        <View style={styles.fuelGaugeItem}>
          <Text style={styles.fuelGaugeLabel}>Protein</Text>
          <View style={styles.fuelBarContainer}>
            <View
              style={[
                styles.fuelBar,
                styles.fuelBarProtein,
                isNegative(remainingProtein) && styles.fuelBarEmpty,
                { width: `${getFuelPercentage(remainingProtein, baseline.protein)}%` },
              ]}
            />
          </View>
          <Text style={[
            styles.fuelGaugeValue,
            isNegative(remainingProtein) && styles.fuelGaugeValueNegative
          ]}>
            {remainingProtein || '0'}g
          </Text>
        </View>
        <View style={styles.fuelGaugeItem}>
          <Text style={styles.fuelGaugeLabel}>Carbs</Text>
          <View style={styles.fuelBarContainer}>
            <View
              style={[
                styles.fuelBar,
                styles.fuelBarCarbs,
                isNegative(remainingCarbs) && styles.fuelBarEmpty,
                { width: `${getFuelPercentage(remainingCarbs, baseline.carbs)}%` },
              ]}
            />
          </View>
          <Text style={[
            styles.fuelGaugeValue,
            isNegative(remainingCarbs) && styles.fuelGaugeValueNegative
          ]}>
            {remainingCarbs || '0'}g
          </Text>
        </View>
        <View style={styles.fuelGaugeItem}>
          <Text style={styles.fuelGaugeLabel}>Fat</Text>
          <View style={styles.fuelBarContainer}>
            <View
              style={[
                styles.fuelBar,
                styles.fuelBarFat,
                isNegative(remainingFat) && styles.fuelBarEmpty,
                { width: `${getFuelPercentage(remainingFat, baseline.fat)}%` },
              ]}
            />
          </View>
          <Text style={[
            styles.fuelGaugeValue,
            isNegative(remainingFat) && styles.fuelGaugeValueNegative
          ]}>
            {remainingFat || '0'}g
          </Text>
        </View>
      </View>
      {isBudgetExceeded() && (
        <View style={styles.budgetWarning}>
          <Text style={styles.budgetWarningText}>Budget Exceeded</Text>
        </View>
      )}
      <TouchableOpacity style={styles.resetToBaselineButton} onPress={resetToBaseline}>
        <Text style={styles.resetToBaselineText}>Reset to Daily Goals</Text>
      </TouchableOpacity>
    </View>
  );

  // Shared result cards renderer
  const renderResultCards = () => (
    <>
      {results.map((item, index) => {
        const qty = resultQuantities[index] || 1;
        const target = {
          protein: parseFloat(searchProtein) || 0,
          carbs: parseFloat(searchCarbs) || 0,
          fat: parseFloat(searchFat) || 0,
        };
        // Recipes: pills show the user's target macros scaled by qty (not base recipe macros).
        // Restaurant items: pills show the actual item macros scaled by qty.
        const adjustedMacros = item.isRecipe
          ? { protein: target.protein * qty, carbs: target.carbs * qty, fat: target.fat * qty }
          : { protein: item.macros.protein * qty, carbs: item.macros.carbs * qty, fat: item.macros.fat * qty };
        const adjustedPercentage = qty === 1
          ? item.percentage
          : calculateMatchPercentage(target, adjustedMacros);
        const isScaled = item.isRecipe && item.servingMultiplier != null && Math.abs(item.servingMultiplier - 1) >= 0.05;
        const imgError = resultImageErrors[index] || false;
        const rankLabel = index === 0 ? 'Best Match' : `#${index + 1}`;

        const updateQuantity = (newQty) => {
          setResultQuantities((prev) => {
            const next = [...prev];
            next[index] = newQty;
            return next;
          });
        };
        const markImageError = () => {
          setResultImageErrors((prev) => {
            const next = [...prev];
            next[index] = true;
            return next;
          });
        };

        return (
          <Animated.View
            key={`${item.restaurant}-${item.name}`}
            style={[
              styles.resultContainer,
              {
                opacity: resultOpacity,
                transform: [{ translateY: resultSlideY }],
              },
              index === 0
                ? {
                    borderColor: resultBorderColor.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['rgba(255,255,255,0.2)', COLORS.accentGreen],
                    }),
                  }
                : { borderColor: 'rgba(255,255,255,0.12)' },
            ]}
          >
            {item.imageUrl && !imgError ? (
              <Image
                source={{ uri: item.imageUrl }}
                style={styles.cardImage}
                resizeMode="cover"
                onError={markImageError}
              />
            ) : (
              <View style={styles.cardImagePlaceholder}>
                <Text style={styles.cardImagePlaceholderText}>
                  {item.name.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}

            {index > 0 && (
              <View style={styles.resultRankBadge}>
                <Text style={styles.resultRankBadgeText}>{rankLabel}</Text>
              </View>
            )}

            <View style={styles.cardContent}>
              <Text style={styles.resultLabel}>{rankLabel}</Text>
              <View style={styles.restaurantRow}>
                <Text style={styles.resultRestaurant}>{item.restaurant}</Text>
              </View>
              {item.location && (
                <Text style={styles.distanceAwayText}>
                  {formatDistanceLong(item.location.distance)}
                </Text>
              )}
              {item.outsideRadius && (
                <Text style={styles.outsideRadiusWarning}>
                  Outside {getMaxRadius()}-mile radius
                </Text>
              )}
              <Text style={styles.resultName}>{item.name}</Text>

              <MatchRing percentage={adjustedPercentage} size={120} />
              {isScaled && (
                <Text style={styles.scaledLabel}>Scaled to Goal</Text>
              )}

              <View style={styles.quantitySelector}>
                <TouchableOpacity
                  style={[styles.quantityButton, qty <= 1 && styles.quantityButtonDisabled]}
                  onPress={() => updateQuantity(Math.max(1, qty - 1))}
                  disabled={qty <= 1}
                  activeOpacity={0.6}
                >
                  <Text style={styles.quantityButtonText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.quantityValue}>x{qty}</Text>
                <TouchableOpacity
                  style={[styles.quantityButton, qty >= 10 && styles.quantityButtonDisabled]}
                  onPress={() => updateQuantity(Math.min(10, qty + 1))}
                  disabled={qty >= 10}
                  activeOpacity={0.6}
                >
                  <Text style={styles.quantityButtonText}>+</Text>
                </TouchableOpacity>
              </View>

              <MacroPills
                protein={adjustedMacros.protein}
                carbs={adjustedMacros.carbs}
                fat={adjustedMacros.fat}
              />

              {item.highVolume && (
                <View style={styles.highVolumeBadge}>
                  <Text style={styles.highVolumeBadgeText}>⚡ High Volume</Text>
                </View>
              )}

              <View style={styles.prosConsContainer}>
                {item.pros?.length > 0 && (
                  <Text style={styles.prosText}>
                    <Text style={styles.prosLabel}>Pros: </Text>
                    {item.pros.join(' · ')}
                  </Text>
                )}
                {item.cons?.length > 0 && (
                  <Text style={styles.consText}>
                    <Text style={styles.consLabel}>Cons: </Text>
                    {item.cons.join(' · ')}
                  </Text>
                )}
              </View>

              <View style={styles.resultButtonsColumn}>
                {item.isRecipe && item.recipeDetails && (
                  <TouchableOpacity
                    style={styles.viewRecipeButton}
                    onPress={() => {
                      setSelectedRecipe(item);
                      setShowRecipeDetail(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.viewRecipeButtonText}>View Recipe</Text>
                  </TouchableOpacity>
                )}
                {item.location && (
                  <TouchableOpacity
                    style={styles.directionsButton}
                    onPress={() => openMapsWithDirections(
                      item.location.latitude,
                      item.location.longitude,
                      item.restaurant,
                      item.location.isMock
                    )}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.directionsButtonText}>Take Me There</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.deductButton}
                  onPress={() => deductMeal(adjustedMacros, item.name, item.restaurant)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.deductButtonText}>
                    Deduct{qty > 1 ? ` (x${qty})` : ''} from Today
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        );
      })}
    </>
  );

  // Shared scanned result card renderer
  const renderScannedResult = () => {
    if (!scannedResult) return null;
    const adjustedScannedMacros = {
      protein: scannedResult.macros.protein * scannedQuantity,
      carbs: scannedResult.macros.carbs * scannedQuantity,
      fat: scannedResult.macros.fat * scannedQuantity,
    };
    const target = {
      protein: parseFloat(searchProtein) || 0,
      carbs: parseFloat(searchCarbs) || 0,
      fat: parseFloat(searchFat) || 0,
    };
    const adjustedScannedPercentage = scannedResult.hasTargets && scannedResult.matchPercentage !== null
      ? (scannedQuantity === 1
        ? scannedResult.matchPercentage
        : calculateMatchPercentage(target, adjustedScannedMacros))
      : null;

    return (
      <Animated.View
        style={[
          styles.scannedContainer,
          {
            opacity: scannedOpacity,
            transform: [{ translateY: scannedSlideY }],
          },
          scannedResult.warnings?.length > 0 && styles.scannedContainerWarning,
        ]}
      >
        {scannedResult.imageUrl && !scannedImageError ? (
          <Image
            source={{ uri: scannedResult.imageUrl }}
            style={styles.cardImage}
            resizeMode="cover"
            onError={() => setScannedImageError(true)}
          />
        ) : (
          <View style={styles.cardImagePlaceholder}>
            <Text style={styles.cardImagePlaceholderText}>
              {scannedResult.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        <View style={styles.cardContent}>
          <Text style={styles.scannedLabel}>SCANNED ITEM</Text>
          {scannedResult.brand ? (
            <Text style={styles.scannedBrand}>{scannedResult.brand}</Text>
          ) : null}
          <Text style={styles.scannedName}>{scannedResult.name}</Text>

          {adjustedScannedPercentage !== null ? (
            <MatchRing percentage={adjustedScannedPercentage} size={120} />
          ) : (
            <Text style={styles.noTargetsHint}>
              Set macro targets above to see match %
            </Text>
          )}

          <View style={styles.quantitySelector}>
            <TouchableOpacity
              style={[styles.quantityButton, scannedQuantity <= 1 && styles.quantityButtonDisabled]}
              onPress={() => setScannedQuantity(Math.max(1, scannedQuantity - 1))}
              disabled={scannedQuantity <= 1}
              activeOpacity={0.6}
            >
              <Text style={styles.quantityButtonText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.quantityValue}>x{scannedQuantity}</Text>
            <TouchableOpacity
              style={[styles.quantityButton, scannedQuantity >= 10 && styles.quantityButtonDisabled]}
              onPress={() => setScannedQuantity(Math.min(10, scannedQuantity + 1))}
              disabled={scannedQuantity >= 10}
              activeOpacity={0.6}
            >
              <Text style={styles.quantityButtonText}>+</Text>
            </TouchableOpacity>
          </View>

          <MacroPills
            protein={adjustedScannedMacros.protein}
            carbs={adjustedScannedMacros.carbs}
            fat={adjustedScannedMacros.fat}
          />

          <Text style={styles.servingInfo}>
            per {scannedResult.isPerServing ? 'serving' : '100g'}
            {scannedResult.servingSize && scannedResult.servingSize !== '100g'
              ? ` (${scannedResult.servingSize})`
              : ''}
          </Text>

          {scannedResult.warnings?.length > 0 && (
            <View style={styles.warningsContainer}>
              {scannedResult.warnings.map((warning, wIdx) => (
                <View key={wIdx} style={styles.warningBadge}>
                  <Text style={styles.warningText}>{warning}</Text>
                </View>
              ))}
            </View>
          )}

          {scannedResult.hasTargets && scannedResult.matchAnalysis && (
            <Text style={styles.scannedAnalysis}>{scannedResult.matchAnalysis}</Text>
          )}

          <View style={[styles.resultButtonsColumn, { marginTop: 16 }]}>
            <TouchableOpacity
              style={styles.deductButton}
              onPress={() => deductMeal(adjustedScannedMacros, scannedResult.name, scannedResult.brand || '')}
              activeOpacity={0.7}
            >
              <Text style={styles.deductButtonText}>
                Deduct{scannedQuantity > 1 ? ` (x${scannedQuantity})` : ''} from Today
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dismissButton}
              onPress={dismissScannedResult}
              activeOpacity={0.6}
            >
              <Text style={styles.dismissButtonText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    );
  };

  // Generic meal list renderer — used by both home preview and Daily Ledger
  const renderMealList = (entries, onDelete) => {
    if (!entries || entries.length === 0) return null;
    const totalProtein = entries.reduce((sum, e) => sum + (e.macros.protein || 0), 0);
    return (
      <View style={styles.mhSection}>
        <View style={styles.mhHeader}>
          <Text style={styles.mhTitle}>MEALS</Text>
          <View style={styles.mhTotalBadge}>
            <Text style={styles.mhTotalText}>{totalProtein}g protein</Text>
          </View>
        </View>
        {entries.map((entry, index) => {
          const source = entry.source || entry.restaurant || '';
          const isLast = index === entries.length - 1;
          return (
            <View
              key={entry.id}
              style={[styles.mhItem, isLast && styles.mhItemLast]}
            >
              <View style={styles.mhProteinBadge}>
                <Text style={styles.mhProteinValue}>{entry.macros.protein}</Text>
                <Text style={styles.mhProteinUnit}>g P</Text>
              </View>
              <View style={styles.mhInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.mhName} numberOfLines={1}>{entry.name}</Text>
                  {entry.isAIEstimate && (
                    <View style={styles.mhAIBadge}>
                      <Text style={styles.mhAIBadgeText}>✨ Est.</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.mhMeta}>
                  {source ? `${source} · ` : ''}{entry.time}
                </Text>
                <Text style={styles.mhMacros}>
                  {entry.macros.carbs}g C · {entry.macros.fat}g F
                  {entry.isAIEstimate && entry.aiConfidence !== undefined
                    ? ` · ${entry.aiConfidence}% conf.`
                    : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.mhDeleteBtn}
                onPress={() => onDelete(entry.id)}
                activeOpacity={0.6}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={16} color="#ff6b6b" />
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    );
  };

  // Today's home-screen meal list (thin wrapper)
  const renderDailyActivity = () => renderMealList(dailyActivity, undoDeduction);

  // ─── Eat Out: Map Scout (step 2) ──────────────────────────────────────────
  const renderEatOutMap = () => {
    const mapTargets = {
      protein: parseFloat(eatOutTargetProtein) || 0,
      carbs:   parseFloat(eatOutTargetCarbs)   || 0,
      fat:     parseFloat(eatOutTargetFat)     || 0,
    };

    // Compute best-match % for each nearby restaurant vs entered targets
    const itemsByRestaurant = {};
    for (const item of ALL_ITEMS) {
      if (!itemsByRestaurant[item.restaurant]) itemsByRestaurant[item.restaurant] = [];
      itemsByRestaurant[item.restaurant].push(item);
    }
    // Compute bestPct once per brand (cached), then build a marker for every
    // individual storefront in allNearbyLocations (multiple per brand allowed).
    const bestPctByBrand = {};
    const markerData = [];
    for (const { name, loc } of allNearbyLocations) {
      if (!(name in bestPctByBrand)) {
        const dbItems = RESTAURANT_DB[name] || [];
        const allItems = dbItems.length > 0 ? dbItems : (itemsByRestaurant[name] || []);
        bestPctByBrand[name] = allItems.length === 0
          ? 0
          : Math.round(Math.max(...allItems.map((i) => {
              const macros = 'protein' in i ? { protein: i.protein, carbs: i.carbs, fat: i.fat } : i.macros;
              return calculateMatchPercentage(mapTargets, macros);
            })));
      }
      if (bestPctByBrand[name] === 0 && (RESTAURANT_DB[name] || itemsByRestaurant[name])) continue;
      markerData.push({ name, loc, bestPct: bestPctByBrand[name] });
    }

    const mapRegion = userLocation
      ? { latitude: userLocation.latitude, longitude: userLocation.longitude, latitudeDelta: 0.08, longitudeDelta: 0.08 }
      : { latitude: 32.7767, longitude: -96.797, latitudeDelta: 0.15, longitudeDelta: 0.15 };

    return (
      <View style={{ flex: 1, backgroundColor: COLORS.darkBlue }}>
        <MapView
          style={StyleSheet.absoluteFill}
          region={mapRegion}
          showsUserLocation={true}
          showsMyLocationButton={false}
        >
          {markerData.map((m, idx) => (
            <RestaurantMarker
              key={m.loc.placeId || `${m.name}_${idx}`}
              m={m}
              onPress={openRestaurantDetail}
            />
          ))}
        </MapView>

        <SubViewHeader
          title="Eat Out"
          onHome={goHome}
          backLabel="Targets"
          onBack={() => setEatOutStep('briefing')}
        />
      </View>
    );
  };

  // ─── Eat Out: Restaurant Detail View (step 3) ─────────────────────────────
  const renderRestaurantDetail = () => {
    // ── Loading / error states ──────────────────────────────────────────────
    if (eoMenuLoading || (!eoDetailMenu && !eoMenuData)) {
      return (
        <View style={detailStyles.container}>
          <SubViewHeader title={eatOutSelectedRestaurant} onHome={goHome} backLabel="Map" onBack={() => setEatOutStep('map')} />
          <View style={detailStyles.loadingWrap}>
            <ActivityIndicator size="large" color={COLORS.accentGreen} />
            <Text style={detailStyles.loadingText}>
              {eoMenuLoading ? 'Loading menu…' : 'Estimating with AI…'}
            </Text>
          </View>
        </View>
      );
    }

    if (!eoDetailMenu) {
      // eoMenuData exists but empty — no API key and not in DB
      return (
        <View style={detailStyles.container}>
          <SubViewHeader title={eatOutSelectedRestaurant} onHome={goHome} backLabel="Map" onBack={() => setEatOutStep('map')} />
          <View style={detailStyles.loadingWrap}>
            <Ionicons name="restaurant-outline" size={40} color={COLORS.muted} style={{ marginBottom: 12 }} />
            <Text style={detailStyles.loadingText}>Menu unavailable</Text>
            <Text style={[detailStyles.loadingText, { fontSize: 12, marginTop: 6 }]}>
              Add a Gemini API key in src/config.ts to enable AI estimation.
            </Text>
          </View>
        </View>
      );
    }

    const tP = parseFloat(eatOutTargetProtein) || 0;
    const tC = parseFloat(eatOutTargetCarbs)   || 0;
    const tF = parseFloat(eatOutTargetFat)     || 0;

    const isHit = eoDetailMatchPct >= 95;

    // Pulse green on transition to hit
    if (isHit && !eoDetailWasHitRef.current) {
      eoDetailWasHitRef.current = true;
      eoDetailPulseAnim.setValue(0);
      Animated.loop(
        Animated.sequence([
          Animated.timing(eoDetailPulseAnim, { toValue: 1, duration: 550, useNativeDriver: false }),
          Animated.timing(eoDetailPulseAnim, { toValue: 0, duration: 550, useNativeDriver: false }),
        ]),
        { iterations: 3 },
      ).start();
    } else if (!isHit) {
      eoDetailWasHitRef.current = false;
    }

    const ringGlow = isHit
      ? eoDetailPulseAnim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(0,121,107,0.25)', 'rgba(0,230,118,0.55)'] })
      : 'transparent';

    // Progress bar helper
    const MacroBar = ({ label, current, target, color }) => {
      const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
      const isOver = target > 0 && current > target * 1.05;
      const barColor = isOver ? '#ff6b6b' : color;
      return (
        <View style={detailStyles.barRow}>
          <Text style={detailStyles.barLabel}>{label}</Text>
          <View style={detailStyles.barTrack}>
            <View style={[detailStyles.barFill, { width: `${pct}%`, backgroundColor: barColor }]} />
          </View>
          <Text style={[detailStyles.barValue, isOver && detailStyles.barValueOver]}>
            {current}<Text style={detailStyles.barTarget}>/{target}g</Text>
          </Text>
        </View>
      );
    };

    // Macro pill — shows P/C/F values + optional AI badge
    const MacroPill = ({ macros, isAIResult }) => (
      <View style={detailStyles.macroPillRow}>
        <View style={detailStyles.macroPill}>
          <Text style={detailStyles.macroPillText}>
            {macros.protein > 0 ? `+${macros.protein}P` : ''}
            {macros.carbs > 0   ? `  +${macros.carbs}C` : ''}
            {macros.fat > 0     ? `  +${macros.fat}F`   : ''}
          </Text>
        </View>
        {isAIResult && (
          <View style={detailStyles.aiBadge}>
            <Text style={detailStyles.aiBadgeText}>✨ AI Estimated</Text>
          </View>
        )}
      </View>
    );

    // Menu section renderer
    const renderSection = (title, items, isRadio, selections, onToggle) => {
      if (!items || items.length === 0) return null;
      return (
        <View style={detailStyles.section}>
          <Text style={detailStyles.sectionLabel}>{title}</Text>
          {items.map((item) => {
            const selected = isRadio
              ? eatOutProteinPick === item.name
              : !!selections[item.name];
            return (
              <TouchableOpacity
                key={item.name}
                style={[detailStyles.menuRow, selected && detailStyles.menuRowSelected]}
                onPress={() => onToggle(item.name)}
                activeOpacity={0.75}
              >
                {/* Control indicator */}
                {isRadio ? (
                  <View style={[detailStyles.radio, selected && detailStyles.radioSelected]}>
                    {selected && <View style={detailStyles.radioDot} />}
                  </View>
                ) : (
                  <View style={[detailStyles.checkBox, selected && detailStyles.checkBoxSelected]}>
                    {selected && <Ionicons name="checkmark" size={12} color={COLORS.white} />}
                  </View>
                )}
                {/* Item info */}
                <View style={detailStyles.menuRowInfo}>
                  <Text style={[detailStyles.menuRowName, selected && detailStyles.menuRowNameSelected]}>
                    {item.name}
                  </Text>
                  {item.servingWeightG != null && (
                    <Text style={detailStyles.servingSize}>
                      {mbUnit === 'oz'
                        ? `${(item.servingWeightG / 28.35).toFixed(1)} oz serving`
                        : `${item.servingWeightG}g serving`}
                    </Text>
                  )}
                  <MacroPill macros={item.macros} isAIResult={item.isAIResult} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      );
    };

    // Build confirm meal name and detect if any selected item is AI-estimated
    const hasSelection = !!eatOutProteinPick;
    const buildMealName = () => {
      const parts = [eatOutProteinPick];
      Object.entries(eatOutBaseSelections).forEach(([n, v]) => v && parts.push(n));
      Object.entries(eatOutAddonSelections).forEach(([n, v]) => v && parts.push(n));
      return parts.filter(Boolean).join(' + ');
    };
    const hasAIItems = eoMenuData
      ? eoMenuData.some((i) =>
          i.isAIResult && (
            eatOutProteinPick === i.name ||
            !!eatOutBaseSelections[i.name] ||
            !!eatOutAddonSelections[i.name]
          )
        )
      : false;

    return (
      <View style={detailStyles.container}>
        <SubViewHeader
          title={eatOutSelectedRestaurant}
          onHome={goHome}
          backLabel="Map"
          onBack={() => setEatOutStep('map')}
        />

        {/* ── Sticky Header ── */}
        <Animated.View style={[detailStyles.stickyHeader, { shadowColor: ringGlow }]}>
          {/* MatchRing */}
          <Animated.View style={[detailStyles.ringWrap, isHit && { shadowColor: ringGlow, shadowOpacity: 1, shadowRadius: 18, elevation: 12 }]}>
            <MatchRing percentage={eoDetailMatchPct} size={96} />
          </Animated.View>

          {/* Macro Progress Bars */}
          <View style={detailStyles.barsWrap}>
            <MacroBar label="P" current={eoDetailTotals.protein} target={tP} color="#4fc3f7" />
            <MacroBar label="C" current={eoDetailTotals.carbs}   target={tC} color="#aed581" />
            <MacroBar label="F" current={eoDetailTotals.fat}     target={tF} color="#ffb74d" />
          </View>
        </Animated.View>

        {/* ── Scrollable Menu ── */}
        <ScrollView style={detailStyles.menuScroll} showsVerticalScrollIndicator={false}>
          {renderSection(
            'PROTEINS',
            eoDetailMenu.proteins,
            true,
            null,
            (name) => setEatOutProteinPick((prev) => (prev === name ? null : name)),
          )}
          {renderSection(
            'BASES',
            eoDetailMenu.bases,
            false,
            eatOutBaseSelections,
            (name) => setEatOutBaseSelections((prev) => ({ ...prev, [name]: !prev[name] })),
          )}
          {renderSection(
            'ADD-ONS',
            eoDetailMenu.addons,
            false,
            eatOutAddonSelections,
            (name) => setEatOutAddonSelections((prev) => ({ ...prev, [name]: !prev[name] })),
          )}
          <View style={{ height: 110 }} />
        </ScrollView>

        {/* ── Confirm & Log button ── */}
        <View style={detailStyles.confirmWrap}>
          <TouchableOpacity
            style={[detailStyles.confirmBtn, !hasSelection && detailStyles.confirmBtnDisabled]}
            onPress={() => {
              if (!hasSelection) return;
              // Average confidence of AI-estimated items that are actually selected
              const avgConf = hasAIItems && eoMenuData
                ? (() => {
                    const aiSel = eoMenuData.filter(
                      (i) => i.isAIResult && i.confidence !== undefined && (
                        eatOutProteinPick === i.name ||
                        !!eatOutBaseSelections[i.name] ||
                        !!eatOutAddonSelections[i.name]
                      )
                    );
                    return aiSel.length > 0
                      ? Math.round(aiSel.reduce((s, i) => s + i.confidence, 0) / aiSel.length)
                      : null;
                  })()
                : null;
              deductMeal(eoDetailTotals, buildMealName(), eatOutSelectedRestaurant, hasAIItems, avgConf);
              navigateTo('home');
            }}
            activeOpacity={hasSelection ? 0.85 : 1}
          >
            <Text style={detailStyles.confirmBtnText}>
              {hasSelection ? 'Confirm & Log →' : 'Select a protein to continue'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ── Eat Out: Target Briefing screen (step 1) ─────────────────────────────
  const renderEatOutBriefing = () => {
    const handleEatOutSmartFill = () => {
      const mealsLeft = getMealsRemaining();
      const p = Math.max(0, Math.round((parseFloat(remainingProtein) || 0) / mealsLeft));
      const c = Math.max(0, Math.round((parseFloat(remainingCarbs)   || 0) / mealsLeft));
      const f = Math.max(0, Math.round((parseFloat(remainingFat)     || 0) / mealsLeft));
      setEatOutTargetProtein(p > 0 ? p.toString() : '');
      setEatOutTargetCarbs(c > 0 ? c.toString() : '');
      setEatOutTargetFat(f > 0 ? f.toString() : '');
      inputFlash.setValue(1);
      Animated.timing(inputFlash, { toValue: 0, duration: 600, useNativeDriver: false }).start();
    };

    const hasTargets =
      (parseFloat(eatOutTargetProtein) || 0) > 0 ||
      (parseFloat(eatOutTargetCarbs)   || 0) > 0 ||
      (parseFloat(eatOutTargetFat)     || 0) > 0;

    return (
      <>
        <SubViewHeader title="Eat Out" onHome={goHome} />

        {renderFuelGauge()}

        {/* Macro target inputs */}
        <View style={styles.inputContainer}>
          <View style={styles.inputHeaderRow}>
            <Text style={styles.inputSectionLabel}>Target Macros</Text>
            <TouchableOpacity
              style={styles.smartFillButton}
              onPress={handleEatOutSmartFill}
              activeOpacity={0.7}
            >
              <Text style={styles.smartFillButtonText}>Smart Split</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Protein (g)</Text>
            <Animated.View
              style={[
                styles.inputWrapper,
                {
                  backgroundColor: inputFlash.interpolate({
                    inputRange: [0, 1],
                    outputRange: [COLORS.darkGreen, 'rgba(0, 150, 136, 0.6)'],
                  }),
                },
              ]}
            >
              <TextInput
                style={styles.inputInner}
                value={eatOutTargetProtein}
                onChangeText={setEatOutTargetProtein}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={COLORS.lightGray}
                returnKeyType="done"
              />
            </Animated.View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Carbs (g)</Text>
            <Animated.View
              style={[
                styles.inputWrapper,
                {
                  backgroundColor: inputFlash.interpolate({
                    inputRange: [0, 1],
                    outputRange: [COLORS.darkGreen, 'rgba(0, 150, 136, 0.6)'],
                  }),
                },
              ]}
            >
              <TextInput
                style={styles.inputInner}
                value={eatOutTargetCarbs}
                onChangeText={setEatOutTargetCarbs}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={COLORS.lightGray}
                returnKeyType="done"
              />
            </Animated.View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Fat (g)</Text>
            <Animated.View
              style={[
                styles.inputWrapper,
                {
                  backgroundColor: inputFlash.interpolate({
                    inputRange: [0, 1],
                    outputRange: [COLORS.darkGreen, 'rgba(0, 150, 136, 0.6)'],
                  }),
                },
              ]}
            >
              <TextInput
                style={styles.inputInner}
                value={eatOutTargetFat}
                onChangeText={setEatOutTargetFat}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={COLORS.lightGray}
                returnKeyType="done"
              />
            </Animated.View>
          </View>

          <Text style={styles.smartFillHint}>
            Suggested targets based on {getMealsRemaining()} meal{getMealsRemaining() !== 1 ? 's' : ''} remaining today
          </Text>
        </View>

        {/* Scout CTA */}
        <TouchableOpacity
          style={[eoStyles.scoutBtn, !hasTargets && eoStyles.scoutBtnDisabled]}
          onPress={() => {
            if (!hasTargets) return;
            Keyboard.dismiss();
            setEatOutStep('map');
          }}
          activeOpacity={hasTargets ? 0.8 : 1}
        >
          <Ionicons name="map-outline" size={20} color={COLORS.white} style={{ marginRight: 8 }} />
          <Text style={eoStyles.scoutBtnText}>Scout Restaurants</Text>
        </TouchableOpacity>
      </>
    );
  };

  // Home screen: single "Recently Logged" preview card
  const renderRecentlyLogged = () => {
    if (dailyActivity.length === 0) return null;
    const latest = dailyActivity[0];
    const source = latest.source || latest.restaurant || '';
    return (
      <TouchableOpacity
        style={styles.recentCard}
        onPress={() => { setLedgerDate(todayISO()); setLedgerEntries(dailyActivity); navigateTo('dailyLedger'); }}
        activeOpacity={0.75}
      >
        <View style={styles.recentCardLeft}>
          <Text style={styles.recentCardLabel}>RECENTLY LOGGED</Text>
          <Text style={styles.recentCardName} numberOfLines={1}>{latest.name}</Text>
          <Text style={styles.recentCardMeta}>{source ? `${source} · ` : ''}{latest.time}</Text>
        </View>
        <View style={styles.recentCardRight}>
          <View style={styles.recentProteinBadge}>
            <Text style={styles.recentProteinValue}>{latest.macros.protein}</Text>
            <Text style={styles.recentProteinUnit}>g P</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={COLORS.muted} style={{ marginTop: 6 }} />
        </View>
      </TouchableOpacity>
    );
  };

  // History section
  const renderHistory = () => {
    if (history.length === 0) return null;
    return (
      <View style={styles.historySection}>
        <Text style={styles.historyTitle}>Recent Matches</Text>
        {history.map((entry, index) => (
          <View key={index} style={styles.historyItem}>
            <Text style={styles.historyItemText} numberOfLines={1}>
              {entry.restaurant} — {entry.name}
            </Text>
            <Text style={styles.historyDate}>{entry.date}</Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.inner}>
              {currentView === 'home' ? (
                <>
                  {/* HOME SCREEN */}
                  <View style={styles.homeTitleBlock}>
                    <Text style={styles.title}>MacroDecide</Text>
                    <Text style={styles.subtitle}>What are you looking for?</Text>
                    <TouchableOpacity
                      style={styles.ledgerIconBtn}
                      onPress={() => { setLedgerDate(todayISO()); setLedgerEntries(dailyActivity); navigateTo('dailyLedger'); }}
                      activeOpacity={0.7}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="time-outline" size={22} color={COLORS.accentGreen} />
                    </TouchableOpacity>
                  </View>

                  {renderFuelGauge()}

                  {renderRecentlyLogged()}

                  {/* 2×2 Intent Grid */}
                  <View style={styles.homeGrid}>
                    {[
                      { label: 'Eat Out',      sub: 'Nearby restaurants',  icon: 'storefront-outline', onPress: () => navigateTo('eatOut') },
                      { label: 'Eat at Home',  sub: 'Cook or build a meal', icon: 'home-outline',      onPress: () => navigateTo('eatAtHome') },
                      { label: 'Scan Barcode', sub: 'Check any product',    icon: 'scan-outline',      onPress: () => setShowScanner(true) },
                      { label: 'Quick Snack',  sub: 'Grab & go options',    icon: 'fast-food-outline', onPress: () => navigateTo('quickSnack') },
                    ].map(({ label, sub, icon, onPress }) => (
                      <TouchableOpacity key={label} style={styles.homeCard} onPress={onPress} activeOpacity={0.7}>
                        <Ionicons name={icon} size={28} color={COLORS.accentGreen} />
                        <Text style={styles.homeCardLabel}>{label}</Text>
                        <Text style={styles.homeCardSub}>{sub}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {renderScannedResult()}
                  {renderHistory()}
                </>
              ) : currentView === 'cookRecipe' && cookRecipeStep === 'macros' ? (
                <>
                  {/* STEP 1: Macro Input */}
                  <SubViewHeader title="Cook a Recipe" onHome={goHome} />
                  {renderCookRecipeStepIndicator(1)}

                  {renderFuelGauge()}

                  <View style={styles.inputContainer}>
                    <View style={styles.inputHeaderRow}>
                      <Text style={styles.inputSectionLabel}>Target Macros</Text>
                      <TouchableOpacity
                        style={styles.smartFillButton}
                        onPress={handleSmartFill}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.smartFillButtonText}>Smart Split</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Protein (g)</Text>
                      <Animated.View
                        style={[
                          styles.inputWrapper,
                          {
                            backgroundColor: inputFlash.interpolate({
                              inputRange: [0, 1],
                              outputRange: [COLORS.darkGreen, 'rgba(0, 150, 136, 0.6)'],
                            }),
                          },
                        ]}
                      >
                        <TextInput
                          style={styles.inputInner}
                          value={searchProtein}
                          onChangeText={setSearchProtein}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={COLORS.lightGray}
                          returnKeyType="done"
                        />
                      </Animated.View>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Carbs (g)</Text>
                      <Animated.View
                        style={[
                          styles.inputWrapper,
                          {
                            backgroundColor: inputFlash.interpolate({
                              inputRange: [0, 1],
                              outputRange: [COLORS.darkGreen, 'rgba(0, 150, 136, 0.6)'],
                            }),
                          },
                        ]}
                      >
                        <TextInput
                          style={styles.inputInner}
                          value={searchCarbs}
                          onChangeText={setSearchCarbs}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={COLORS.lightGray}
                          returnKeyType="done"
                        />
                      </Animated.View>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Fat (g)</Text>
                      <Animated.View
                        style={[
                          styles.inputWrapper,
                          {
                            backgroundColor: inputFlash.interpolate({
                              inputRange: [0, 1],
                              outputRange: [COLORS.darkGreen, 'rgba(0, 150, 136, 0.6)'],
                            }),
                          },
                        ]}
                      >
                        <TextInput
                          style={styles.inputInner}
                          value={searchFat}
                          onChangeText={setSearchFat}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={COLORS.lightGray}
                          returnKeyType="done"
                        />
                      </Animated.View>
                    </View>

                    <Text style={styles.smartFillHint}>
                      Suggested targets based on {getMealsRemaining()} meal{getMealsRemaining() !== 1 ? 's' : ''} remaining today
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.button}
                    onPress={() => { Keyboard.dismiss(); setCookRecipeStep('filter'); }}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.buttonText}>Next: Choose Preferences →</Text>
                  </TouchableOpacity>
                </>

              ) : currentView === 'cookRecipe' && cookRecipeStep === 'filter' ? (
                <>
                  {/* STEP 2: Preference Filter */}
                  <SubViewHeader
                    title="Cook a Recipe"
                    onHome={goHome}
                    backLabel="← Eat at Home"
                    onBack={() => setCurrentView('eatAtHome')}
                  />
                  {renderCookRecipeStepIndicator(2)}

                  {renderRecipeFilterScreen()}

                  <View style={styles.strictModeContainer}>
                    <View style={styles.strictModeRow}>
                      <Text style={styles.strictModeLabel}>Strict Mode</Text>
                      <Switch
                        value={strictMode}
                        onValueChange={setStrictMode}
                        trackColor={{ false: COLORS.darkGreen, true: COLORS.accentGreen }}
                        thumbColor={COLORS.white}
                      />
                    </View>
                    {strictMode && (
                      <Text style={styles.strictModeTooltip}>
                        Filters out meals that exceed your Carb or Fat targets by more than 10%.
                      </Text>
                    )}
                  </View>

                  <TouchableOpacity
                    style={styles.button}
                    onPress={handleRecipeSearch}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.buttonText}>Find Recipes →</Text>
                  </TouchableOpacity>
                </>

              ) : currentView === 'cookRecipe' && cookRecipeStep === 'results' ? (
                <>
                  {/* STEP 3: Recipe Results */}
                  <SubViewHeader
                    title="Cook a Recipe"
                    onHome={goHome}
                    backLabel="← Filters"
                    onBack={() => { setResults([]); setNoMatch(false); setCookRecipeStep('filter'); }}
                  />
                  {renderCookRecipeStepIndicator(3)}

                  {renderResultCards()}

                  {noMatch && results.length === 0 && (
                    <View style={styles.noMatchContainer}>
                      <Text style={styles.noMatchText}>
                        No recipes match your filters. Adjust your preferences or try different targets.
                      </Text>
                      <TouchableOpacity
                        style={styles.aiRecipeButton}
                        onPress={() => generateAIRecipe(
                          { protein: parseFloat(searchProtein) || 0, carbs: parseFloat(searchCarbs) || 0, fat: parseFloat(searchFat) || 0 },
                          recipeFilters,
                        )}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.aiRecipeButtonText}>✨ Generate Custom AI Recipe</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.resetButton}
                    onPress={goHome}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.resetButtonText}>Back to Home</Text>
                  </TouchableOpacity>
                </>

              ) : currentView === 'mealBuilder' && mealBuilderStep === 'targets' ? (
                <>
                  {/* MEAL BUILDER — Step 1: Set Targets */}
                  <SubViewHeader title="Meal Builder" onHome={goHome} />

                  {renderFuelGauge()}

                  <View style={styles.inputContainer}>
                    <View style={styles.inputHeaderRow}>
                      <Text style={styles.inputSectionLabel}>Target Macros</Text>
                      <TouchableOpacity
                        style={styles.smartFillButton}
                        onPress={handleMbSmartFill}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.smartFillButtonText}>Smart Split</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Protein (g)</Text>
                      <Animated.View
                        style={[
                          styles.inputWrapper,
                          {
                            backgroundColor: inputFlash.interpolate({
                              inputRange: [0, 1],
                              outputRange: [COLORS.darkGreen, 'rgba(0, 150, 136, 0.6)'],
                            }),
                          },
                        ]}
                      >
                        <TextInput
                          style={styles.inputInner}
                          value={mbTargetProtein}
                          onChangeText={setMbTargetProtein}
                          keyboardType="numeric"
                          placeholder="50"
                          placeholderTextColor={COLORS.lightGray}
                          returnKeyType="done"
                        />
                      </Animated.View>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Carbs (g)</Text>
                      <Animated.View
                        style={[
                          styles.inputWrapper,
                          {
                            backgroundColor: inputFlash.interpolate({
                              inputRange: [0, 1],
                              outputRange: [COLORS.darkGreen, 'rgba(0, 150, 136, 0.6)'],
                            }),
                          },
                        ]}
                      >
                        <TextInput
                          style={styles.inputInner}
                          value={mbTargetCarbs}
                          onChangeText={setMbTargetCarbs}
                          keyboardType="numeric"
                          placeholder="60"
                          placeholderTextColor={COLORS.lightGray}
                          returnKeyType="done"
                        />
                      </Animated.View>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Fat (g)</Text>
                      <Animated.View
                        style={[
                          styles.inputWrapper,
                          {
                            backgroundColor: inputFlash.interpolate({
                              inputRange: [0, 1],
                              outputRange: [COLORS.darkGreen, 'rgba(0, 150, 136, 0.6)'],
                            }),
                          },
                        ]}
                      >
                        <TextInput
                          style={styles.inputInner}
                          value={mbTargetFat}
                          onChangeText={setMbTargetFat}
                          keyboardType="numeric"
                          placeholder="15"
                          placeholderTextColor={COLORS.lightGray}
                          returnKeyType="done"
                        />
                      </Animated.View>
                    </View>

                    <Text style={styles.smartFillHint}>
                      Suggested targets based on {getMealsRemaining()} meal{getMealsRemaining() !== 1 ? 's' : ''} remaining today
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.button}
                    onPress={() => { Keyboard.dismiss(); setMealBuilderStep('build'); }}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.buttonText}>Start Building →</Text>
                  </TouchableOpacity>
                </>

              ) : currentView === 'mealBuilder' && mealBuilderStep === 'build' ? (
                <>
                  {/* MEAL BUILDER — Step 2: Precision Build */}
                  <SubViewHeader
                    title="Meal Builder"
                    onHome={goHome}
                    backLabel="← Eat at Home"
                    onBack={() => { Keyboard.dismiss(); setCurrentView('eatAtHome'); }}
                  />

                  {/* ── Unit Toggle ── */}
                  <View style={styles.mbUnitToggleRow}>
                    <Text style={styles.mbUnitToggleLabel}>Units</Text>
                    <View style={styles.mbUnitToggle}>
                      {['g', 'oz'].map(u => (
                        <TouchableOpacity
                          key={u}
                          style={[styles.mbUnitBtn, mbUnit === u && styles.mbUnitBtnActive]}
                          onPress={() => setMbUnit(u)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.mbUnitBtnText, mbUnit === u && styles.mbUnitBtnTextActive]}>{u}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* ── Hero Dashboard ── */}
                  <Animated.View style={[
                    styles.mbDashboard,
                    {
                      borderColor: mbPulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['rgba(0, 121, 107, 0.35)', '#00c853'],
                      }),
                    },
                  ]}>
                    <View style={styles.mbDashboardHeader}>
                      <Text style={styles.mbDashboardTitle}>Meal Progress</Text>
                      {mbIsTargetHit && (
                        <View style={styles.mbTargetHitBadge}>
                          <Text style={styles.mbTargetHitText}>Target Hit!</Text>
                        </View>
                      )}
                    </View>

                    {/* Hero macro numbers */}
                    <View style={styles.mbDashboardRow}>
                      {[
                        { label: 'Protein', current: mbCurrentMacros.protein, target: mbTargetProtein },
                        { label: 'Carbs',   current: mbCurrentMacros.carbs,   target: mbTargetCarbs   },
                        { label: 'Fat',     current: mbCurrentMacros.fat,     target: mbTargetFat     },
                      ].map(({ label, current, target }) => {
                        const tVal = parseFloat(target) || 0;
                        const isOver = tVal > 0 && current > tVal;
                        const pctFill = tVal > 0 ? Math.min(1, current / tVal) : 0;
                        return (
                          <View key={label} style={styles.mbDashboardItem}>
                            <Text style={styles.mbDashboardLabel}>{label}</Text>
                            <Text style={[styles.mbDashboardCurrent, isOver && styles.mbDashboardOver]}>
                              {Math.round(current)}
                            </Text>
                            <Text style={[styles.mbDashboardUnit, isOver && styles.mbDashboardOver]}>g</Text>
                            <View style={styles.mbMiniBarTrack}>
                              <View style={[
                                styles.mbMiniBarFill,
                                { width: `${pctFill * 100}%` },
                                isOver && styles.mbMiniBarOver,
                              ]} />
                            </View>
                            <Text style={styles.mbDashboardTarget}>/ {target || '—'}g</Text>
                          </View>
                        );
                      })}
                    </View>

                    {/* Live match ring */}
                    {mbMatchPct !== null && (
                      <View style={styles.mbMatchRingRow}>
                        <MatchRing percentage={mbMatchPct} size={80} />
                        <Text style={styles.mbMatchLabel}>Live Match to Target</Text>
                      </View>
                    )}
                  </Animated.View>

                  {/* ── Add Custom Food Button ── */}
                  <TouchableOpacity
                    style={styles.mbAddCustomFoodBtn}
                    onPress={() => setShowAddCustomFood(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add-circle-outline" size={18} color={COLORS.accentGreen} />
                    <Text style={styles.mbAddCustomFoodBtnText}>Add Custom Food</Text>
                  </TouchableOpacity>

                  {/* ── Ingredient Sections ── */}
                  {['Proteins', 'Carbs', 'Fats'].map(category => (
                    <View key={category} style={styles.mbSection}>
                      <Text style={styles.mbSectionTitle}>{category}</Text>
                      <View style={styles.mbIngredientGrid}>
                        {allStaples.filter(i => i.category === category).map(ingredient => {
                          const grams = mbIngredients[ingredient.id] || 0;
                          const isActive = mbActiveIngredient === ingredient.id;
                          const isSelected = grams > 0;
                          const contrib = {
                            protein: Math.round(ingredient.macrosPer100g.protein * grams / 100 * 10) / 10,
                            carbs:   Math.round(ingredient.macrosPer100g.carbs   * grams / 100 * 10) / 10,
                            fat:     Math.round(ingredient.macrosPer100g.fat     * grams / 100 * 10) / 10,
                          };
                          // Per-unit reference for the inactive state
                          const perUnitRef = mbUnit === 'oz'
                            ? `per oz: ${(ingredient.macrosPer100g.protein * 28.35 / 100).toFixed(1)}P`
                            : `per 100g: ${ingredient.macrosPer100g.protein}P`;
                          // Display value for the active stepper
                          const displayVal = isActive ? mbEditingText
                            : mbUnit === 'oz' ? (grams / 28.35).toFixed(1) : grams.toString();
                          const unitLabel = mbUnit === 'oz' ? 'oz' : 'g';
                          const step = mbUnit === 'oz' ? Math.round(0.5 * 28.35) : 25;

                          return (
                            <TouchableOpacity
                              key={ingredient.id}
                              style={[
                                styles.mbIngredientSquare,
                                isSelected && styles.mbIngredientSquareSelected,
                                isActive   && styles.mbIngredientSquareActive,
                              ]}
                              onPress={() => {
                                if (isActive) {
                                  // Collapse — commit the edit
                                  const numVal = parseFloat(mbEditingText) || 0;
                                  const g = mbUnit === 'oz' ? Math.round(numVal * 28.35) : Math.round(numVal);
                                  const clamped = Math.max(0, Math.min(500, g));
                                  setMbIngredients(prev => ({ ...prev, [ingredient.id]: clamped }));
                                  setMbActiveIngredient(null);
                                } else {
                                  const initGrams = grams || 100;
                                  if (!grams) setMbIngredients(prev => ({ ...prev, [ingredient.id]: initGrams }));
                                  setMbActiveIngredient(ingredient.id);
                                  setMbEditingText(
                                    mbUnit === 'oz'
                                      ? (initGrams / 28.35).toFixed(1)
                                      : initGrams.toString()
                                  );
                                }
                              }}
                              activeOpacity={0.75}
                            >
                              <Text style={styles.mbIngredientName} numberOfLines={2}>{ingredient.name}</Text>
                              {ingredient.subtitle && (
                                <Text style={styles.mbIngredientSub}>{ingredient.subtitle}</Text>
                              )}

                              {isActive ? (
                                <View style={styles.mbStepper}>
                                  <TouchableOpacity
                                    style={[styles.mbStepperBtn, grams <= 0 && styles.mbStepperBtnDisabled]}
                                    onPress={() => {
                                      const next = Math.max(0, grams - step);
                                      setMbIngredients(prev => ({ ...prev, [ingredient.id]: next }));
                                      setMbEditingText(mbUnit === 'oz' ? (next / 28.35).toFixed(1) : next.toString());
                                      if (next === 0) setMbActiveIngredient(null);
                                    }}
                                    disabled={grams <= 0}
                                    activeOpacity={0.6}
                                  >
                                    <Text style={styles.mbStepperBtnText}>-</Text>
                                  </TouchableOpacity>

                                  <View style={styles.mbStepperInputWrap}>
                                    <TextInput
                                      style={styles.mbStepperInput}
                                      value={mbEditingText}
                                      onChangeText={(text) => {
                                        setMbEditingText(text);
                                        const numVal = parseFloat(text) || 0;
                                        const g = mbUnit === 'oz'
                                          ? Math.round(numVal * 28.35)
                                          : Math.round(numVal);
                                        setMbIngredients(prev => ({
                                          ...prev,
                                          [ingredient.id]: Math.max(0, Math.min(500, g)),
                                        }));
                                      }}
                                      onBlur={() => {
                                        const numVal = parseFloat(mbEditingText) || 0;
                                        const g = mbUnit === 'oz'
                                          ? Math.round(numVal * 28.35)
                                          : Math.round(numVal);
                                        const clamped = Math.max(0, Math.min(500, g));
                                        setMbIngredients(prev => ({ ...prev, [ingredient.id]: clamped }));
                                        setMbEditingText(
                                          mbUnit === 'oz'
                                            ? (clamped / 28.35).toFixed(1)
                                            : clamped.toString()
                                        );
                                        if (clamped === 0) setMbActiveIngredient(null);
                                      }}
                                      onSubmitEditing={() => Keyboard.dismiss()}
                                      keyboardType="decimal-pad"
                                      returnKeyType="done"
                                      selectTextOnFocus
                                    />
                                    <Text style={styles.mbStepperUnit}>{unitLabel}</Text>
                                  </View>

                                  <TouchableOpacity
                                    style={[styles.mbStepperBtn, grams >= 500 && styles.mbStepperBtnDisabled]}
                                    onPress={() => {
                                      const next = Math.min(500, grams + step);
                                      setMbIngredients(prev => ({ ...prev, [ingredient.id]: next }));
                                      setMbEditingText(mbUnit === 'oz' ? (next / 28.35).toFixed(1) : next.toString());
                                    }}
                                    disabled={grams >= 500}
                                    activeOpacity={0.6}
                                  >
                                    <Text style={styles.mbStepperBtnText}>+</Text>
                                  </TouchableOpacity>
                                </View>
                              ) : (
                                <View style={styles.mbMacroPreview}>
                                  {isSelected ? (
                                    <Text style={styles.mbMacroContrib}>
                                      {contrib.protein}P · {contrib.carbs}C · {contrib.fat}F
                                    </Text>
                                  ) : (
                                    <Text style={styles.mbMacroBase}>{perUnitRef}</Text>
                                  )}
                                </View>
                              )}

                              {isSelected && !isActive && (
                                <Text style={styles.mbGramsLabel}>
                                  {mbUnit === 'oz'
                                    ? `${(grams / 28.35).toFixed(1)} oz`
                                    : `${grams}g`}
                                </Text>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  ))}

                  {/* ── Recipe Suggestion Badge ── */}
                  {mbSuggestion && (
                    <TouchableOpacity
                      style={styles.mbSuggestionBadge}
                      onPress={() => {
                        const recipe = RECIPES.find(r => r.name === mbSuggestion.recipe.name);
                        if (recipe) {
                          setSelectedRecipe({
                            name: recipe.name,
                            isRecipe: true,
                            servingMultiplier: 1,
                            recipeDetails: { ingredients: recipe.ingredients, prepTime: recipe.prepTime, steps: recipe.steps },
                          });
                          setShowRecipeDetail(true);
                        }
                      }}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.mbSuggestionIcon}>💡</Text>
                      <View style={styles.mbSuggestionInfo}>
                        <Text style={styles.mbSuggestionLabel}>Your build resembles</Text>
                        <Text style={styles.mbSuggestionName}>{mbSuggestion.recipe.name}</Text>
                        <Text style={styles.mbSuggestionHint}>Tap for cooking instructions</Text>
                      </View>
                      <Text style={styles.mbSuggestionScore}>{mbSuggestion.score}%</Text>
                    </TouchableOpacity>
                  )}

                  {/* ── Finalize Button ── */}
                  <TouchableOpacity
                    style={[
                      styles.button,
                      styles.mbFinalizeBtn,
                      Object.values(mbIngredients).every(g => !g) && styles.mbFinalizeBtnDisabled,
                    ]}
                    onPress={() => {
                      if (Object.values(mbIngredients).every(g => !g)) return;
                      Keyboard.dismiss();
                      setShowMealBuilderFinalize(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.buttonText}>Finalize Meal</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.resetButton} onPress={goHome} activeOpacity={0.6}>
                    <Text style={styles.resetButtonText}>Back to Home</Text>
                  </TouchableOpacity>
                </>

              ) : currentView === 'eatAtHome' ? (
                <>
                  {/* EAT AT HOME HUB */}
                  <SubViewHeader title="Eat at Home" onHome={goHome} />

                  {renderFuelGauge()}

                  <View style={styles.inputContainer}>
                    <View style={styles.inputHeaderRow}>
                      <Text style={styles.inputSectionLabel}>Target Macros</Text>
                      <TouchableOpacity
                        style={styles.smartFillButton}
                        onPress={handleSmartFill}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.smartFillButtonText}>Smart Split</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Protein (g)</Text>
                      <Animated.View
                        style={[
                          styles.inputWrapper,
                          {
                            backgroundColor: inputFlash.interpolate({
                              inputRange: [0, 1],
                              outputRange: [COLORS.darkGreen, 'rgba(0, 150, 136, 0.6)'],
                            }),
                          },
                        ]}
                      >
                        <TextInput
                          style={styles.inputInner}
                          value={searchProtein}
                          onChangeText={setSearchProtein}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={COLORS.lightGray}
                          returnKeyType="done"
                        />
                      </Animated.View>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Carbs (g)</Text>
                      <Animated.View
                        style={[
                          styles.inputWrapper,
                          {
                            backgroundColor: inputFlash.interpolate({
                              inputRange: [0, 1],
                              outputRange: [COLORS.darkGreen, 'rgba(0, 150, 136, 0.6)'],
                            }),
                          },
                        ]}
                      >
                        <TextInput
                          style={styles.inputInner}
                          value={searchCarbs}
                          onChangeText={setSearchCarbs}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={COLORS.lightGray}
                          returnKeyType="done"
                        />
                      </Animated.View>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Fat (g)</Text>
                      <Animated.View
                        style={[
                          styles.inputWrapper,
                          {
                            backgroundColor: inputFlash.interpolate({
                              inputRange: [0, 1],
                              outputRange: [COLORS.darkGreen, 'rgba(0, 150, 136, 0.6)'],
                            }),
                          },
                        ]}
                      >
                        <TextInput
                          style={styles.inputInner}
                          value={searchFat}
                          onChangeText={setSearchFat}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={COLORS.lightGray}
                          returnKeyType="done"
                        />
                      </Animated.View>
                    </View>

                    <Text style={styles.smartFillHint}>
                      Suggested targets based on {getMealsRemaining()} meal{getMealsRemaining() !== 1 ? 's' : ''} remaining today
                    </Text>
                  </View>

                  {/* Two large CTA buttons */}
                  <View style={styles.eatAtHomeActions}>
                    <TouchableOpacity
                      style={styles.eatAtHomePrimaryBtn}
                      onPress={() => {
                        Keyboard.dismiss();
                        setCookRecipeStep('filter');
                        setCurrentView('cookRecipe');
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="restaurant-outline" size={22} color={COLORS.white} />
                      <Text style={styles.eatAtHomePrimaryBtnText}>Find a Recipe</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.eatAtHomeSecondaryBtn}
                      onPress={() => {
                        Keyboard.dismiss();
                        setMbTargetProtein(searchProtein);
                        setMbTargetCarbs(searchCarbs);
                        setMbTargetFat(searchFat);
                        setMealBuilderStep('build');
                        setMbIngredients({});
                        setMbActiveIngredient(null);
                        setMbUnit('g');
                        setMbEditingText('');
                        setMealBuilderMealName('');
                        setShowMealBuilderFinalize(false);
                        mbWasHitRef.current = false;
                        mbPulseAnim.setValue(0);
                        setCurrentView('mealBuilder');
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="layers-outline" size={22} color={COLORS.accentGreen} />
                      <Text style={styles.eatAtHomeSecondaryBtnText}>Manual Meal Builder</Text>
                    </TouchableOpacity>
                  </View>
                </>

              ) : currentView === 'dailyLedger' ? (
                <>
                  {/* DAILY LEDGER */}
                  <SubViewHeader title="Daily Ledger" onHome={goHome} />

                  {/* Date Navigation Row */}
                  {(() => {
                    const isToday = ledgerDate === todayISO();
                    return (
                      <View style={styles.ledgerDateNav}>
                        <TouchableOpacity
                          style={styles.ledgerNavArrow}
                          onPress={() => loadLedgerDate(shiftDate(ledgerDate, -1))}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="chevron-back" size={20} color={COLORS.accentGreen} />
                        </TouchableOpacity>
                        <Text style={styles.ledgerDateLabel}>{formatLedgerDate(ledgerDate)}</Text>
                        <TouchableOpacity
                          style={[styles.ledgerNavArrow, isToday && styles.ledgerNavArrowDisabled]}
                          onPress={() => { if (!isToday) loadLedgerDate(shiftDate(ledgerDate, 1)); }}
                          activeOpacity={isToday ? 1 : 0.7}
                        >
                          <Ionicons name="chevron-forward" size={20} color={isToday ? COLORS.muted : COLORS.accentGreen} />
                        </TouchableOpacity>
                      </View>
                    );
                  })()}

                  {/* Consumed Summary */}
                  {(() => {
                    const isToday = ledgerDate === todayISO();
                    const entries = isToday ? dailyActivity : ledgerEntries;
                    const totalP = entries.reduce((s, e) => s + (e.macros.protein || 0), 0);
                    const totalC = entries.reduce((s, e) => s + (e.macros.carbs || 0), 0);
                    const totalF = entries.reduce((s, e) => s + (e.macros.fat || 0), 0);
                    return (
                      <View style={styles.ledgerSummary}>
                        <Text style={styles.ledgerSummaryLabel}>
                          {isToday ? 'CONSUMED TODAY' : 'CONSUMED'}
                        </Text>
                        <View style={styles.ledgerMacroRow}>
                          <View style={styles.ledgerMacroCol}>
                            <Text style={styles.ledgerMacroValue}>{totalP}g</Text>
                            <Text style={styles.ledgerMacroKey}>Protein</Text>
                          </View>
                          <View style={styles.ledgerMacroDivider} />
                          <View style={styles.ledgerMacroCol}>
                            <Text style={styles.ledgerMacroValue}>{totalC}g</Text>
                            <Text style={styles.ledgerMacroKey}>Carbs</Text>
                          </View>
                          <View style={styles.ledgerMacroDivider} />
                          <View style={styles.ledgerMacroCol}>
                            <Text style={styles.ledgerMacroValue}>{totalF}g</Text>
                            <Text style={styles.ledgerMacroKey}>Fat</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })()}

                  {/* Meal List */}
                  {(() => {
                    const isToday = ledgerDate === todayISO();
                    const entries = isToday ? dailyActivity : ledgerEntries;
                    const onDelete = isToday ? undoDeduction : deleteLedgerEntry;
                    if (ledgerLoading) {
                      return <Text style={styles.ledgerEmpty}>Loading…</Text>;
                    }
                    if (entries.length === 0) {
                      return <Text style={styles.ledgerEmpty}>No meals logged on this day.</Text>;
                    }
                    return renderMealList(entries, onDelete);
                  })()}
                </>

              ) : currentView === 'eatOut' ? (
                eatOutStep === 'briefing' ? (
                  <>{renderEatOutBriefing()}</>
                ) : (
                  null /* full-screen map rendered as overlay outside the ScrollView */
                )

              ) : (
                <>
                  {/* SUB-VIEW: quickSnack */}
                  <SubViewHeader title={viewTitle} onHome={goHome} />

                  {renderFuelGauge()}

                  <View style={styles.inputContainer}>
                    <View style={styles.inputHeaderRow}>
                      <Text style={styles.inputSectionLabel}>Target Macros</Text>
                      <TouchableOpacity
                        style={styles.smartFillButton}
                        onPress={handleSmartFill}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.smartFillButtonText}>Smart Split</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Protein (g)</Text>
                      <Animated.View
                        style={[
                          styles.inputWrapper,
                          {
                            backgroundColor: inputFlash.interpolate({
                              inputRange: [0, 1],
                              outputRange: [COLORS.darkGreen, 'rgba(0, 150, 136, 0.6)'],
                            }),
                          },
                        ]}
                      >
                        <TextInput
                          style={styles.inputInner}
                          value={searchProtein}
                          onChangeText={setSearchProtein}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={COLORS.lightGray}
                          returnKeyType="done"
                        />
                      </Animated.View>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Carbs (g)</Text>
                      <Animated.View
                        style={[
                          styles.inputWrapper,
                          {
                            backgroundColor: inputFlash.interpolate({
                              inputRange: [0, 1],
                              outputRange: [COLORS.darkGreen, 'rgba(0, 150, 136, 0.6)'],
                            }),
                          },
                        ]}
                      >
                        <TextInput
                          style={styles.inputInner}
                          value={searchCarbs}
                          onChangeText={setSearchCarbs}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={COLORS.lightGray}
                          returnKeyType="done"
                        />
                      </Animated.View>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Fat (g)</Text>
                      <Animated.View
                        style={[
                          styles.inputWrapper,
                          {
                            backgroundColor: inputFlash.interpolate({
                              inputRange: [0, 1],
                              outputRange: [COLORS.darkGreen, 'rgba(0, 150, 136, 0.6)'],
                            }),
                          },
                        ]}
                      >
                        <TextInput
                          style={styles.inputInner}
                          value={searchFat}
                          onChangeText={setSearchFat}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={COLORS.lightGray}
                          returnKeyType="done"
                        />
                      </Animated.View>
                    </View>

                    <Text style={styles.smartFillHint}>
                      Suggested targets based on {getMealsRemaining()} meal{getMealsRemaining() !== 1 ? 's' : ''} remaining today
                    </Text>
                  </View>

                  <View style={styles.strictModeContainer}>
                    <View style={styles.strictModeRow}>
                      <Text style={styles.strictModeLabel}>Strict Mode</Text>
                      <Switch
                        value={strictMode}
                        onValueChange={setStrictMode}
                        trackColor={{ false: COLORS.darkGreen, true: COLORS.accentGreen }}
                        thumbColor={COLORS.white}
                      />
                    </View>
                    {strictMode && (
                      <Text style={styles.strictModeTooltip}>
                        Filters out meals that exceed your Carb or Fat targets by more than 10%.
                      </Text>
                    )}
                  </View>

                  <TouchableOpacity
                    style={styles.button}
                    onPress={handleFindMeal}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.buttonText}>{findButtonText}</Text>
                  </TouchableOpacity>

                  {renderResultCards()}

                  {noMatch && results.length === 0 && (
                    <View style={styles.noMatchContainer}>
                      <Text style={styles.noMatchText}>
                        No strict matches found. Try increasing your targets or turning off Strict Mode.
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.resetButton}
                    onPress={goHome}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.resetButtonText}>Back to Home</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* ── Eat Out Full-Screen Map Overlay (step: map) ── */}
      {currentView === 'eatOut' && eatOutStep === 'map' && (
        <View style={StyleSheet.absoluteFill}>
          {renderEatOutMap()}
        </View>
      )}

      {/* ── Eat Out Restaurant Detail Overlay (step: detail) ── */}
      {currentView === 'eatOut' && eatOutStep === 'detail' && (
        <View style={StyleSheet.absoluteFill}>
          {renderRestaurantDetail()}
        </View>
      )}

      <Modal
        visible={showScanner}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowScanner(false)}
      >
        <BarcodeScanner
          onBarcodeScanned={handleBarcodeScanned}
          onClose={() => setShowScanner(false)}
        />
      </Modal>

      {/* Baseline Editor Modal */}
      <Modal
        visible={showBaselineEditor}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowBaselineEditor(false)}
      >
        <BaselineEditor
          baseline={baseline}
          onSave={saveBaseline}
          onCancel={() => setShowBaselineEditor(false)}
        />
      </Modal>

      {/* Recipe Detail Modal */}
      <Modal
        visible={showRecipeDetail}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowRecipeDetail(false)}
      >
        <SafeAreaView style={recipeModalStyles.safeArea}>
          <ScrollView
            contentContainerStyle={recipeModalStyles.scrollContent}
            showsVerticalScrollIndicator={true}
          >
            {selectedRecipe && (
              <>
                <TouchableOpacity
                  style={recipeModalStyles.closeRow}
                  onPress={() => setShowRecipeDetail(false)}
                  activeOpacity={0.6}
                >
                  <Text style={recipeModalStyles.closeRowText}>← Back to Results</Text>
                </TouchableOpacity>

                <Text style={recipeModalStyles.title}>{selectedRecipe.name}</Text>

                {parseFloat(searchProtein) > 0 && (
                  <Text style={recipeModalStyles.targetSubtitle}>
                    Customized for your {Math.round(parseFloat(searchProtein))}g Protein Target
                  </Text>
                )}

                {selectedRecipe.doubleUp && (
                  <View style={recipeModalStyles.doubleUpBanner}>
                    <Text style={recipeModalStyles.doubleUpTitle}>⚡ Double-Portion Meal</Text>
                    <Text style={recipeModalStyles.doubleUpText}>
                      Ingredients are scaled for two portions — great for meal prep
                    </Text>
                  </View>
                )}

                <View style={recipeModalStyles.prepTimeRow}>
                  <Text style={recipeModalStyles.prepTimeLabel}>Prep Time</Text>
                  <Text style={recipeModalStyles.prepTimeValue}>
                    {selectedRecipe.recipeDetails?.prepTime}
                  </Text>
                </View>

                <Text style={recipeModalStyles.sectionTitle}>Your Ingredients</Text>
                {selectedRecipe.recipeDetails?.ingredients?.map((ingredient, i) => (
                  <View key={i} style={recipeModalStyles.ingredientRow}>
                    <Text style={recipeModalStyles.bullet}>•</Text>
                    <Text style={recipeModalStyles.ingredientText}>
                      {selectedRecipe.servingMultiplier && selectedRecipe.servingMultiplier !== 1
                        ? scaleIngredient(ingredient, selectedRecipe.servingMultiplier)
                        : ingredient}
                    </Text>
                  </View>
                ))}

                <Text style={recipeModalStyles.sectionTitle}>Instructions</Text>
                {selectedRecipe.recipeDetails?.steps?.map((step, i) => (
                  <View key={i} style={recipeModalStyles.stepRow}>
                    <View style={recipeModalStyles.stepNumberCircle}>
                      <Text style={recipeModalStyles.stepNumber}>{i + 1}</Text>
                    </View>
                    <Text style={recipeModalStyles.stepText}>{step}</Text>
                  </View>
                ))}

                <View style={recipeModalStyles.modalFooterRow}>
                  <TouchableOpacity
                    style={[recipeModalStyles.closeButton, recipeModalStyles.footerHalf]}
                    onPress={() => setShowRecipeDetail(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={recipeModalStyles.closeButtonText}>← Results</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[recipeModalStyles.closeButton, recipeModalStyles.footerHalf, recipeModalStyles.homeButton]}
                    onPress={() => { setShowRecipeDetail(false); goHome(); }}
                    activeOpacity={0.7}
                  >
                    <Text style={recipeModalStyles.closeButtonText}>⌂ Home</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
      {/* Meal Builder — Add Custom Food Modal */}
      <Modal
        visible={showAddCustomFood}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowAddCustomFood(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={addFoodStyles.overlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={addFoodStyles.keyboardAvoid}
            >
              <View style={addFoodStyles.card}>
                <Text style={addFoodStyles.title}>Add Custom Food</Text>
                <Text style={addFoodStyles.subtitle}>Macros per 100g (or per serving)</Text>

                <Text style={addFoodStyles.label}>Food Name</Text>
                <TextInput
                  style={addFoodStyles.input}
                  value={customFoodName}
                  onChangeText={setCustomFoodName}
                  placeholder="e.g. Greek Yogurt"
                  placeholderTextColor={COLORS.muted}
                  returnKeyType="next"
                  autoFocus
                />

                <View style={addFoodStyles.macroRow}>
                  <View style={addFoodStyles.macroField}>
                    <Text style={addFoodStyles.label}>Protein (g)</Text>
                    <TextInput
                      style={addFoodStyles.macroInput}
                      value={customFoodProtein}
                      onChangeText={setCustomFoodProtein}
                      placeholder="0"
                      placeholderTextColor={COLORS.muted}
                      keyboardType="decimal-pad"
                      returnKeyType="next"
                    />
                  </View>
                  <View style={addFoodStyles.macroField}>
                    <Text style={addFoodStyles.label}>Carbs (g)</Text>
                    <TextInput
                      style={addFoodStyles.macroInput}
                      value={customFoodCarbs}
                      onChangeText={setCustomFoodCarbs}
                      placeholder="0"
                      placeholderTextColor={COLORS.muted}
                      keyboardType="decimal-pad"
                      returnKeyType="next"
                    />
                  </View>
                  <View style={addFoodStyles.macroField}>
                    <Text style={addFoodStyles.label}>Fat (g)</Text>
                    <TextInput
                      style={addFoodStyles.macroInput}
                      value={customFoodFat}
                      onChangeText={setCustomFoodFat}
                      placeholder="0"
                      placeholderTextColor={COLORS.muted}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      onSubmitEditing={handleAddCustomFood}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={addFoodStyles.saveBtn}
                  onPress={handleAddCustomFood}
                  activeOpacity={0.7}
                >
                  <Text style={addFoodStyles.saveBtnText}>Add to Staples</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={addFoodStyles.cancelBtn}
                  onPress={() => setShowAddCustomFood(false)}
                  activeOpacity={0.6}
                >
                  <Text style={addFoodStyles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Meal Builder — Finalize Modal */}
      <Modal
        visible={showMealBuilderFinalize}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowMealBuilderFinalize(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={mbFinalizeStyles.overlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={mbFinalizeStyles.keyboardAvoid}
            >
              <View style={mbFinalizeStyles.card}>
                <Text style={mbFinalizeStyles.title}>Name This Meal</Text>
                <Text style={mbFinalizeStyles.subtitle}>
                  {Math.round(mbCurrentMacros.protein)}P · {Math.round(mbCurrentMacros.carbs)}C · {Math.round(mbCurrentMacros.fat)}F
                </Text>
                <TextInput
                  style={mbFinalizeStyles.input}
                  value={mealBuilderMealName}
                  onChangeText={setMealBuilderMealName}
                  placeholder="e.g. Post-Gym Bowl"
                  placeholderTextColor={COLORS.muted}
                  returnKeyType="done"
                  onSubmitEditing={handleMealBuilderFinalize}
                  autoFocus
                />
                <TouchableOpacity style={mbFinalizeStyles.saveBtn} onPress={handleMealBuilderFinalize} activeOpacity={0.7}>
                  <Text style={mbFinalizeStyles.saveBtnText}>Save & Log Meal</Text>
                </TouchableOpacity>
                <TouchableOpacity style={mbFinalizeStyles.cancelBtn} onPress={() => setShowMealBuilderFinalize(false)} activeOpacity={0.6}>
                  <Text style={mbFinalizeStyles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

    </SafeAreaView>
  );
}

const mbFinalizeStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 26, 26, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  keyboardAvoid: {
    width: '100%',
    maxWidth: 320,
  },
  card: {
    backgroundColor: COLORS.darkGreen,
    borderRadius: 16,
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.accentGreen,
    textAlign: 'center',
    marginBottom: 20,
  },
  input: {
    backgroundColor: COLORS.darkBlue,
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 16,
  },
  saveBtn: {
    backgroundColor: COLORS.accentGreen,
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  saveBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
  cancelBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: COLORS.muted,
    fontSize: 14,
  },
});

const addFoodStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 26, 26, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  keyboardAvoid: {
    width: '100%',
    maxWidth: 340,
  },
  card: {
    backgroundColor: COLORS.darkGreen,
    borderRadius: 16,
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.muted,
    textAlign: 'center',
    marginBottom: 20,
  },
  label: {
    fontSize: 11,
    color: COLORS.accentGreen,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.darkBlue,
    borderRadius: 8,
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontSize: 16,
    color: COLORS.white,
    marginBottom: 16,
  },
  macroRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  macroField: {
    flex: 1,
  },
  macroInput: {
    backgroundColor: COLORS.darkBlue,
    borderRadius: 8,
    paddingVertical: 13,
    paddingHorizontal: 10,
    fontSize: 15,
    color: COLORS.white,
    textAlign: 'center',
  },
  saveBtn: {
    backgroundColor: COLORS.accentGreen,
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  saveBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  cancelBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: COLORS.muted,
    fontSize: 14,
  },
});

const recipeModalStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.darkBlue,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  closeRow: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  closeRowText: {
    fontSize: 16,
    color: COLORS.accentGreen,
    fontWeight: '600',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 16,
  },
  targetSubtitle: {
    fontSize: 13,
    color: COLORS.accentGreen,
    textAlign: 'center',
    marginTop: -10,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  doubleUpBanner: {
    backgroundColor: 'rgba(239, 83, 80, 0.1)',
    borderWidth: 1,
    borderColor: '#ef5350',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    alignItems: 'center',
  },
  doubleUpTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ef5350',
    marginBottom: 4,
  },
  doubleUpText: {
    fontSize: 13,
    color: COLORS.lightGray,
    textAlign: 'center',
    lineHeight: 18,
  },
  prepTimeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
    backgroundColor: 'rgba(0, 77, 77, 0.4)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'center',
  },
  prepTimeLabel: {
    fontSize: 12,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  prepTimeValue: {
    fontSize: 14,
    color: COLORS.accentGreen,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.lightGray,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 8,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    paddingLeft: 4,
  },
  bullet: {
    fontSize: 14,
    color: COLORS.accentGreen,
    marginRight: 10,
    lineHeight: 22,
  },
  ingredientText: {
    fontSize: 15,
    color: COLORS.lightGray,
    flex: 1,
    lineHeight: 22,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  stepNumberCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    marginTop: 1,
  },
  stepNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.white,
  },
  stepText: {
    fontSize: 15,
    color: COLORS.lightGray,
    flex: 1,
    lineHeight: 23,
  },
  modalFooterRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  footerHalf: {
    flex: 1,
    marginTop: 0,
  },
  closeButton: {
    backgroundColor: COLORS.accentGreen,
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 24,
  },
  homeButton: {
    backgroundColor: '#1e1e1e',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  closeButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.darkBlue,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  inner: {
    alignItems: 'center',
    padding: 20,
    paddingBottom: 40,
  },
  // Home header with ledger icon
  homeTitleBlock: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  ledgerIconBtn: {
    position: 'absolute',
    right: 0,
    top: 2,
    padding: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 121, 107, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0, 121, 107, 0.3)',
  },
  // Recently Logged preview card
  recentCard: {
    width: '100%',
    maxWidth: 320,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 77, 77, 0.3)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 121, 107, 0.25)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
  },
  recentCardLeft: {
    flex: 1,
  },
  recentCardLabel: {
    fontSize: 9,
    color: COLORS.accentGreen,
    letterSpacing: 1.2,
    fontWeight: '700',
    marginBottom: 3,
  },
  recentCardName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 2,
  },
  recentCardMeta: {
    fontSize: 11,
    color: COLORS.muted,
  },
  recentCardRight: {
    alignItems: 'center',
    marginLeft: 12,
    gap: 4,
  },
  recentProteinBadge: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 121, 107, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(0, 121, 107, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentProteinValue: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.accentGreen,
    lineHeight: 19,
  },
  recentProteinUnit: {
    fontSize: 9,
    color: COLORS.muted,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  // Daily Ledger screen
  ledgerSummary: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: 'rgba(0, 77, 77, 0.3)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0, 121, 107, 0.3)',
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  ledgerSummaryLabel: {
    fontSize: 10,
    color: COLORS.muted,
    letterSpacing: 1.2,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  ledgerMacroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  ledgerMacroCol: {
    flex: 1,
    alignItems: 'center',
  },
  ledgerMacroValue: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 2,
  },
  ledgerMacroKey: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '500',
  },
  ledgerMacroDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  ledgerEmpty: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 40,
    fontStyle: 'italic',
  },
  ledgerDateNav: {
    width: '100%',
    maxWidth: 320,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  ledgerNavArrow: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 121, 107, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0, 121, 107, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ledgerNavArrowDisabled: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  ledgerDateLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
    letterSpacing: 0.2,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.lightGray,
    marginBottom: 40,
  },
  inputContainer: {
    width: '100%',
    maxWidth: 320,
    marginBottom: 40,
  },
  inputHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  inputSectionLabel: {
    fontSize: 12,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  smartFillButton: {
    backgroundColor: 'rgba(0, 121, 107, 0.3)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.accentGreen,
  },
  smartFillButtonText: {
    fontSize: 11,
    color: COLORS.accentGreen,
    fontWeight: '600',
  },
  smartFillHint: {
    fontSize: 11,
    color: COLORS.muted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: COLORS.lightGray,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.darkGreen,
    borderRadius: 8,
    padding: 16,
    fontSize: 18,
    color: COLORS.white,
    textAlign: 'center',
  },
  inputWrapper: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  inputInner: {
    padding: 16,
    fontSize: 18,
    color: COLORS.white,
    textAlign: 'center',
    backgroundColor: 'transparent',
  },
  button: {
    backgroundColor: COLORS.darkGreen,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 8,
    minWidth: 200,
    alignSelf: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  resultContainer: {
    marginTop: 40,
    alignItems: 'center',
    backgroundColor: COLORS.darkGreen,
    padding: 0,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    width: '100%',
    maxWidth: 320,
    minHeight: 280,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  resultLabel: {
    fontSize: 14,
    color: COLORS.lightGray,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  resultRankBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    zIndex: 1,
  },
  resultRankBadgeText: {
    fontSize: 12,
    color: COLORS.lightGray,
    fontWeight: '700',
  },
  resultRestaurant: {
    fontSize: 13,
    color: COLORS.accentGreen,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  restaurantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  distanceAwayText: {
    fontSize: 12,
    color: COLORS.accentGreen,
    marginBottom: 8,
    fontWeight: '500',
  },
  outsideRadiusWarning: {
    fontSize: 11,
    color: '#ffa726',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  resultButtonsColumn: {
    width: '100%',
    marginTop: 16,
    alignItems: 'center',
  },
  resultName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 6,
  },
  cardImage: {
    width: '100%',
    height: 140,
  },
  cardImagePlaceholder: {
    width: '100%',
    height: 80,
    backgroundColor: 'rgba(0, 121, 107, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardImagePlaceholderText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.accentGreen,
  },
  cardContent: {
    padding: 20,
    alignItems: 'center',
    width: '100%',
  },
  quantitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginVertical: 8,
  },
  quantityButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityButtonText: {
    fontSize: 20,
    color: COLORS.white,
    fontWeight: '600',
  },
  quantityButtonDisabled: {
    opacity: 0.3,
  },
  quantityValue: {
    fontSize: 18,
    color: COLORS.white,
    fontWeight: '700',
    minWidth: 36,
    textAlign: 'center',
  },
  prosConsContainer: {
    width: '100%',
    marginBottom: 8,
  },
  prosText: {
    fontSize: 12,
    color: '#66bb6a',
    textAlign: 'center',
    marginBottom: 4,
  },
  prosLabel: {
    fontWeight: 'bold',
  },
  consText: {
    fontSize: 12,
    color: '#ffa726',
    textAlign: 'center',
  },
  consLabel: {
    fontWeight: 'bold',
  },
  strictModeContainer: {
    width: '100%',
    maxWidth: 320,
    marginBottom: 24,
  },
  strictModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  strictModeLabel: {
    fontSize: 14,
    color: COLORS.lightGray,
  },
  strictModeTooltip: {
    fontSize: 11,
    fontStyle: 'italic',
    color: COLORS.muted,
    marginTop: 8,
    lineHeight: 16,
  },
  noMatchContainer: {
    marginTop: 40,
    width: '100%',
    maxWidth: 320,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  noMatchText: {
    fontSize: 13,
    fontStyle: 'italic',
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 19,
  },
  scaledLabel: {
    fontSize: 11,
    color: COLORS.accentGreen,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: -6,
    marginBottom: 4,
    opacity: 0.85,
  },
  aiRecipeButton: {
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    backgroundColor: 'rgba(149,76,233,0.15)',
    borderWidth: 1,
    borderColor: '#954ce9',
  },
  aiRecipeButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#c084fc',
    textAlign: 'center',
  },
  resetButton: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  resetButtonText: {
    color: COLORS.lightGray,
    fontSize: 14,
    textAlign: 'center',
  },
  historySection: {
    marginTop: 32,
    width: '100%',
    maxWidth: 320,
  },
  historyTitle: {
    fontSize: 11,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  historyItemText: {
    fontSize: 13,
    color: COLORS.muted,
    flex: 1,
    marginRight: 12,
  },
  historyDate: {
    fontSize: 11,
    color: 'rgba(160,160,160,0.7)',
  },
  scanButton: {
    marginTop: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.accentGreen,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 8,
    minWidth: 200,
    alignSelf: 'center',
    alignItems: 'center',
  },
  scanButtonText: {
    color: COLORS.accentGreen,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  scannedContainer: {
    marginTop: 40,
    alignItems: 'center',
    backgroundColor: COLORS.darkGreen,
    padding: 0,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: COLORS.accentGreen,
    width: '100%',
    maxWidth: 320,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  scannedContainerWarning: {
    borderColor: '#ffa726',
  },
  scannedLabel: {
    fontSize: 12,
    color: COLORS.accentGreen,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '600',
  },
  scannedBrand: {
    fontSize: 11,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  scannedName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 12,
  },
  servingInfo: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  noTargetsHint: {
    fontSize: 12,
    color: COLORS.muted,
    fontStyle: 'italic',
    marginBottom: 12,
    textAlign: 'center',
  },
  warningsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 12,
    gap: 8,
  },
  warningBadge: {
    backgroundColor: 'rgba(255, 167, 38, 0.2)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ffa726',
  },
  warningText: {
    fontSize: 11,
    color: '#ffa726',
    fontWeight: '600',
  },
  scannedAnalysis: {
    fontSize: 12,
    fontStyle: 'italic',
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 17,
  },
  dismissButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  dismissButtonText: {
    color: COLORS.muted,
    fontSize: 13,
    textAlign: 'center',
  },
  fuelGaugeContainer: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: 'rgba(0, 77, 77, 0.3)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  fuelGaugeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  fuelGaugeTitle: {
    fontSize: 12,
    color: COLORS.lightGray,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  editBaselineLink: {
    fontSize: 11,
    color: COLORS.accentGreen,
    fontWeight: '500',
  },
  fuelGaugeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  fuelGaugeItem: {
    flex: 1,
    alignItems: 'center',
  },
  fuelGaugeLabel: {
    fontSize: 10,
    color: COLORS.muted,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fuelBarContainer: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  fuelBar: {
    height: '100%',
    borderRadius: 3,
  },
  fuelBarProtein: {
    backgroundColor: '#66bb6a',
  },
  fuelBarCarbs: {
    backgroundColor: '#42a5f5',
  },
  fuelBarFat: {
    backgroundColor: '#ffa726',
  },
  fuelGaugeValue: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: 'bold',
  },
  fuelGaugeValueNegative: {
    color: '#dc143c',
    fontWeight: 'bold',
  },
  fuelBarEmpty: {
    width: 0,
  },
  budgetWarning: {
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(220, 20, 60, 0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(220, 20, 60, 0.3)',
  },
  budgetWarningText: {
    fontSize: 12,
    color: '#dc143c',
    fontWeight: '600',
    textAlign: 'center',
  },
  resetToBaselineButton: {
    marginTop: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  resetToBaselineText: {
    fontSize: 11,
    color: COLORS.muted,
    fontStyle: 'italic',
  },
  locationStatus: {
    marginTop: 10,
    alignItems: 'center',
  },
  locationStatusText: {
    fontSize: 10,
    color: COLORS.muted,
    letterSpacing: 0.3,
  },
  deductButton: {
    backgroundColor: COLORS.accentGreen,
    paddingVertical: 14,
    borderRadius: 8,
    marginVertical: 4,
    width: '100%',
    maxWidth: 240,
    alignItems: 'center',
  },
  deductButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  directionsButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.accentGreen,
    paddingVertical: 14,
    borderRadius: 8,
    marginVertical: 4,
    width: '100%',
    maxWidth: 240,
    alignItems: 'center',
  },
  directionsButtonText: {
    color: COLORS.accentGreen,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Meal History Styles
  mhSection: {
    width: '100%',
    maxWidth: 320,
    marginBottom: 20,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 77, 77, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(0, 121, 107, 0.3)',
    overflow: 'hidden',
  },
  mhHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  mhTitle: {
    fontSize: 10,
    color: COLORS.muted,
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  mhTotalBadge: {
    backgroundColor: 'rgba(0, 121, 107, 0.3)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  mhTotalText: {
    fontSize: 10,
    color: COLORS.accentGreen,
    fontWeight: '600',
  },
  mhItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  mhItemLast: {
    borderBottomWidth: 0,
  },
  mhProteinBadge: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 121, 107, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(0, 121, 107, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  mhProteinValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.accentGreen,
    lineHeight: 18,
  },
  mhProteinUnit: {
    fontSize: 9,
    color: COLORS.muted,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  mhInfo: {
    flex: 1,
  },
  mhName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 2,
  },
  mhMeta: {
    fontSize: 11,
    color: COLORS.muted,
    marginBottom: 1,
  },
  mhMacros: {
    fontSize: 11,
    color: 'rgba(160, 160, 160, 0.7)',
  },
  mhAIBadge: {
    backgroundColor: 'rgba(255, 200, 0, 0.15)',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 0, 0.45)',
  },
  mhAIBadgeText: {
    fontSize: 10,
    color: 'rgba(255, 215, 0, 0.95)',
    fontWeight: '700',
  },
  mhDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  // Home 2×2 Grid
  homeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    width: '100%',
    marginBottom: 30,
  },
  homeCard: {
    width: '47%',
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: COLORS.darkGreen,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 12,
    gap: 6,
  },
  homeCardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
    textAlign: 'center',
  },
  homeCardSub: {
    fontSize: 10,
    color: COLORS.muted,
    textAlign: 'center',
  },
  // Eat at Home CTA buttons
  eatAtHomeActions: {
    width: '100%',
    gap: 12,
    marginTop: 8,
  },
  eatAtHomePrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.accentGreen,
    paddingVertical: 18,
    borderRadius: 12,
    width: '100%',
  },
  eatAtHomePrimaryBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.white,
  },
  eatAtHomeSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'transparent',
    paddingVertical: 16,
    borderRadius: 12,
    width: '100%',
    borderWidth: 1.5,
    borderColor: COLORS.accentGreen,
  },
  eatAtHomeSecondaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.accentGreen,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    backgroundColor: 'rgba(0, 121, 107, 0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 121, 107, 0.3)',
  },
  backButtonText: {
    fontSize: 16,
    color: COLORS.accentGreen,
    fontWeight: '600',
  },
  viewTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 8,
  },
  // Recipe card styles
  highVolumeBadge: {
    backgroundColor: 'rgba(255, 167, 38, 0.12)',
    borderWidth: 1,
    borderColor: '#ffa726',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginBottom: 8,
    alignSelf: 'center',
  },
  highVolumeBadgeText: {
    fontSize: 11,
    color: '#ffa726',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  viewRecipeButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: COLORS.white,
    paddingVertical: 14,
    borderRadius: 8,
    marginVertical: 4,
    width: '100%',
    maxWidth: 240,
    alignItems: 'center',
  },
  viewRecipeButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Recipe filter screen
  filterScreenContainer: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 24,
  },
  filterScreenTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 8,
  },
  filterScreenSubtitle: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 36,
  },
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 40,
    width: '100%',
    maxWidth: 320,
  },
  filterToggle: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    minWidth: '44%',
    alignItems: 'center',
  },
  filterToggleActive: {
    borderColor: COLORS.accentGreen,
    backgroundColor: 'rgba(0, 121, 107, 0.22)',
  },
  filterToggleText: {
    fontSize: 14,
    color: COLORS.lightGray,
    fontWeight: '500',
  },
  filterToggleTextActive: {
    color: COLORS.accentGreen,
    fontWeight: '700',
  },
  // ─── Meal Builder styles ──────────────────────────────────────────────────────
  mbHeading: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 30,
  },
  mbSubheading: {
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
    marginBottom: 28,
  },
  // Unit toggle
  mbUnitToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
    maxWidth: 320,
    marginBottom: 12,
    gap: 10,
  },
  mbUnitToggleLabel: {
    fontSize: 11,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  mbUnitToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  mbUnitBtn: {
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  mbUnitBtnActive: {
    backgroundColor: COLORS.accentGreen,
  },
  mbUnitBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.muted,
  },
  mbUnitBtnTextActive: {
    color: COLORS.white,
  },
  // Hero Dashboard
  mbDashboard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: 'rgba(0, 77, 77, 0.45)',
    borderRadius: 14,
    padding: 18,
    marginBottom: 24,
    borderWidth: 1.5,
  },
  mbDashboardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  mbDashboardTitle: {
    fontSize: 10,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '600',
  },
  mbTargetHitBadge: {
    backgroundColor: 'rgba(0, 200, 83, 0.15)',
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#00c853',
  },
  mbTargetHitText: {
    fontSize: 11,
    color: '#00c853',
    fontWeight: '700',
  },
  mbDashboardRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 4,
  },
  mbDashboardItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  mbDashboardLabel: {
    fontSize: 10,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  mbDashboardCurrent: {
    fontSize: 36,
    fontWeight: '800',
    color: COLORS.white,
    lineHeight: 40,
  },
  mbDashboardUnit: {
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: '500',
    marginTop: -4,
  },
  mbMiniBarTrack: {
    width: '80%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
    marginVertical: 5,
  },
  mbMiniBarFill: {
    height: '100%',
    backgroundColor: COLORS.accentGreen,
    borderRadius: 2,
  },
  mbMiniBarOver: {
    backgroundColor: '#dc143c',
  },
  mbDashboardOver: {
    color: '#dc143c',
  },
  mbDashboardTarget: {
    fontSize: 11,
    color: COLORS.muted,
  },
  mbMatchRingRow: {
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  mbMatchLabel: {
    fontSize: 10,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: -6,
  },
  // Add Custom Food button
  mbAddCustomFoodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 121, 107, 0.45)',
    backgroundColor: 'rgba(0, 121, 107, 0.08)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  mbAddCustomFoodBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.accentGreen,
  },
  // Ingredient sections
  mbSection: {
    width: '100%',
    maxWidth: 320,
    marginBottom: 20,
  },
  mbSectionTitle: {
    fontSize: 10,
    color: COLORS.accentGreen,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: '700',
    marginBottom: 10,
  },
  mbIngredientGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  mbIngredientSquare: {
    width: '47.5%',
    minHeight: 90,
    backgroundColor: 'rgba(0, 77, 77, 0.3)',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 12,
    justifyContent: 'space-between',
  },
  mbIngredientSquareSelected: {
    borderColor: 'rgba(0, 121, 107, 0.6)',
    backgroundColor: 'rgba(0, 77, 77, 0.5)',
  },
  mbIngredientSquareActive: {
    borderColor: COLORS.accentGreen,
    backgroundColor: 'rgba(0, 121, 107, 0.2)',
  },
  mbIngredientName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
    lineHeight: 18,
    marginBottom: 2,
  },
  mbIngredientSub: {
    fontSize: 10,
    color: COLORS.muted,
    marginBottom: 4,
    fontStyle: 'italic',
  },
  mbMacroPreview: {
    marginTop: 6,
  },
  mbMacroContrib: {
    fontSize: 11,
    color: COLORS.accentGreen,
    fontWeight: '600',
  },
  mbMacroBase: {
    fontSize: 10,
    color: COLORS.muted,
  },
  mbGramsLabel: {
    fontSize: 11,
    color: COLORS.accentGreen,
    fontWeight: '700',
    marginTop: 4,
  },
  // Precision stepper with TextInput
  mbStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  mbStepperBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0, 121, 107, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 121, 107, 0.6)',
  },
  mbStepperBtnDisabled: {
    opacity: 0.3,
  },
  mbStepperBtnText: {
    fontSize: 18,
    color: COLORS.white,
    fontWeight: '600',
    lineHeight: 22,
  },
  mbStepperInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.darkBlue,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    minWidth: 56,
    justifyContent: 'center',
  },
  mbStepperInput: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
    minWidth: 32,
    textAlign: 'right',
    padding: 0,
  },
  mbStepperUnit: {
    fontSize: 11,
    color: COLORS.muted,
    marginLeft: 2,
    fontWeight: '500',
  },
  // Suggestion badge
  mbSuggestionBadge: {
    width: '100%',
    maxWidth: 320,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(149, 76, 233, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(149, 76, 233, 0.4)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    gap: 10,
  },
  mbSuggestionIcon: {
    fontSize: 20,
  },
  mbSuggestionInfo: {
    flex: 1,
  },
  mbSuggestionLabel: {
    fontSize: 10,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  mbSuggestionName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#c084fc',
    marginBottom: 2,
  },
  mbSuggestionHint: {
    fontSize: 11,
    color: COLORS.muted,
    fontStyle: 'italic',
  },
  mbSuggestionScore: {
    fontSize: 18,
    fontWeight: '700',
    color: '#c084fc',
  },
  // Finalize button
  mbFinalizeBtn: {
    marginTop: 8,
    width: '100%',
    maxWidth: 320,
    backgroundColor: COLORS.accentGreen,
  },
  mbFinalizeBtnDisabled: {
    opacity: 0.35,
  },
  // ──────────────────────────────────────────────────────────────────────────────
  // Step progress indicator
  stepIndicatorContainer: {
    alignItems: 'center',
    marginBottom: 20,
    gap: 6,
  },
  stepDots: {
    flexDirection: 'row',
    gap: 8,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  stepDotActive: {
    backgroundColor: COLORS.accentGreen,
  },
  stepIndicatorText: {
    fontSize: 11,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});

// ─── Eat Out Map StyleSheet ────────────────────────────────────────────────────
const eoStyles = StyleSheet.create({
  // Custom map markers
  marker: {
    alignItems: 'center',
  },
  markerPin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: COLORS.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  markerInitials: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: -0.5,
  },
  markerBadge: {
    marginTop: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 34,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  markerBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.white,
  },
  // Large Projected Match % indicator
  projMatchWrap: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,77,77,0.45)',
    marginBottom: 12,
  },
  projMatchPct: {
    fontSize: 30,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: -1,
  },
  projMatchPctHit: {
    color: COLORS.accentGreen,
  },
  projMatchLabel: {
    fontSize: 8,
    color: COLORS.muted,
    letterSpacing: 1.1,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  // Macro breakdown row (sits directly in drawer)
  projMacroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginHorizontal: 16,
    marginBottom: 6,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  projMacroCol: {
    flex: 1,
    alignItems: 'center',
  },
  projMacroValue: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.25)',
    marginBottom: 1,
  },
  projMacroValueActive: {
    color: COLORS.white,
  },
  projMacroKey: {
    fontSize: 9,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  projMacroDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  projRemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 8,
  },
  projRemLabel: {
    fontSize: 11,
    color: COLORS.muted,
  },
  projRemMacro: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.lightGray,
  },
  projRemDot: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.2)',
  },
  projOver: {
    color: '#ff6b6b',
  },
  // Item list
  itemList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  itemChecked: {
    backgroundColor: 'rgba(0, 121, 107, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 6,
    marginHorizontal: -6,
    borderBottomWidth: 0,
    marginBottom: StyleSheet.hairlineWidth,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: COLORS.accentGreen,
    borderColor: COLORS.accentGreen,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 2,
  },
  itemMacros: {
    fontSize: 11,
    color: COLORS.muted,
  },
  itemPctBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    marginLeft: 10,
  },
  itemPctText: {
    fontSize: 11,
    fontWeight: '700',
  },
  // Log button
  logBtn: {
    margin: 16,
    marginTop: 8,
    backgroundColor: COLORS.accentGreen,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  logBtnDisabled: {
    backgroundColor: 'rgba(0, 121, 107, 0.3)',
  },
  logBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 0.3,
  },
  // Scout Restaurants CTA (briefing screen)
  scoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 24,
    marginTop: 8,
    marginBottom: 24,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: COLORS.accentGreen,
  },
  scoutBtnDisabled: {
    backgroundColor: 'rgba(0, 121, 107, 0.3)',
  },
  scoutBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 0.3,
  },
});

// ─── Map Marker Component ─────────────────────────────────────────────────────
// Wrapped in memo so React skips re-rendering markers whose props haven't
// changed — eliminates the "shimmer / flicker" caused by parent state updates
// (e.g. drawer open/close, loading state) forcing every marker to re-render.
// tracksViewChanges={false} tells the native layer to stop polling the JS
// view hierarchy for changes once the custom view has been painted.
const RestaurantMarker = memo(({ m, onPress }) => {
  const brand = RESTAURANT_BRAND[m.name] || { color: COLORS.darkGreen, initials: m.name[0] };
  const badgeBg = m.bestPct >= 80 ? COLORS.accentGreen : m.bestPct >= 50 ? '#D4860A' : '#555';
  return (
    <Marker
      coordinate={{ latitude: m.loc.latitude, longitude: m.loc.longitude }}
      onPress={() => onPress(m.name)}
      tracksViewChanges={false}
    >
      <View style={eoStyles.marker}>
        <View style={[eoStyles.markerPin, { backgroundColor: brand.color }]}>
          <Text style={eoStyles.markerInitials}>{brand.initials}</Text>
        </View>
        <View style={[eoStyles.markerBadge, { backgroundColor: badgeBg }]}>
          <Text style={eoStyles.markerBadgeText}>{m.bestPct}%</Text>
        </View>
      </View>
    </Marker>
  );
});

// ─── Restaurant Detail View StyleSheet ────────────────────────────────────────
const detailStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.darkBlue,
  },

  // ── Sticky Header ──────────────────────────────────────────────────────────
  stickyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0d1f1f',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 121, 107, 0.35)',
    gap: 14,
  },
  ringWrap: {
    // shadow used for glow effect when hit
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 0,
    shadowOpacity: 0,
  },
  barsWrap: {
    flex: 1,
    gap: 8,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barLabel: {
    width: 12,
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.muted,
    letterSpacing: 0.5,
  },
  barTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  barValue: {
    width: 56,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.lightGray,
    textAlign: 'right',
  },
  barTarget: {
    fontWeight: '400',
    color: COLORS.muted,
  },
  barValueOver: {
    color: '#ff6b6b',
  },

  // ── Scrollable Menu ────────────────────────────────────────────────────────
  menuScroll: {
    flex: 1,
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.accentGreen,
    letterSpacing: 1.8,
    marginBottom: 10,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    gap: 12,
  },
  menuRowSelected: {
    backgroundColor: 'rgba(0, 121, 107, 0.18)',
    borderColor: 'rgba(0, 121, 107, 0.55)',
  },
  menuRowInfo: {
    flex: 1,
    gap: 5,
  },
  menuRowName: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
  },
  menuRowNameSelected: {
    color: COLORS.white,
  },

  // Macro pill
  macroPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  macroPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  macroPillText: {
    fontSize: 10,
    color: COLORS.muted,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  aiBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 200, 0, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 0, 0.45)',
  },
  aiBadgeText: {
    fontSize: 10,
    color: 'rgba(255, 215, 0, 0.95)',
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // Radio button (Proteins)
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: COLORS.accentGreen,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accentGreen,
  },

  // Checkbox (Bases / Add-ons)
  checkBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxSelected: {
    backgroundColor: COLORS.accentGreen,
    borderColor: COLORS.accentGreen,
  },

  // ── Confirm & Log ──────────────────────────────────────────────────────────
  confirmWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 12,
    backgroundColor: 'rgba(0,26,26,0.95)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  confirmBtn: {
    backgroundColor: COLORS.accentGreen,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  confirmBtnDisabled: {
    backgroundColor: 'rgba(0, 121, 107, 0.3)',
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 0.3,
  },

  // Serving size line below item name
  servingSize: {
    fontSize: 10,
    color: 'rgba(160, 160, 160, 0.7)',
    marginBottom: 3,
  },

  // ── Loading / Error state ──────────────────────────────────────────────────
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.muted,
    fontWeight: '500',
  },
});
