import { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'react-native';
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

const STORAGE_KEY = '@macrodecide_targets';
const HISTORY_KEY = '@macrodecide_history';
const BASELINE_KEY = '@macrodecide_baseline';
const LAST_DATE_KEY = '@macrodecide_last_date';
const ACTIVITY_KEY = '@macrodecide_daily_activity';

const COLORS = {
  darkGreen: '#004d4d',
  darkBlue: '#001a1a',
  accentGreen: '#00796b',
  white: '#ffffff',
  lightGray: '#e0e0e0',
  muted: '#8a8a8a',
};

// ── Sub-view header: home icon (left) + centered title + optional back link ──
function SubViewHeader({ title, onHome, backLabel, onBack }) {
  return (
    <View style={subHeaderStyles.wrapper}>
      <View style={subHeaderStyles.bar}>
        <TouchableOpacity style={subHeaderStyles.homeBtn} onPress={onHome} activeOpacity={0.7}>
          <Text style={subHeaderStyles.homeIcon}>⌂</Text>
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeIcon: {
    fontSize: 18,
    color: '#d0d0d0',
    lineHeight: 22,
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
    width: 36,
  },
  backRow: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backRowText: {
    fontSize: 13,
    color: '#8a8a8a',
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
  const [nearbyRestaurants, setNearbyRestaurants] = useState(new Map());
  const [locationLoading, setLocationLoading] = useState(false);
  const [dailyActivity, setDailyActivity] = useState([]);
  const [resultQuantities, setResultQuantities] = useState([1, 1, 1]);
  const [scannedQuantity, setScannedQuantity] = useState(1);
  const [resultImageErrors, setResultImageErrors] = useState([false, false, false]);
  const [scannedImageError, setScannedImageError] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [showRecipeDetail, setShowRecipeDetail] = useState(false);
  const [recipeFilters, setRecipeFilters] = useState({ spicy: false, vegetarian: false, under30: false, highProtein: false });
  const [cookRecipeStep, setCookRecipeStep] = useState('macros'); // 'macros' | 'filter' | 'results'
  const resultOpacity = useRef(new Animated.Value(0)).current;
  const resultBorderColor = useRef(new Animated.Value(0)).current;
  const resultSlideY = useRef(new Animated.Value(30)).current;
  const scannedOpacity = useRef(new Animated.Value(0)).current;
  const scannedSlideY = useRef(new Animated.Value(30)).current;
  const inputFlash = useRef(new Animated.Value(0)).current;

  // Load saved macros, history, baseline, and check for day reset
  useEffect(() => {
    const loadData = async () => {
      try {
        const [savedTargets, savedHistory, savedBaseline, savedDate, savedActivity] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(HISTORY_KEY),
          AsyncStorage.getItem(BASELINE_KEY),
          AsyncStorage.getItem(LAST_DATE_KEY),
          AsyncStorage.getItem(ACTIVITY_KEY),
        ]);

        // Load baseline (or use defaults)
        const baselineData = savedBaseline
          ? JSON.parse(savedBaseline)
          : { protein: '70', carbs: '30', fat: '15' };
        setBaseline(baselineData);

        // Check if we need to reset for a new day
        const today = new Date().toDateString();
        const isNewDay = savedDate !== today;

        if (isNewDay) {
          // New day: Reset remaining to baseline + clear daily activity
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
          await AsyncStorage.setItem(ACTIVITY_KEY, JSON.stringify([]));
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

  // Fetch location and nearby restaurants on startup
  useEffect(() => {
    const fetchLocation = async () => {
      setLocationLoading(true);
      try {
        const location = await getCurrentLocation();
        if (location) {
          setUserLocation(location);
          const nearby = await findAllNearbyRestaurants(location);
          setNearbyRestaurants(nearby);
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
    if (view === 'cookRecipe') {
      setCookRecipeStep('macros');
      setRecipeFilters({ spicy: false, vegetarian: false, under30: false, highProtein: false });
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

  const deductMeal = (macros, mealName, restaurant = '') => {
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
      restaurant,
      macros: { ...macros },
      time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    };
    const updatedActivity = [activityEntry, ...dailyActivity];
    setDailyActivity(updatedActivity);
    AsyncStorage.setItem(ACTIVITY_KEY, JSON.stringify(updatedActivity));

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
    AsyncStorage.setItem(ACTIVITY_KEY, JSON.stringify(updatedActivity));

    // Flash fuel gauge to show update
    flashInputs();
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

  const viewTitle = currentView === 'eatOut' ? 'Eat Out'
                  : currentView === 'quickSnack' ? 'Quick Snack'
                  : currentView === 'cookRecipe' ? 'Cook a Recipe'
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
      {currentView === 'home' && (
        <View style={styles.locationStatus}>
          {locationLoading ? (
            <Text style={styles.locationStatusText}>Locating nearby restaurants...</Text>
          ) : userLocation ? (
            <Text style={styles.locationStatusText}>
              {nearbyRestaurants.size} restaurants within {getMaxRadius()} miles
            </Text>
          ) : (
            <Text style={styles.locationStatusText}>Enable location for nearby results</Text>
          )}
        </View>
      )}
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

  // Daily activity section
  const renderDailyActivity = () => {
    if (dailyActivity.length === 0) return null;
    return (
      <View style={styles.activitySection}>
        <Text style={styles.activityTitle}>Today's Activity</Text>
        {dailyActivity.map((entry) => (
          <View key={entry.id} style={styles.activityItem}>
            <View style={styles.activityInfo}>
              <Text style={styles.activityName} numberOfLines={1}>
                {entry.restaurant ? `${entry.restaurant} — ` : ''}{entry.name}
              </Text>
              <Text style={styles.activityMeta}>
                {entry.time} · {entry.macros.protein}P/{entry.macros.carbs}C/{entry.macros.fat}F
              </Text>
            </View>
            <TouchableOpacity
              style={styles.undoButton}
              onPress={() => undoDeduction(entry.id)}
              activeOpacity={0.6}
            >
              <Text style={styles.undoButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
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
                  <Text style={styles.title}>MacroDecide</Text>
                  <Text style={styles.subtitle}>What are you looking for?</Text>

                  {renderFuelGauge()}

                  {/* 4-Button Intent Grid */}
                  <View style={styles.intentGrid}>
                    <TouchableOpacity
                      style={styles.intentButton}
                      onPress={() => navigateTo('eatOut')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.intentButtonText}>Eat Out</Text>
                      <Text style={styles.intentButtonSub}>Nearby restaurants</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.intentButton}
                      onPress={() => setShowScanner(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.intentButtonText}>Scan Barcode</Text>
                      <Text style={styles.intentButtonSub}>Check any product</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.intentButton}
                      onPress={() => navigateTo('quickSnack')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.intentButtonText}>Quick Snack</Text>
                      <Text style={styles.intentButtonSub}>Grab & go options</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.intentButton}
                      onPress={() => navigateTo('cookRecipe')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.intentButtonText}>Cook a Recipe</Text>
                      <Text style={styles.intentButtonSub}>Homemade meals</Text>
                    </TouchableOpacity>
                  </View>

                  {renderScannedResult()}
                  {renderDailyActivity()}
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
                    backLabel="← Macros"
                    onBack={() => setCookRecipeStep('macros')}
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

              ) : (
                <>
                  {/* SUB-VIEW: eatOut / quickSnack */}
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
    </SafeAreaView>
  );
}

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
    borderRadius: 8,
    width: 220,
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
    color: 'rgba(138,138,138,0.6)',
  },
  scanButton: {
    marginTop: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.accentGreen,
    paddingVertical: 14,
    borderRadius: 8,
    width: 220,
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
    fontWeight: '600',
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
  // Daily Activity Styles
  activitySection: {
    marginTop: 32,
    width: '100%',
    maxWidth: 320,
    backgroundColor: 'rgba(0, 77, 77, 0.2)',
    borderRadius: 12,
    padding: 16,
  },
  activityTitle: {
    fontSize: 12,
    color: COLORS.lightGray,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    fontWeight: '600',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  activityInfo: {
    flex: 1,
  },
  activityName: {
    fontSize: 13,
    color: COLORS.white,
    marginBottom: 2,
  },
  activityMeta: {
    fontSize: 11,
    color: COLORS.muted,
  },
  undoButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  undoButtonText: {
    fontSize: 14,
    color: '#ff6b6b',
    fontWeight: '600',
  },
  // Intent Grid Styles
  intentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    width: '100%',
    maxWidth: 320,
    marginBottom: 30,
  },
  intentButton: {
    width: '47%',
    aspectRatio: 1.3,
    borderRadius: 12,
    backgroundColor: COLORS.darkGreen,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  intentButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 4,
  },
  intentButtonSub: {
    fontSize: 11,
    color: COLORS.muted,
    textAlign: 'center',
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
