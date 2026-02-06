import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const VIEWFINDER_SIZE = SCREEN_WIDTH * 0.7;

const COLORS = {
  darkGreen: '#004d4d',
  darkBlue: '#001a1a',
  accentGreen: '#00796b',
  white: '#ffffff',
  lightGray: '#e0e0e0',
  muted: '#8a8a8a',
  error: '#ff6b6b',
  warning: '#ffa726',
};

export default function BarcodeScanner({ onBarcodeScanned, onClose }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  // Animate scanning line
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(scanLineAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [scanLineAnim]);

  const handleBarCodeScanned = async ({ type, data }) => {
    if (scanned || loading) return;

    setScanned(true);
    setLoading(true);
    setError(null);

    try {
      // Fetch from Open Food Facts API
      const response = await fetch(
        `https://world.openfoodfacts.org/api/v0/product/${data}.json`
      );
      const json = await response.json();

      if (json.status === 1 && json.product) {
        const product = json.product;
        const nutriments = product.nutriments || {};

        // Try to get per 100g values first, then per serving
        const protein = nutriments['proteins_100g'] ?? nutriments['proteins_serving'] ?? 0;
        const carbs = nutriments['carbohydrates_100g'] ?? nutriments['carbohydrates_serving'] ?? 0;
        const fat = nutriments['fat_100g'] ?? nutriments['fat_serving'] ?? 0;

        // Get serving size info if available
        const servingSize = product.serving_size || '100g';
        const isPerServing = !nutriments['proteins_100g'] && nutriments['proteins_serving'];

        onBarcodeScanned({
          barcode: data,
          name: product.product_name || product.product_name_en || 'Unknown Product',
          brand: product.brands || '',
          macros: {
            protein: Math.round(protein * 10) / 10,
            carbs: Math.round(carbs * 10) / 10,
            fat: Math.round(fat * 10) / 10,
          },
          servingSize,
          isPerServing,
          imageUrl: product.image_front_small_url,
        });
      } else {
        setError('Product not found in database');
        setLoading(false);
        // Allow rescan after delay
        setTimeout(() => {
          setScanned(false);
          setError(null);
        }, 2500);
      }
    } catch (err) {
      setError('Network error. Please try again.');
      setLoading(false);
      setTimeout(() => {
        setScanned(false);
        setError(null);
      }, 2500);
    }
  };

  // Permission handling
  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.accentGreen} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionCard}>
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            To scan barcodes, MacroDecide needs access to your camera.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const scanLineTranslate = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, VIEWFINDER_SIZE - 4],
  });

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      >
        {/* Dark overlay with transparent viewfinder */}
        <View style={styles.overlay}>
          <View style={styles.overlayTop} />
          <View style={styles.overlayMiddle}>
            <View style={styles.overlaySide} />
            <View style={styles.viewfinder}>
              {/* Corner brackets */}
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />

              {/* Animated scan line */}
              {!loading && !error && (
                <Animated.View
                  style={[
                    styles.scanLine,
                    { transform: [{ translateY: scanLineTranslate }] },
                  ]}
                />
              )}

              {/* Loading indicator */}
              {loading && (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator size="large" color={COLORS.accentGreen} />
                  <Text style={styles.loadingText}>Looking up product...</Text>
                </View>
              )}

              {/* Error message */}
              {error && (
                <View style={styles.errorOverlay}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}
            </View>
            <View style={styles.overlaySide} />
          </View>
          <View style={styles.overlayBottom}>
            <Text style={styles.instructionText}>
              {loading ? 'Fetching nutrition data...' : 'Position barcode within the frame'}
            </Text>
          </View>
        </View>

        {/* Close button */}
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Cancel</Text>
        </TouchableOpacity>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.darkBlue,
    justifyContent: 'center',
    alignItems: 'center',
  },
  camera: {
    flex: 1,
    width: '100%',
  },
  overlay: {
    flex: 1,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0, 26, 26, 0.7)',
  },
  overlayMiddle: {
    flexDirection: 'row',
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0, 26, 26, 0.7)',
  },
  viewfinder: {
    width: VIEWFINDER_SIZE,
    height: VIEWFINDER_SIZE,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0, 26, 26, 0.7)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 30,
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: COLORS.accentGreen,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  scanLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 2,
    backgroundColor: COLORS.accentGreen,
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  instructionText: {
    color: COLORS.lightGray,
    fontSize: 14,
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0, 77, 77, 0.8)',
    borderRadius: 8,
  },
  closeButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '500',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 26, 26, 0.8)',
  },
  loadingText: {
    color: COLORS.lightGray,
    fontSize: 14,
    marginTop: 12,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 26, 26, 0.8)',
  },
  errorText: {
    color: COLORS.error,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  permissionCard: {
    backgroundColor: COLORS.darkGreen,
    padding: 30,
    borderRadius: 16,
    alignItems: 'center',
    marginHorizontal: 30,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 12,
  },
  permissionText: {
    fontSize: 14,
    color: COLORS.lightGray,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  permissionButton: {
    backgroundColor: COLORS.accentGreen,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    marginBottom: 12,
  },
  permissionButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  cancelButtonText: {
    color: COLORS.muted,
    fontSize: 14,
  },
});
