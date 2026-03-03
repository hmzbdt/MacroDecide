import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';
import { GOOGLE_PLACES_API_KEY } from '../config';

// Consultant's Radius: 10 miles max search distance
const MAX_SEARCH_RADIUS_MILES = 10;

const PLACES_URL = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';

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
    isMock: true,
  };
}

/**
 * Find up to `maxResults` nearby storefronts for a restaurant chain.
 *
 * When GOOGLE_PLACES_API_KEY is set: uses rankby=distance (no radius) so the
 * API returns every location sorted by true proximity — popular chains like
 * Wingstop will never be filtered out by a radius cap.  Multiple storefronts
 * of the same brand are all returned so users see each unique location on the map.
 *
 * Falls back to a single mock location when no key is configured.
 *
 * @param {string} restaurantName
 * @param {{latitude: number, longitude: number}} userLocation
 * @param {number} maxResults - Maximum storefronts to return (default 3)
 * @returns {Promise<object[]>} Array of location objects (may be empty)
 */
export async function findNearbyRestaurants(restaurantName, userLocation, maxResults = 3) {
  if (!userLocation) return [];

  if (GOOGLE_PLACES_API_KEY) {
    try {
      const { latitude, longitude } = userLocation;
      const url =
        `${PLACES_URL}` +
        `?location=${latitude},${longitude}` +
        `&rankby=distance` +
        `&keyword=${encodeURIComponent(restaurantName)}` +
        `&key=${GOOGLE_PLACES_API_KEY}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.results && data.results.length > 0) {
        return data.results.slice(0, maxResults).map((place) => {
          const lat = place.geometry.location.lat;
          const lng = place.geometry.location.lng;
          const distance = calculateDistance(latitude, longitude, lat, lng);
          return {
            name: restaurantName,
            latitude: lat,
            longitude: lng,
            address: place.vicinity || '',
            distance,
            withinRadius: distance <= MAX_SEARCH_RADIUS_MILES,
            placeId: place.place_id,
            isMock: false,
          };
        });
      }
      return [];
    } catch (error) {
      console.error('[ProximityService] Places API error:', error);
      // Fall through to mock on network failure
    }
  }

  // No API key — single mock location per brand
  return [generateMockLocation(userLocation.latitude, userLocation.longitude, restaurantName)];
}

/**
 * Legacy single-result wrapper kept for backward compatibility.
 * Returns the nearest location for a chain, or null if none found.
 */
export async function findNearestRestaurant(restaurantName, userLocation) {
  const results = await findNearbyRestaurants(restaurantName, userLocation, 1);
  return results[0] ?? null;
}

/**
 * Find all nearby restaurants for all supported chains.
 *
 * Returns two structures:
 *  - `nearest`: Map<name, singleLocation> — used by the scoring engine to get
 *    the closest storefront distance per brand.
 *  - `all`: Array<{name, loc}> — flat list of every storefront found; used by
 *    the map to render a separate marker for each unique location.
 *
 * @param {{latitude: number, longitude: number}} userLocation
 * @returns {Promise<{ nearest: Map<string, object>, all: Array<{name: string, loc: object}> }>}
 */
export async function findAllNearbyRestaurants(userLocation) {
  if (!userLocation) return { nearest: new Map(), all: [] };

  const nearest = new Map();
  const all = [];

  for (const restaurantName of Object.keys(RESTAURANT_CHAINS)) {
    const locations = await findNearbyRestaurants(restaurantName, userLocation);
    if (locations.length > 0) {
      nearest.set(restaurantName, locations[0]); // nearest per brand for scoring
      for (const loc of locations) {
        all.push({ name: restaurantName, loc });
      }
    }
  }

  return { nearest, all };
}

/**
 * Open maps app with directions to location
 * @param {number} destLat - Destination latitude
 * @param {number} destLon - Destination longitude
 * @param {string} label - Location label/name
 * @param {boolean} isMock - Whether coordinates are mock data
 */
export function openMapsWithDirections(destLat, destLon, label, isMock = false) {
  // If mock data, search for the restaurant "near me" instead of
  // navigating to a random coordinate
  if (isMock) {
    const searchQuery = encodeURIComponent(`${label} near me`);
    const url = Platform.select({
      ios: `http://maps.apple.com/?q=${searchQuery}`,
      android: `geo:0,0?q=${searchQuery}`,
      default: `https://www.google.com/maps/search/?api=1&query=${searchQuery}`,
    });

    console.log('[MacroDecide] Navigation URL (search):', url);

    Linking.openURL(url).catch((err) => {
      const fallback = `https://www.google.com/maps/search/?api=1&query=${searchQuery}`;
      console.log('[MacroDecide] Fallback URL:', fallback);
      Linking.openURL(fallback);
    });
    return;
  }

  // Real coordinates — navigate directly
  const encodedLabel = encodeURIComponent(label);
  const url = Platform.select({
    ios: `http://maps.apple.com/?daddr=${destLat},${destLon}&q=${encodedLabel}`,
    android: `google.navigation:q=${destLat},${destLon}`,
    default: `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLon}`,
  });

  console.log('[MacroDecide] Navigation URL (directions):', url);

  Linking.canOpenURL(url)
    .then((supported) => {
      if (supported) {
        Linking.openURL(url);
      } else {
        const fallback = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLon}`;
        console.log('[MacroDecide] Fallback URL:', fallback);
        Linking.openURL(fallback);
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
