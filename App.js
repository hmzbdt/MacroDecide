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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  calculateMatchPercentage,
  exceedsConstraints,
  generateAnalysis,
} from './src/utils/engine';
import { ALL_ITEMS } from './src/data/menuItems';

const STORAGE_KEY = '@macrodecide_targets';
const HISTORY_KEY = '@macrodecide_history';

const COLORS = {
  darkGreen: '#004d4d',
  darkBlue: '#001a1a',
  accentGreen: '#00796b',
  white: '#ffffff',
  lightGray: '#e0e0e0',
  muted: '#8a8a8a',
};

export default function App() {
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [result, setResult] = useState(null);
  const [noMatch, setNoMatch] = useState(false);
  const [strictMode, setStrictMode] = useState(false);
  const [history, setHistory] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const resultOpacity = useRef(new Animated.Value(0)).current;
  const resultBorderColor = useRef(new Animated.Value(0)).current;
  const resultSlideY = useRef(new Animated.Value(30)).current;

  // Load saved macros and history on startup
  useEffect(() => {
    const loadData = async () => {
      try {
        const [savedTargets, savedHistory] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(HISTORY_KEY),
        ]);
        if (savedTargets) {
          const { protein: p, carbs: c, fat: f } = JSON.parse(savedTargets);
          setProtein(p ?? '');
          setCarbs(c ?? '');
          setFat(f ?? '');
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

  // Auto-save whenever inputs change (skip the initial load)
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ protein, carbs, fat }));
  }, [protein, carbs, fat, loaded]);

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
      protein: parseFloat(protein) || 0,
      carbs: parseFloat(carbs) || 0,
      fat: parseFloat(fat) || 0,
    };

    if (target.protein === 0 && target.carbs === 0 && target.fat === 0) {
      setResult(null);
      setNoMatch(false);
      return;
    }

    const candidates = strictMode
      ? ALL_ITEMS.filter((item) => !exceedsConstraints(target, item.macros))
      : ALL_ITEMS;

    let bestMatch = null;
    let bestPercentage = -1;

    candidates.forEach((item) => {
      const percentage = calculateMatchPercentage(target, item.macros);
      if (percentage > bestPercentage) {
        bestPercentage = percentage;
        bestMatch = item;
      }
    });

    if (bestMatch) {
      const analysis = strictMode
        ? 'Strict match: High protein while staying within your fat/carb limits.'
        : generateAnalysis(target, bestMatch.macros);
      setResult({
        name: bestMatch.name,
        restaurant: bestMatch.restaurant,
        percentage: bestPercentage,
        macros: bestMatch.macros,
        analysis,
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
    setProtein('');
    setCarbs('');
    setFat('');
    setResult(null);
    setNoMatch(false);
    resultOpacity.setValue(0);
    resultSlideY.setValue(30);
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

              <View style={styles.inputContainer}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Protein (g)</Text>
                  <TextInput
                    style={styles.input}
                    value={protein}
                    onChangeText={setProtein}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={COLORS.lightGray}
                    returnKeyType="done"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Carbs (g)</Text>
                  <TextInput
                    style={styles.input}
                    value={carbs}
                    onChangeText={setCarbs}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={COLORS.lightGray}
                    returnKeyType="done"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Fat (g)</Text>
                  <TextInput
                    style={styles.input}
                    value={fat}
                    onChangeText={setFat}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={COLORS.lightGray}
                    returnKeyType="done"
                  />
                </View>
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
                  <Text style={styles.resultRestaurant}>{result.restaurant}</Text>
                  <Text style={styles.resultName}>{result.name}</Text>
                  <Text style={styles.resultPercentage}>{result.percentage}% match</Text>
                  <Text style={styles.resultMacros}>
                    Provides {result.macros.protein}g Protein, {result.macros.carbs}g Carbs, {result.macros.fat}g Fat
                  </Text>
                  <Text style={styles.analysisText}>{result.analysis}</Text>
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
    maxWidth: 300,
    marginBottom: 40,
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
  button: {
    backgroundColor: COLORS.darkGreen,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 8,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '600',
  },
  resultContainer: {
    marginTop: 40,
    alignItems: 'center',
    backgroundColor: COLORS.darkGreen,
    padding: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    width: '100%',
    maxWidth: 300,
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
    marginBottom: 4,
  },
  resultName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 8,
  },
  resultPercentage: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 12,
  },
  resultMacros: {
    fontSize: 13,
    color: COLORS.lightGray,
    textAlign: 'center',
    lineHeight: 18,
  },
  analysisText: {
    fontSize: 12,
    fontStyle: 'italic',
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 17,
  },
  strictModeContainer: {
    width: '100%',
    maxWidth: 300,
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
    maxWidth: 300,
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
  },
  resetButtonText: {
    color: COLORS.lightGray,
    fontSize: 14,
  },
  historySection: {
    marginTop: 32,
    width: '100%',
    maxWidth: 300,
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
});
