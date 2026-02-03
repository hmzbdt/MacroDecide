import { useState } from 'react';
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
} from 'react-native';
import { calculateMatchPercentage } from './src/utils/engine';
import { CHICK_FIL_A } from './src/data/menuItems';

const COLORS = {
  darkGreen: '#004d4d',
  darkBlue: '#001a1a',
  white: '#ffffff',
  lightGray: '#e0e0e0',
};

export default function App() {
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [result, setResult] = useState(null);

  const handleFindMeal = () => {
    const target = {
      protein: parseFloat(protein) || 0,
      carbs: parseFloat(carbs) || 0,
      fat: parseFloat(fat) || 0,
    };

    if (target.protein === 0 && target.carbs === 0 && target.fat === 0) {
      setResult(null);
      return;
    }

    let bestMatch = null;
    let bestPercentage = -1;

    CHICK_FIL_A.forEach((item) => {
      const percentage = calculateMatchPercentage(target, item.macros);
      if (percentage > bestPercentage) {
        bestPercentage = percentage;
        bestMatch = item;
      }
    });

    if (bestMatch) {
      setResult({
        name: bestMatch.name,
        percentage: bestPercentage,
        macros: bestMatch.macros,
      });
    }
  };

  const handleReset = () => {
    setProtein('');
    setCarbs('');
    setFat('');
    setResult(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
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

            <TouchableOpacity
              style={styles.button}
              onPress={handleFindMeal}
              activeOpacity={0.6}
            >
              <Text style={styles.buttonText}>Find My Meal</Text>
            </TouchableOpacity>

            {result && (
              <View style={styles.resultContainer}>
                <Text style={styles.resultLabel}>Best Match</Text>
                <Text style={styles.resultName}>{result.name}</Text>
                <Text style={styles.resultPercentage}>{result.percentage}% match</Text>
                <Text style={styles.resultMacros}>
                  Provides {result.macros.protein}g Protein, {result.macros.carbs}g Carbs, {result.macros.fat}g Fat
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
          </View>
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
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
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
    borderWidth: 1,
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
  resetButton: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  resetButtonText: {
    color: COLORS.lightGray,
    fontSize: 14,
  },
});
