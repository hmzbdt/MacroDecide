import { NUTRITIONIX_APP_ID, NUTRITIONIX_APP_KEY } from '../config';
import { RestaurantMenuItem } from '../types/restaurant';

const BASE_URL = 'https://trackapi.nutritionix.com/v2';

/**
 * Heuristic category classifier based on item name.
 * Protein = main dishes; Base = customizable starters; Addon = sides/extras.
 */
function classifyItem(name: string): { category: RestaurantMenuItem['category']; isMandatory: boolean } {
  const lower = name.toLowerCase();

  const addonKw = ['fries', 'chips', 'sauce', 'dip', 'drink', 'soda', 'coffee', 'dessert',
    'cookie', 'shake', 'juice', 'water', 'side', 'extra', 'add', 'topping',
    'guac', 'cheese', 'bacon', 'onion', 'sour cream', 'ranch'];
  const baseKw  = ['rice', 'greens', 'lettuce', 'tortilla', 'noodles', 'pasta',
    'flatbread', 'bread', 'supergreens', 'quinoa'];

  if (addonKw.some((k) => lower.includes(k))) return { category: 'addon',   isMandatory: false };
  if (baseKw.some((k)  => lower.includes(k))) return { category: 'base',    isMandatory: false };
  return { category: 'protein', isMandatory: true };
}

/**
 * Searches the Nutritionix branded-food endpoint for items from a specific
 * restaurant chain and maps them to RestaurantMenuItem format.
 *
 * Priority in the data chain: Nutritionix → Spoonacular → Gemini AI.
 *
 * Returns an empty array when no credentials are configured or the request fails.
 * Up to 10 items are returned, sorted by relevance (API-side).
 */
export async function fetchNutritionixMenu(
  restaurantName: string,
): Promise<RestaurantMenuItem[]> {
  if (!NUTRITIONIX_APP_ID || !NUTRITIONIX_APP_KEY) return [];

  try {
    const response = await fetch(
      `${BASE_URL}/search/instant` +
      `?query=${encodeURIComponent(restaurantName)}` +
      `&branded=true&self=false&common=false&detailed=true`,
      {
        headers: {
          'x-app-id':   NUTRITIONIX_APP_ID,
          'x-app-key':  NUTRITIONIX_APP_KEY,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) return [];

    const data = await response.json();
    const branded: any[] = data.branded ?? [];

    // Filter to items whose brand_name loosely matches the restaurant
    const nameLower = restaurantName.toLowerCase();
    const matching = branded
      .filter((item: any) => item.brand_name?.toLowerCase().includes(nameLower))
      .slice(0, 10);

    return matching.map((item: any, idx: number) => {
      const { category, isMandatory } = classifyItem(item.food_name ?? '');
      return {
        id:       `nix_${restaurantName.replace(/\s+/g, '_').toLowerCase()}_${idx}`,
        name:     item.food_name ?? `Item ${idx + 1}`,
        category,
        isMandatory,
        protein:  Math.max(0, Math.round(item.nf_protein           ?? 0)),
        carbs:    Math.max(0, Math.round(item.nf_total_carbohydrate ?? 0)),
        fat:      Math.max(0, Math.round(item.nf_total_fat         ?? 0)),
        isAIResult:     false,
        servingWeightG: item.serving_weight_grams ?? undefined,
        dataSource:     'nutritionix' as const,
      };
    });
  } catch (err) {
    console.warn('[Nutritionix] Request failed:', err);
    return [];
  }
}
