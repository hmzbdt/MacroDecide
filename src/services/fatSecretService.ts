import { FATSECRET_CLIENT_ID, FATSECRET_CLIENT_SECRET } from '../config';
import { RestaurantMenuItem } from '../types/restaurant';

const TOKEN_URL  = 'https://oauth.fatsecret.com/connect/token';
const SEARCH_URL = 'https://platform.fatsecret.com/rest/foods/search/v1';

// ── Classifier ────────────────────────────────────────────────────────────────
function classifyItem(name: string): { category: RestaurantMenuItem['category']; isMandatory: boolean } {
  const lower = name.toLowerCase();
  const addonKw = ['fries', 'chips', 'sauce', 'dip', 'drink', 'soda', 'coffee', 'dessert',
    'cookie', 'shake', 'juice', 'water', 'side', 'extra', 'add', 'topping',
    'guac', 'cheese', 'bacon', 'onion', 'sour cream', 'ranch'];
  const baseKw  = ['rice', 'greens', 'lettuce', 'tortilla', 'noodles', 'pasta',
    'flatbread', 'bread', 'supergreens', 'quinoa', 'beans', 'pinto', 'black bean'];
  if (addonKw.some((k) => lower.includes(k))) return { category: 'addon',   isMandatory: false };
  if (baseKw.some((k)  => lower.includes(k))) return { category: 'base',    isMandatory: false };
  return { category: 'protein', isMandatory: true };
}

// ── Parse macros from food_description ───────────────────────────────────────
// FatSecret format: "Per <label> - Calories: Ykcal | Fat: Zg | Carbs: Wg | Protein: Vg"
function parseMacros(description: string): {
  protein: number; carbs: number; fat: number;
  servingWeightG: number | null;
  servingLabel: string;
  normalizedPer100g: boolean;
  highServingSize: boolean;
} | null {
  const proteinM = description.match(/Protein:\s*([\d.]+)\s*g/i);
  const carbsM   = description.match(/Carbs:\s*([\d.]+)\s*g/i);
  const fatM     = description.match(/Fat:\s*([\d.]+)\s*g/i);
  if (!proteinM && !carbsM && !fatM) return null;

  // Extract serving label from "Per <label> -" prefix
  const servingMatch = description.match(/^Per\s+(.+?)\s*-/i);
  const rawLabel = servingMatch ? servingMatch[1].trim() : '1 serving';

  // Numeric-only weight label, e.g. "2044g" → 2044
  const weightOnlyMatch = rawLabel.match(/^([\d.]+)\s*g$/i);
  const servingWeightG  = weightOnlyMatch ? parseFloat(weightOnlyMatch[1]) : null;

  let p = Math.max(0, parseFloat(proteinM?.[1] ?? '0'));
  let c = Math.max(0, parseFloat(carbsM?.[1]   ?? '0'));
  let f = Math.max(0, parseFloat(fatM?.[1]     ?? '0'));

  let servingLabel      = rawLabel;
  let normalizedPer100g = false;
  let highServingSize   = false;

  // Oversized serving (>500g) → divide to per-100g so numbers stay realistic
  if (servingWeightG && servingWeightG > 500) {
    const factor = 100 / servingWeightG;
    p *= factor;
    c *= factor;
    f *= factor;
    normalizedPer100g = true;
    servingLabel      = '100g';
    console.log(`[FatSecret] Normalized oversized serving (${servingWeightG}g → 100g): P${Math.round(p)} C${Math.round(c)} F${Math.round(f)}`);
  }

  // Macro Ceiling: if any single macro still exceeds 150g after the above normalization,
  // the serving data is unreliable — divide by 10 as a per-100g safety estimate.
  if (p > 150 || c > 150 || f > 150) {
    p /= 10;
    c /= 10;
    f /= 10;
    highServingSize   = true;
    normalizedPer100g = true;
    servingLabel      = '100g est.';
    console.log(`[FatSecret] Macro ceiling applied (>150g single macro) → P${Math.round(p)} C${Math.round(c)} F${Math.round(f)}`);
  }

  return {
    protein:          Math.max(0, Math.round(p)),
    carbs:            Math.max(0, Math.round(c)),
    fat:              Math.max(0, Math.round(f)),
    servingWeightG,
    servingLabel,
    normalizedPer100g,
    highServingSize,
  };
}

// ── Token cache ───────────────────────────────────────────────────────────────
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

/** Clears the in-memory token so the next getAccessToken() call does a fresh fetch. */
function invalidateToken(): void {
  cachedToken    = null;
  tokenExpiresAt = 0;
}

async function getAccessToken(forceRefresh = false): Promise<string | null> {
  if (!FATSECRET_CLIENT_ID || !FATSECRET_CLIENT_SECRET) return null;

  // Return cached token unless it's expired, about to expire, or force-refresh requested
  if (!forceRefresh && cachedToken && Date.now() < tokenExpiresAt - 30_000) {
    return cachedToken;
  }

  // Always clear before re-fetching so stale values don't leak
  invalidateToken();

  const credentials = btoa(`${FATSECRET_CLIENT_ID}:${FATSECRET_CLIENT_SECRET}`);
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: 'grant_type=client_credentials&scope=basic',
    });
  } catch (err) {
    console.log('[FatSecret] Token network error:', err);
    return null;
  }

  if (!response.ok) {
    console.log(`[FatSecret] Token Error: HTTP ${response.status} — ${response.statusText}`);
    return null;
  }

  const data = await response.json();
  if (!data.access_token) {
    console.log('[FatSecret] Token Error: response missing access_token —', JSON.stringify(data));
    return null;
  }

  console.log('[FatSecret] Token OK — expires in', data.expires_in ?? '?', 's');
  cachedToken    = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in ?? 86400) * 1000;
  return cachedToken;
}

// ── Internal: single search with brand-filter query ───────────────────────────
/**
 * Calls foods.search/v1 using the FatSecret brand-filter query syntax:
 *   brand:"Restaurant Name" [optional suffix]
 *
 * This tells FatSecret to restrict results to that specific brand rather than
 * doing a general keyword search.  If the API returns 401 the token is cleared
 * and one automatic retry is performed.
 *
 * All responses are logged so you can see Daily Limit / Auth / empty-result
 * issues directly in the console.
 */
async function searchFatSecret(
  brandName: string,
  suffix: string,
  limit = 8,
  isRetry = false,
  useBrandSyntax = true,  // false = plain keyword search (no brand: prefix)
): Promise<RestaurantMenuItem[]> {
  const token = await getAccessToken();
  if (!token) return [];

  // Brand syntax: brand:"Name" suffix  — targets that specific brand
  // Keyword syntax: "Name suffix"      — broader, catches differently indexed items
  const expression = useBrandSyntax
    ? (suffix ? `brand:"${brandName}" ${suffix}` : `brand:"${brandName}"`)
    : (suffix ? `${brandName} ${suffix}` : brandName);

  const params = new URLSearchParams({
    search_expression: expression,
    format:            'json',
    max_results:       String(limit * 3), // over-fetch; we post-filter by brand
    page_number:       '0',
  });

  // Confirm the header format before sending (space between Bearer and token is required)
  const authHeader = `Bearer ${token}`;
  console.log(`[FatSecret] Searching — expression: "${expression}" | Auth: "Bearer <${token.slice(0, 8)}...>"`);

  let response: Response;
  try {
    response = await fetch(`${SEARCH_URL}?${params.toString()}`, {
      headers: { 'Authorization': authHeader },
    });
  } catch (err) {
    console.log('[FatSecret] Search network error:', err);
    return [];
  }

  // ── 401: stale/invalid token → force refresh + single retry ──────────────
  if (response.status === 401) {
    const body = await response.text().catch(() => '');
    console.log(`[FatSecret] Error 401 (Invalid Token) — body: ${body}`);
    if (!isRetry) {
      console.log('[FatSecret] Clearing token cache and retrying with fresh credentials…');
      invalidateToken();
      await getAccessToken(true); // force immediate re-fetch
      return searchFatSecret(brandName, suffix, limit, true /* isRetry */, useBrandSyntax);
    }
    console.log('[FatSecret] Retry also failed with 401 — aborting.');
    return [];
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.log(`[FatSecret] Error ${response.status}: ${response.statusText} — body: ${body}`);
    return [];
  }

  const data = await response.json();

  // ── RAW RESPONSE LOG — shows exact JSON so you can spot Daily Limit / Auth issues ──
  console.log('API_DEBUG_RAW_RESPONSE:', JSON.stringify(data));

  if (data.error) {
    console.log(`[FatSecret] API Error: code=${data.error.code} — message="${data.error.message}"`);
    return [];
  }

  const rawFoods: any[] = Array.isArray(data?.foods?.food)
    ? data.foods.food
    : data?.foods?.food
      ? [data.foods.food]   // single result comes as object, not array
      : [];

  console.log(`[FatSecret] "${expression}" → ${rawFoods.length} raw results`);

  // ── Strict brand-only filter ──────────────────────────────────────────────
  // Hard rule: food_type must be 'Brand' AND brand_name must partially match
  // the restaurant name. Generic items (hot dogs, frozen meals, etc.) are
  // discarded unconditionally — no fallback.
  const filterLower = brandName.toLowerCase();
  const brandMatches = rawFoods.filter((f: any) => {
    if (f.food_type !== 'Brand') return false;
    const brand = (f.brand_name ?? '').toLowerCase();
    // Accept if either side contains the other (handles abbreviations like "Cane's" ↔ "Raising Cane's")
    return brand.includes(filterLower) || filterLower.includes(brand);
  });

  const matching = brandMatches; // Generic items never used

  console.log(
    `[FatSecret] "${expression}" → ${brandMatches.length} verified brand items` +
    ` (${rawFoods.length - brandMatches.length} discarded — wrong brand or Generic)`,
  );

  const results: RestaurantMenuItem[] = [];
  matching.slice(0, limit).forEach((food: any, idx: number) => {
    const macros = parseMacros(food.food_description ?? '');
    if (!macros) return;
    const { category, isMandatory } = classifyItem(food.food_name ?? '');
    results.push({
      id:               `fs_${brandName.replace(/\W+/g, '_').toLowerCase()}_${suffix || 'base'}_${idx}`,
      name:             food.food_name ?? `Item ${idx + 1}`,
      category,
      isMandatory,
      protein:          macros.protein,
      carbs:            macros.carbs,
      fat:              macros.fat,
      servingWeightG:   macros.servingWeightG ?? undefined,
      servingLabel:     macros.servingLabel,
      normalizedPer100g: macros.normalizedPer100g,
      highServingSize:  macros.highServingSize,
      isAIResult:       false,
      dataSource:       'fatsecret' as const,
    });
  });

  console.log(`[FatSecret] "${expression}" → ${results.length} parsed items`);
  return results;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Single-query FatSecret search — used by menuDataEngine as a fallback step.
 * For the live detail view, prefer fetchFatSecretMenuSmart.
 */
export async function fetchFatSecretMenu(
  restaurantName: string,
): Promise<RestaurantMenuItem[]> {
  if (!FATSECRET_CLIENT_ID || !FATSECRET_CLIENT_SECRET) return [];
  try {
    return await searchFatSecret(restaurantName, '', 12);
  } catch (err) {
    console.log('[FatSecret] fetchFatSecretMenu failed:', err);
    return [];
  }
}

// Keywords that earn priority ordering for Chick-fil-A
const CHICKFILA_PRIORITY_KW = ['nuggets', 'grilled', 'sandwich'];

/**
 * Smart parallel search — runs 3 simultaneous FatSecret queries using the
 * brand:"Name" filter syntax for precise results:
 *   brand:"Name" Chicken  |  brand:"Name" Beef  |  brand:"Name" Salad
 *
 * Results are merged and deduplicated by lower-cased name.
 * For Chick-fil-A, items containing 'Nuggets', 'Grilled', or 'Sandwich'
 * are sorted to the top.
 */
export async function fetchFatSecretMenuSmart(
  restaurantName: string,
): Promise<RestaurantMenuItem[]> {
  if (!FATSECRET_CLIENT_ID || !FATSECRET_CLIENT_SECRET) return [];

  console.log(`[FatSecret] Smart search starting for: "${restaurantName}"`);

  try {
    const [chickenItems, beefItems, saladItems] = await Promise.all([
      searchFatSecret(restaurantName, 'Chicken').catch(() => [] as RestaurantMenuItem[]),
      searchFatSecret(restaurantName, 'Beef').catch(   () => [] as RestaurantMenuItem[]),
      searchFatSecret(restaurantName, 'Salad').catch(  () => [] as RestaurantMenuItem[]),
    ]);

    // Merge + dedup by lower-cased name
    const seen  = new Set<string>();
    const merged: RestaurantMenuItem[] = [];
    for (const item of [...chickenItems, ...beefItems, ...saladItems]) {
      const key = item.name.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }

    console.log(`[FatSecret] Smart search complete for "${restaurantName}" — ${merged.length} unique items`);

    // ── No keyword fallback — if brand:"Name" returns nothing, return [] so the
    // caller can show the "Scan menu" empty state instead of unrelated Generic items.

    // Chick-fil-A: float Nuggets / Grilled / Sandwich to the top
    if (restaurantName.toLowerCase().includes('chick')) {
      merged.sort((a, b) => {
        const aP = CHICKFILA_PRIORITY_KW.some((k) => a.name.toLowerCase().includes(k)) ? 1 : 0;
        const bP = CHICKFILA_PRIORITY_KW.some((k) => b.name.toLowerCase().includes(k)) ? 1 : 0;
        return bP - aP;
      });
    }

    return merged;
  } catch (err) {
    console.log('[FatSecret] fetchFatSecretMenuSmart failed:', err);
    return [];
  }
}
