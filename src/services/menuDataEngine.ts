import AsyncStorage from '@react-native-async-storage/async-storage';

import { RESTAURANT_DB } from '../data/restaurantDB';
import { estimateRestaurantMenu, estimateMacrosFromDescription } from './aiMacroEstimator';
import { fetchFatSecretMenuSmart } from './fatSecretService';
import { fetchNutritionixMenu } from './nutritionixService';
import { fetchSpoonacularMenu } from './spoonacularService';
import { RestaurantMenu, RestaurantMenuItem } from '../types/restaurant';

const AI_CACHE_PREFIX = 'ai_menu_v1_';

// ── Helpers ────────────────────────────────────────────────────────────────────

async function cacheItems(key: string, items: RestaurantMenuItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(items));
  } catch (_) {
    // Non-fatal
  }
}

/**
 * Backfills any item whose protein, carbs, AND fat are all zero by running the
 * single-item Gemini prompt. Items with at least one non-zero macro are left
 * untouched — e.g. zero-protein Apple Slices is a valid entry.
 *
 * Preserved fields: id, name, category, isMandatory, servingWeightG, dataSource.
 * Overrides: protein, carbs, fat, confidence (set to 60 = "estimated backfill"), isAIResult = true.
 */
async function fillMissingMacros(
  items: RestaurantMenuItem[],
  restaurantName: string,
): Promise<RestaurantMenuItem[]> {
  const result: RestaurantMenuItem[] = [];
  for (const item of items) {
    if (item.protein === 0 && item.carbs === 0 && item.fat === 0) {
      const estimated = await estimateMacrosFromDescription(item.name, restaurantName);
      if (estimated) {
        result.push({
          ...item,
          protein:    estimated.protein,
          carbs:      estimated.carbs,
          fat:        estimated.fat,
          confidence: estimated.confidence ?? 60,
          isAIResult: true,
        });
        continue;
      }
    }
    result.push(item);
  }
  return result;
}

// ── Main entry point ───────────────────────────────────────────────────────────

/**
 * Resolution order (first non-empty result wins):
 *
 *  1. Verified local TypeScript DB  — instant, zero network.
 *  2. AsyncStorage AI cache         — instant after first external fetch.
 *  3. FatSecret foods.search        — OAuth 2.0 client credentials; real brand nutrition.
 *  4. Nutritionix branded search    — secondary verified nutrition source.
 *  5. Spoonacular menu-item search  — tertiary nutrition source.
 *  6. Gemini AI estimation          — last resort; flags every item isAIResult: true.
 *
 * At steps 1, 3, 4, 5, and 6: any item with all-zero macros is individually
 * backfilled via estimateMacrosFromDescription and flagged isAIResult: true.
 *
 * Items from steps 3–6 are written to AsyncStorage so the next call is instant.
 */
export async function getRestaurantMenu(
  restaurantName: string,
): Promise<RestaurantMenu> {
  const cacheKey = `${AI_CACHE_PREFIX}${restaurantName}`;

  // ── 1. Verified local DB ─────────────────────────────────────────────────────
  const verified = RESTAURANT_DB[restaurantName];
  if (verified && verified.length > 0) {
    const items = await fillMissingMacros(verified, restaurantName);
    return { restaurantName, items };
  }

  // ── 2. AsyncStorage cache ────────────────────────────────────────────────────
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const items: RestaurantMenuItem[] = JSON.parse(cached);
      if (items.length > 0) return { restaurantName, items };
    }
  } catch (_) {
    // Cache miss is non-fatal — continue to live sources
  }

  // ── 3. FatSecret ─────────────────────────────────────────────────────────────
  const fsItems = await fetchFatSecretMenuSmart(restaurantName);
  if (fsItems.length > 0) {
    const items = await fillMissingMacros(fsItems, restaurantName);
    await cacheItems(cacheKey, items);
    return { restaurantName, items };
  }

  // ── 4. Nutritionix ───────────────────────────────────────────────────────────
  const nixItems = await fetchNutritionixMenu(restaurantName);
  if (nixItems.length > 0) {
    const items = await fillMissingMacros(nixItems, restaurantName);
    await cacheItems(cacheKey, items);
    return { restaurantName, items };
  }

  // ── 5. Spoonacular ───────────────────────────────────────────────────────────
  const spoonItems = await fetchSpoonacularMenu(restaurantName);
  if (spoonItems.length > 0) {
    const items = await fillMissingMacros(spoonItems, restaurantName);
    await cacheItems(cacheKey, items);
    return { restaurantName, items };
  }

  // ── 6. Gemini AI estimation ──────────────────────────────────────────────────
  const rawItems = await estimateRestaurantMenu(restaurantName);
  const aiItems  = rawItems.length > 0
    ? await fillMissingMacros(rawItems, restaurantName)
    : rawItems;

  if (aiItems.length > 0) await cacheItems(cacheKey, aiItems);
  return { restaurantName, items: aiItems };
}

/**
 * Clears the cached menu for a restaurant so the next call re-fetches live data.
 */
export async function clearAIMenuCache(restaurantName: string): Promise<void> {
  await AsyncStorage.removeItem(`${AI_CACHE_PREFIX}${restaurantName}`);
}
