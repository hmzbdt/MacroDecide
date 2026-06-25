import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';

const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? '';

// Consultant's Radius: 10 miles max search distance
const MAX_SEARCH_RADIUS_MILES = 10;

// Legacy Places API (for single-chain lookups)
const PLACES_URL = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';

// Places API (New) — searchNearby endpoint
const PLACES_NEW_NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';

// Default center: Spring, TX (used as fallback when GPS unavailable)
const SPRING_TX = { latitude: 29.2130, longitude: -95.4010 };

// 5-mile feed radius in metres
const FEED_RADIUS_METRES = 8046.72;

const SUPPORTED_CHAINS = ['Chick-fil-A', 'Wingstop', 'Chipotle', 'Whataburger'];

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
export function calculateDistance(lat1, lon1, lat2, lon2) {
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
 * Search for restaurants near the user using the Google Places API (New).
 *
 * Uses `places:searchNearby` with `includedPrimaryTypes: ['restaurant']`.
 * Falls back to Spring, TX (29.2130, -95.4010) when location is null.
 * Radius: 5 miles (8046.72 m).
 *
 * @param {{latitude: number, longitude: number} | null} userLocation
 * @returns {Promise<Array<{name: string, placeId: string, distance: number, address: string}>>}
 */
export async function searchNearbyRestaurantsLive(userLocation, radiusMetres = FEED_RADIUS_METRES) {
  if (!GOOGLE_PLACES_API_KEY) return [];

  const usingFallback = !userLocation;
  const center = userLocation ?? SPRING_TX;
  const { latitude, longitude } = center;

  console.log(
    `[Places] searchNearbyRestaurantsLive — center: (${latitude}, ${longitude})` +
    (usingFallback ? ' [FALLBACK: Spring, TX 29.2130, -95.4010]' : ' [GPS]') +
    ` radius: ${radiusMetres}m (${(radiusMetres / 1609.34).toFixed(1)} mi)`,
  );

  try {
    const response = await fetch(PLACES_NEW_NEARBY_URL, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'X-Goog-Api-Key':  GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': 'places.displayName,places.location,places.formattedAddress,places.id',
      },
      body: JSON.stringify({
        includedPrimaryTypes: ['restaurant'],
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude, longitude },
            radius: radiusMetres,
          },
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.log(`[Places] Error ${response.status}: ${errText}`);
      return [];
    }

    const data = await response.json();
    const places = data.places ?? [];
    console.log(`[Places] OK — ${places.length} restaurants found near (${latitude}, ${longitude})`);

    return places.map((place) => {
      const lat  = place.location?.latitude  ?? latitude;
      const lng  = place.location?.longitude ?? longitude;
      const dist = calculateDistance(latitude, longitude, lat, lng);
      return {
        name:      place.displayName?.text ?? 'Restaurant',
        placeId:   place.id ?? '',
        distance:  dist,
        address:   place.formattedAddress ?? '',
        latitude:  lat,
        longitude: lng,
      };
    });
  } catch (err) {
    console.error('[ProximityService] searchNearbyRestaurantsLive failed:', err);
    return [];
  }
}

/**
 * Find up to `maxResults` nearby storefronts for a restaurant chain.
 * Uses rankby=distance so the API returns every location sorted by true
 * proximity — popular chains like Wingstop are never filtered by a radius cap.
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
      return [];
    }
  }

  return [];
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

  for (const restaurantName of SUPPORTED_CHAINS) {
    const locations = await findNearbyRestaurants(restaurantName, userLocation);
    if (locations.length > 0) {
      nearest.set(restaurantName, locations[0]);
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
 */
export function openMapsWithDirections(destLat, destLon, label) {
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
