import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';

// Consultant's Radius: 10 miles max search distance
const MAX_SEARCH_RADIUS_MILES = 10;

// Mock restaurant locations (in production, replace with Google Places API)
const RESTAURANT_CHAINS = {
  'Chick-fil-A': {
    placeId: 'mock_chick_fil_a',
    icon: 'restaurant',
  },
  'Wingstop': {
    placeId: 'mock_wingstop',
    icon: 'restaurant',
  },
  'Chipotle': {
    placeId: 'mock_chipotle',
    icon: 'restaurant',
  },
  'Whataburger': {
    placeId: 'mock_whataburger',
    icon: 'restaurant',
    // Common in Texas/Houston area - generates closer distances
    regionalBoost: true,
  },
};

/**
 * Request location permissions
 * @returns {Promise<boolean>} Whether permission was granted
 */
export async function requestLocationPermission() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Error requesting location permission:', error);
    return false;
  }
}

/**
 * Check if location permission is already granted
 * @returns {Promise<boolean>}
 */
export async function checkLocationPermission() {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    return false;
  }
}

/**
 * Get user's current location silently (no ZIP code prompt)
 * Uses GPS/network location without any user input
 * @returns {Promise<{latitude: number, longitude: number} | null>}
 */
export async function getCurrentLocation() {
  try {
    const hasPermission = await checkLocationPermission();
    if (!hasPermission) {
      const granted = await requestLocationPermission();
      if (!granted) return null;
    }

    // Silent GPS: Get location without prompting for ZIP
    // Using Balanced accuracy for quick, battery-efficient results
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      maximumAge: 60000, // Accept cached location up to 1 minute old
    });

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  } catch (error) {
    console.error('Error getting location:', error);
    return null;
  }
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 * @returns {number} Distance in miles
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3959; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Generate mock nearby restaurant location
 * Respects the 10-mile Consultant's Radius
 * In production, replace this with Google Places API call
 */
function generateMockLocation(userLat, userLon, restaurantName) {
  // Check if this chain has regional boost (e.g., Whataburger in Houston)
  const chain = RESTAURANT_CHAINS[restaurantName];
  const hasRegionalBoost = chain?.regionalBoost || false;

  // Generate random distance within the 10-mile radius
  // Weighted toward closer distances (more realistic)
  // Regional chains get even closer distances
  const randomFactor = Math.random();
  const maxDistance = hasRegionalBoost ? 4 : MAX_SEARCH_RADIUS_MILES; // Whataburger within 4 miles
  const minDistance = hasRegionalBoost ? 0.2 : 0.3;
  const distanceMiles = minDistance + (randomFactor * randomFactor) * (maxDistance - minDistance);
  const bearing = Math.random() * 2 * Math.PI;

  // Convert miles to degrees (roughly)
  const latOffset = (distanceMiles / 69) * Math.cos(bearing);
  const lonOffset = (distanceMiles / (69 * Math.cos(toRad(userLat)))) * Math.sin(bearing);

  const mockLat = userLat + latOffset;
  const mockLon = userLon + lonOffset;

  // Generate a mock address
  const streetNum = Math.floor(100 + Math.random() * 9900);
  const streets = ['Main St', 'Oak Ave', 'Park Blvd', 'Commerce Dr', 'Market St'];
  const street = streets[Math.floor(Math.random() * streets.length)];

  const distance = calculateDistance(userLat, userLon, mockLat, mockLon);

  return {
    name: restaurantName,
    latitude: mockLat,
    longitude: mockLon,
    address: `${streetNum} ${street}`,
    distance: distance,
    withinRadius: distance <= MAX_SEARCH_RADIUS_MILES,
    placeId: RESTAURANT_CHAINS[restaurantName]?.placeId || 'mock_place',
  };
}

/**
 * Find nearest restaurant of given chain
 * @param {string} restaurantName - Name of the restaurant chain
 * @param {{latitude: number, longitude: number}} userLocation
 * @returns {Promise<object | null>} Nearest location info
 */
export async function findNearestRestaurant(restaurantName, userLocation) {
  if (!userLocation) return null;

  // In production, replace with actual Google Places API call:
  // const response = await fetch(
  //   `https://maps.googleapis.com/maps/api/place/nearbysearch/json?` +
  //   `location=${userLocation.latitude},${userLocation.longitude}` +
  //   `&radius=8000&keyword=${encodeURIComponent(restaurantName)}` +
  //   `&key=${GOOGLE_PLACES_API_KEY}`
  // );
  // const data = await response.json();
  // return data.results[0];

  // For now, use mock data
  return generateMockLocation(
    userLocation.latitude,
    userLocation.longitude,
    restaurantName
  );
}

/**
 * Find all nearby restaurants for supported chains
 * @param {{latitude: number, longitude: number}} userLocation
 * @returns {Promise<Map<string, object>>} Map of restaurant name to location info
 */
export async function findAllNearbyRestaurants(userLocation) {
  if (!userLocation) return new Map();

  const results = new Map();

  for (const restaurantName of Object.keys(RESTAURANT_CHAINS)) {
    const location = await findNearestRestaurant(restaurantName, userLocation);
    if (location) {
      results.set(restaurantName, location);
    }
  }

  return results;
}

/**
 * Open maps app with directions to location
 * @param {number} destLat - Destination latitude
 * @param {number} destLon - Destination longitude
 * @param {string} label - Location label/name
 */
export function openMapsWithDirections(destLat, destLon, label) {
  const encodedLabel = encodeURIComponent(label);

  // Use platform-specific URL schemes
  const url = Platform.select({
    ios: `maps://app?daddr=${destLat},${destLon}&q=${encodedLabel}`,
    android: `google.navigation:q=${destLat},${destLon}`,
    default: `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLon}`,
  });

  // Fallback to Google Maps web URL if native app isn't available
  Linking.canOpenURL(url)
    .then((supported) => {
      if (supported) {
        Linking.openURL(url);
      } else {
        // Fallback to Google Maps web
        Linking.openURL(
          `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLon}&destination_place_id=${encodedLabel}`
        );
      }
    })
    .catch((err) => console.error('Error opening maps:', err));
}

/**
 * Format distance for display (short format for badges)
 * @param {number} miles
 * @returns {string}
 */
export function formatDistance(miles) {
  if (miles < 0.1) {
    return 'Nearby';
  } else if (miles < 10) {
    return `${miles.toFixed(1)} mi`;
  } else {
    return `${Math.round(miles)} mi`;
  }
}

/**
 * Format distance for display (long format: "X miles away")
 * @param {number} miles
 * @returns {string}
 */
export function formatDistanceLong(miles) {
  if (miles < 0.1) {
    return 'Just around the corner';
  } else if (miles < 1) {
    return `${miles.toFixed(1)} miles away`;
  } else if (miles < 10) {
    return `${miles.toFixed(1)} miles away`;
  } else {
    return `${Math.round(miles)} miles away`;
  }
}

/**
 * Check if distance is within Consultant's Radius
 * @param {number} miles
 * @returns {boolean}
 */
export function isWithinRadius(miles) {
  return miles <= MAX_SEARCH_RADIUS_MILES;
}

/**
 * Get the max search radius
 * @returns {number}
 */
export function getMaxRadius() {
  return MAX_SEARCH_RADIUS_MILES;
}
