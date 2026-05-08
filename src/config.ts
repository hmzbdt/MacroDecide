// ─── API Keys (read from .env via EXPO_PUBLIC_* prefix) ──────────────────────
// Never hardcode secrets here. Set them in your .env file at the project root.

/** Gemini: AI macro estimation for restaurants not in the local database. */
export const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_KEY ?? '';

/** Google Places (New): live nearby restaurant search. */
export const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? '';

/** FatSecret: OAuth 2.0 client credentials for foods.search. */
export const FATSECRET_CLIENT_ID     = process.env.EXPO_PUBLIC_FATSECRET_CLIENT_ID     ?? '';
export const FATSECRET_CLIENT_SECRET = process.env.EXPO_PUBLIC_FATSECRET_CLIENT_SECRET ?? '';

/** Nutritionix: verified restaurant brand nutrition (secondary source). */
export const NUTRITIONIX_APP_ID  = process.env.EXPO_PUBLIC_NUTRITIONIX_APP_ID  ?? '';
export const NUTRITIONIX_APP_KEY = process.env.EXPO_PUBLIC_NUTRITIONIX_APP_KEY ?? '';

/** Spoonacular: tertiary menu-item nutrition source. */
export const SPOONACULAR_API_KEY = process.env.EXPO_PUBLIC_SPOONACULAR_API_KEY ?? '';
