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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  calculateMatchPercentage,
  exceedsConstraints,
  generateAnalysis,
  generateConciseAnalysis,
} from './src/utils/engine';
import { ALL_ITEMS } from './src/data/menuItems';
import BarcodeScanner from './src/components/BarcodeScanner';
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

export default function App() {
  // Search inputs (what user is looking for this meal)
  const [searchProtein, setSearchProtein] = useState('');
  const [searchCarbs, setSearchCarbs] = useState('');
  const [searchFat, setSearchFat] = useState('');

  // Remaining daily balance (fuel gauge)
  const [remainingProtein, setRemainingProtein] = useState('70');
  const [remainingCarbs, setRemainingCarbs] = useState('30');
  const [remainingFat, setRemainingFat] = useState('15');

  const [result, setResult] = useState(null);
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
      setResult(null);
      setNoMatch(false);
      return;
    }

    // Filter by strict mode constraints
    const candidates = strictMode
      ? ALL_ITEMS.filter((item) => !exceedsConstraints(target, item.macros))
      : ALL_ITEMS;

    // Calculate match % and attach location for each candidate
    const scoredCandidates = candidates.map((item) => {
      const percentage = calculateMatchPercentage(target, item.macros);
      const locationInfo = nearbyRestaurants.get(item.restaurant);
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

    // The 10-Mile Rule: Filter to only restaurants within Consultant's Radius
    // (if we have location data, otherwise include all)
    const hasLocationData = nearbyRestaurants.size > 0;
    const withinRadiusCandidates = hasLocationData
      ? scoredCandidates.filter((c) => c.withinRadius)
      : scoredCandidates;

    // Sort by Distance first, then by Macro Match %
    // This ensures the 'Best Match' isn't a 20-mile drive away
    const sortedCandidates = withinRadiusCandidates.sort((a, b) => {
      // Primary sort: Distance (closer is better)
      if (a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      // Secondary sort: Match % (higher is better)
      return b.percentage - a.percentage;
    });

    // If no results within radius, fall back to best macro match from all
    const finalCandidates = sortedCandidates.length > 0
      ? sortedCandidates
      : scoredCandidates.sort((a, b) => b.percentage - a.percentage);

    const bestMatch = finalCandidates[0];

    if (bestMatch) {
      const { pros, cons } = strictMode
        ? { pros: ['Within limits'], cons: [] }
        : generateConciseAnalysis(target, bestMatch.macros);

      setResult({
        name: bestMatch.name,
        restaurant: bestMatch.restaurant,
        percentage: bestMatch.percentage,
        macros: bestMatch.macros,
        pros,
        cons,
        location: bestMatch.locationInfo || null,
        outsideRadius: hasLocationData && !bestMatch.withinRadius,
      });
      setNoMatch(false);
      animateResult();

      // Save to history
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
      setResult(null);
      setNoMatch(strictMode);
    }
  };

  const handleReset = () => {
    setSearchProtein('');
    setSearchCarbs('');
    setSearchFat('');
    setResult(null);
    setNoMatch(false);
    setScannedResult(null);
    resultOpacity.setValue(0);
    resultSlideY.setValue(30);
    scannedOpacity.setValue(0);
    scannedSlideY.setValue(30);
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
    setResult(null);
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
    setResult(null);
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
              <Text style={styles.title}>MacroDecide</Text>
              <Text style={styles.subtitle}>Enter your target macros</Text>

              {/* Fuel Gauge */}
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
                    <Text style={styles.budgetWarningText}>⚠️ Budget Exceeded</Text>
                  </View>
                )}
                <TouchableOpacity style={styles.resetToBaselineButton} onPress={resetToBaseline}>
                  <Text style={styles.resetToBaselineText}>Reset to Daily Goals</Text>
                </TouchableOpacity>
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
              </View>

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
                <Text style={styles.buttonText}>Find My Meal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.scanButton}
                onPress={() => setShowScanner(true)}
                activeOpacity={0.6}
              >
                <Text style={styles.scanButtonText}>Scan Barcode</Text>
              </TouchableOpacity>

              {result && (
                <Animated.View
                  style={[
                    styles.resultContainer,
                    {
                      opacity: resultOpacity,
                      transform: [{ translateY: resultSlideY }],
                      borderColor: resultBorderColor.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['rgba(255,255,255,0.2)', COLORS.accentGreen],
                      }),
                    },
                  ]}
                >
                  <Text style={styles.resultLabel}>Best Match</Text>
                  <View style={styles.restaurantRow}>
                    <Text style={styles.resultRestaurant}>{result.restaurant}</Text>
                  </View>
                  {result.location && (
                    <Text style={styles.distanceAwayText}>
                      {formatDistanceLong(result.location.distance)}
                    </Text>
                  )}
                  {result.outsideRadius && (
                    <Text style={styles.outsideRadiusWarning}>
                      Outside {getMaxRadius()}-mile radius
                    </Text>
                  )}
                  <Text style={styles.resultName}>{result.name}</Text>
                  <Text style={styles.resultPercentage}>{result.percentage}% match</Text>
                  <Text style={styles.resultMacros}>
                    {result.macros.protein}g P  ·  {result.macros.carbs}g C  ·  {result.macros.fat}g F
                  </Text>

                  {/* Concise Pros/Cons Analysis */}
                  <View style={styles.prosConsContainer}>
                    {result.pros?.length > 0 && (
                      <Text style={styles.prosText}>
                        <Text style={styles.prosLabel}>Pros: </Text>
                        {result.pros.join(' · ')}
                      </Text>
                    )}
                    {result.cons?.length > 0 && (
                      <Text style={styles.consText}>
                        <Text style={styles.consLabel}>Cons: </Text>
                        {result.cons.join(' · ')}
                      </Text>
                    )}
                  </View>

                  <View style={styles.resultButtonsColumn}>
                    {result.location && (
                      <TouchableOpacity
                        style={styles.directionsButton}
                        onPress={() => openMapsWithDirections(
                          result.location.latitude,
                          result.location.longitude,
                          result.restaurant
                        )}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.directionsButtonText}>Take Me There</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.deductButton}
                      onPress={() => deductMeal(result.macros, result.name, result.restaurant)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.deductButtonText}>Deduct from Today</Text>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              )}

              {scannedResult && (
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
                  <Text style={styles.scannedLabel}>SCANNED ITEM</Text>
                  {scannedResult.brand ? (
                    <Text style={styles.scannedBrand}>{scannedResult.brand}</Text>
                  ) : null}
                  <Text style={styles.scannedName}>{scannedResult.name}</Text>

                  {scannedResult.hasTargets && scannedResult.matchPercentage !== null ? (
                    <Text
                      style={[
                        styles.scannedPercentage,
                        scannedResult.matchPercentage < 50 && styles.scannedPercentageLow,
                        scannedResult.matchPercentage >= 70 && styles.scannedPercentageHigh,
                      ]}
                    >
                      {scannedResult.matchPercentage}% match
                    </Text>
                  ) : (
                    <Text style={styles.noTargetsHint}>
                      Set macro targets above to see match %
                    </Text>
                  )}

                  <Text style={styles.scannedMacros}>
                    {scannedResult.macros.protein}g P  ·  {scannedResult.macros.carbs}g C  ·  {scannedResult.macros.fat}g F
                  </Text>
                  <Text style={styles.servingInfo}>
                    per {scannedResult.isPerServing ? 'serving' : '100g'}
                    {scannedResult.servingSize && scannedResult.servingSize !== '100g'
                      ? ` (${scannedResult.servingSize})`
                      : ''}
                  </Text>

                  {scannedResult.warnings?.length > 0 && (
                    <View style={styles.warningsContainer}>
                      {scannedResult.warnings.map((warning, index) => (
                        <View key={index} style={styles.warningBadge}>
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
                      onPress={() => deductMeal(scannedResult.macros, scannedResult.name, scannedResult.brand || '')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.deductButtonText}>Deduct from Today</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.dismissButton}
                      onPress={dismissScannedResult}
                      activeOpacity={0.6}
                    >
                      <Text style={styles.dismissButtonText}>Dismiss</Text>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              )}

              {noMatch && !result && (
                <View style={styles.noMatchContainer}>
                  <Text style={styles.noMatchText}>
                    No strict matches found. Try increasing your targets or turning off Strict Mode.
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.resetButton}
                onPress={handleReset}
                activeOpacity={0.6}
              >
                <Text style={styles.resetButtonText}>Reset</Text>
              </TouchableOpacity>

              {/* Daily Activity - Undo Feature */}
              {dailyActivity.length > 0 && (
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
              )}

              {history.length > 0 && (
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
    </SafeAreaView>
  );
}

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
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    width: '100%',
    maxWidth: 320,
    minHeight: 280,
  },
  resultLabel: {
    fontSize: 14,
    color: COLORS.lightGray,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
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
  resultPercentage: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 8,
  },
  resultMacros: {
    fontSize: 13,
    color: COLORS.lightGray,
    textAlign: 'center',
    marginBottom: 12,
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
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.accentGreen,
    width: '100%',
    maxWidth: 320,
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
  scannedPercentage: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 12,
  },
  scannedPercentageLow: {
    color: '#ffa726',
  },
  scannedPercentageHigh: {
    color: '#66bb6a',
  },
  scannedMacros: {
    fontSize: 13,
    color: COLORS.lightGray,
    textAlign: 'center',
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
});
