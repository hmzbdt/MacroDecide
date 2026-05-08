import { GEMINI_API_KEY } from '../config';
import { RestaurantMenuItem } from '../types/restaurant';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// ── Restaurant-level prompt ────────────────────────────────────────────────────
// Generates up to 10 categorised menu items with a self-reported confidence score.
const RESTAURANT_PROMPT = (restaurantName: string) => `\
You are a nutrition database expert. Estimate the top menu items and macros for "${restaurantName}".

Return ONLY a valid JSON array (no markdown, no explanation). Each element must have exactly these fields:
- id: string (snake_case, e.g. "mcdonalds_p_big_mac")
- name: string (the menu item name)
- category: "protein" | "base" | "addon"
- isMandatory: boolean (true only for "protein" items)
- protein: number (grams, integer, median estimate)
- carbs: number (grams, integer, median estimate)
- fat: number (grams, integer, median estimate)
- confidence: number (integer 0–100; your certainty about these macro values)

Rules:
- Return up to 10 items: 4–5 "protein" items, 2–3 "base" items if applicable, 2–3 "addon" items
- Estimate the standard serving size for each item and derive macros from that serving
- If uncertain, provide a plausible range and return the median value
- confidence 90+: matches known published data; 70–89: well-known item, likely accurate; <70: estimated from category
- Never return all-zero macros for any single item
- Omit "base" items entirely for restaurants without customisable bowls, burritos, or salads
`;

// ── Per-item prompt ────────────────────────────────────────────────────────────
// Used by estimateMacrosFromDescription to backfill items with all-zero macros.
const ITEM_PROMPT = (itemName: string, restaurantName?: string) => `\
Analyze this menu item: "${itemName}"${restaurantName ? ` from "${restaurantName}"` : ''}.
Estimate the standard serving size and provide protein, carbs, and fat in grams.
If uncertain, provide a plausible range but return the median value.

Return ONLY a valid JSON object (no markdown, no explanation) with exactly these fields:
- protein: number (grams, integer, median estimate)
- carbs: number (grams, integer, median estimate)
- fat: number (grams, integer, median estimate)
- confidence: number (integer 0–100; your certainty about these values)
`;

/**
 * Calls the Gemini API to generate up to 10 menu items for a restaurant
 * that is not in the local verified database or any external API.
 *
 * Every returned item is marked isAIResult: true and carries a confidence score.
 * Returns an empty array (silently) if no API key is configured.
 */
export async function estimateRestaurantMenu(
  restaurantName: string,
): Promise<RestaurantMenuItem[]> {
  if (!GEMINI_API_KEY) return [];

  const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: RESTAURANT_PROMPT(restaurantName) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 1500,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  const rawText: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
  const parsed: any[] = JSON.parse(rawText);

  return parsed.map((item) => ({
    ...item,
    protein:    Math.max(0, Math.round(item.protein ?? 0)),
    carbs:      Math.max(0, Math.round(item.carbs   ?? 0)),
    fat:        Math.max(0, Math.round(item.fat     ?? 0)),
    confidence: item.confidence != null
      ? Math.max(0, Math.min(100, Math.round(item.confidence)))
      : undefined,
    isAIResult: true,
    dataSource: 'ai' as const,
  }));
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function msDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls Gemini to estimate a restaurant menu, then dispatches each item
 * one-by-one via `onItem` with a 200 ms gap to create a streaming-like effect.
 *
 * The `signal` parameter allows the caller to abort via AbortController:
 *   - The underlying fetch is cancelled immediately.
 *   - The per-item dispatch loop halts.
 *
 * Already-existing item names are NOT filtered here — callers should dedup.
 * Returns silently (no throw) when the signal is aborted or no key is set.
 */
export async function estimateRestaurantMenuStreamed(
  restaurantName: string,
  onItem: (item: RestaurantMenuItem) => void,
  signal: AbortSignal,
): Promise<void> {
  if (!GEMINI_API_KEY || signal.aborted) return;

  let response: Response;
  try {
    response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: RESTAURANT_PROMPT(restaurantName) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
          maxOutputTokens: 1500,
        },
      }),
    });
  } catch (_) {
    // AbortError or network failure — exit silently
    return;
  }

  if (!response.ok || signal.aborted) return;

  const json = await response.json();
  if (signal.aborted) return;

  const rawText: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
  let parsed: any[] = [];
  try { parsed = JSON.parse(rawText); } catch { return; }

  for (const item of parsed) {
    if (signal.aborted) return;
    onItem({
      ...item,
      protein:    Math.max(0, Math.round(item.protein ?? 0)),
      carbs:      Math.max(0, Math.round(item.carbs   ?? 0)),
      fat:        Math.max(0, Math.round(item.fat     ?? 0)),
      confidence: item.confidence != null
        ? Math.max(0, Math.min(100, Math.round(item.confidence)))
        : undefined,
      isAIResult: true,
      dataSource: 'ai' as const,
    });
    await msDelay(200);
  }
}

/**
 * Estimates macros for a single named menu item using a focused per-item prompt.
 *
 * Used by the MenuDataEngine to backfill items whose P/C/F are all zero.
 * Returns null if no API key is configured or the request fails.
 */
export async function estimateMacrosFromDescription(
  itemName: string,
  restaurantName?: string,
): Promise<{ protein: number; carbs: number; fat: number; confidence?: number } | null> {
  if (!GEMINI_API_KEY) return null;

  try {
    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: ITEM_PROMPT(itemName, restaurantName) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
          maxOutputTokens: 128,
        },
      }),
    });

    if (!response.ok) return null;

    const json = await response.json();
    const rawText: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    const parsed = JSON.parse(rawText);

    return {
      protein:    Math.max(0, Math.round(parsed.protein    ?? 0)),
      carbs:      Math.max(0, Math.round(parsed.carbs      ?? 0)),
      fat:        Math.max(0, Math.round(parsed.fat        ?? 0)),
      confidence: parsed.confidence != null
        ? Math.max(0, Math.min(100, Math.round(parsed.confidence)))
        : undefined,
    };
  } catch (_) {
    return null;
  }
}
