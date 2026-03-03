import { SPOONACULAR_API_KEY } from '../config';
import { RestaurantMenuItem } from '../types/restaurant';

const BASE_URL = 'https://api.spoonacular.com';

function classifyItem(name: string): { category: RestaurantMenuItem['category']; isMandatory: boolean } {
  const lower = name.toLowerCase();
  const addonKw = ['fries', 'chips', 'sauce', 'dip', 'drink', 'soda', 'dessert',
    'cookie', 'shake', 'juice', 'side', 'extra', 'topping', 'guac'];
  const baseKw  = ['rice', 'greens', 'lettuce', 'tortilla', 'noodles', 'pasta', 'flatbread'];
  if (addonKw.some((k) => lower.includes(k))) return { category: 'addon',   isMandatory: false };
  if (baseKw.some((k)  => lower.includes(k))) return { category: 'base',    isMandatory: false };
  return { category: 'protein', isMandatory: true };
}

function findNutrient(nutrients: any[], name: string): number {
  const hit = nutrients.find((n: any) => n.name?.toLowerCase() === name.toLowerCase());
  return Math.max(0, Math.round(hit?.amount ?? 0));
}

/**
 * Searches Spoonacular for menu items from a restaurant, then fetches full
 * nutrition details for the top 5 matches.
 *
 * Two-step: search → per-item nutrition detail (parallel fetches, capped at 5
 * to minimise free-tier API-point consumption).
 *
 * Returns an empty array when no key is configured or the requests fail.
 */
export async function fetchSpoonacularMenu(
  restaurantName: string,
): Promise<RestaurantMenuItem[]> {
  if (!SPOONACULAR_API_KEY) return [];

  try {
    // Step 1: search
    const searchRes = await fetch(
      `${BASE_URL}/food/menuItems/search` +
      `?query=${encodeURIComponent(restaurantName)}` +
      `&number=15&apiKey=${SPOONACULAR_API_KEY}`,
    );
    if (!searchRes.ok) return [];

    const searchData = await searchRes.json();
    const items: any[] = searchData.menuItems ?? [];

    // Prefer items whose restaurantChain matches; fall back to all results
    const nameLower = restaurantName.toLowerCase();
    const filtered = items
      .filter((i: any) =>
        !i.restaurantChain || i.restaurantChain.toLowerCase().includes(nameLower),
      )
      .slice(0, 5);

    if (filtered.length === 0) return [];

    // Step 2: nutrition detail for each (parallel)
    const details = await Promise.all(
      filtered.map((item: any) =>
        fetch(`${BASE_URL}/food/menuItems/${item.id}?apiKey=${SPOONACULAR_API_KEY}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    );

    const results: RestaurantMenuItem[] = [];
    details.forEach((detail: any, idx: number) => {
      if (!detail) return;
      const nutrients: any[] = detail.nutrition?.nutrients ?? [];
      const { category, isMandatory } = classifyItem(detail.title ?? filtered[idx].title ?? '');
      results.push({
        id:       `spoon_${restaurantName.replace(/\s+/g, '_').toLowerCase()}_${idx}`,
        name:     detail.title ?? filtered[idx].title ?? `Item ${idx + 1}`,
        category,
        isMandatory,
        protein:  findNutrient(nutrients, 'protein'),
        carbs:    findNutrient(nutrients, 'carbohydrates'),
        fat:      findNutrient(nutrients, 'fat'),
        isAIResult:     false,
        servingWeightG: detail.servings?.size ?? undefined,
        dataSource:     'spoonacular' as const,
      });
    });

    return results;
  } catch (err) {
    console.warn('[Spoonacular] Request failed:', err);
    return [];
  }
}
