import { GEMINI_API_KEY } from '../config';
import { RestaurantMenuItem } from '../types/restaurant';

// ── Mock Mode ─────────────────────────────────────────────────────────────────
// Set to true to bypass the Gemini API entirely and return dummy data.
const MOCK_SCAN_ENABLED = false;

const MOCK_MENU_ITEMS: RestaurantMenuItem[] = [
  { id: 'mock_1', name: 'Grilled Chicken Sandwich', category: 'protein', isMandatory: true,  protein: 42, carbs: 38, fat: 12, isAIResult: true, dataSource: 'ocr' },
  { id: 'mock_2', name: 'Classic Beef Burger',      category: 'protein', isMandatory: true,  protein: 35, carbs: 44, fat: 22, isAIResult: true, dataSource: 'ocr' },
  { id: 'mock_3', name: 'Caesar Salad',             category: 'base',    isMandatory: false, protein: 12, carbs: 14, fat: 18, isAIResult: true, dataSource: 'ocr' },
  { id: 'mock_4', name: 'Steamed White Rice',       category: 'base',    isMandatory: false, protein:  4, carbs: 45, fat:  1, isAIResult: true, dataSource: 'ocr' },
  { id: 'mock_5', name: 'French Fries',             category: 'addon',   isMandatory: false, protein:  4, carbs: 48, fat: 17, isAIResult: true, dataSource: 'ocr' },
  { id: 'mock_6', name: 'BBQ Sauce',                category: 'addon',   isMandatory: false, protein:  0, carbs: 12, fat:  0, isAIResult: true, dataSource: 'ocr' },
];
// ──────────────────────────────────────────────────────────────────────────────

const GEMINI_MODEL      = 'gemini-1.5-flash';
// Stable v1 endpoint — do NOT switch to v1beta; it returns 404 for this model
const GEMINI_VISION_URL =
  `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent`;

/** Thrown when the Gemini API returns HTTP 429 (quota exhausted). */
export class MenuVisionRateLimitError extends Error {
  readonly code = 'rate_limit' as const;
  constructor() { super('rate_limit'); }
}

const JSON_FORMAT_INSTRUCTION =
  'OUTPUT ONLY VALID JSON. Do not include markdown formatting or backticks like ```json. ' +
  'Return a raw JSON array of objects — nothing else before or after the array.';

function buildPrompt(restaurantName: string, existingItemNames: string[]): string {
  const dedup = existingItemNames.length > 0
    ? ` Do not include these already-captured items: [${existingItemNames.map((n) => `"${n}"`).join(', ')}].`
    : '';

  return (
    'You are a nutrition assistant. Extract the names and estimated macros for every item on this menu. ' +
    'Format as a clean JSON array. If the image is blurry, do your best — do not return an error.\n\n' +
    `Context: the user is at ${restaurantName}.${dedup}\n\n` +
    JSON_FORMAT_INSTRUCTION + '\n' +
    'Each element must have exactly these keys: name, protein, carbs, fat, description.'
  );
}

/** Strip ```json ... ``` or ``` ... ``` fences Gemini sometimes wraps around output. */
function extractJsonText(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  return raw.trim();
}

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

export async function analyzeMenuImage(
  base64Image: string,
  restaurantName: string,
  existingItemNames: string[] = [],
): Promise<RestaurantMenuItem[]> {
  if (!GEMINI_API_KEY) {
    console.log('[MenuVision] No API key configured — skipping scan.');
    return [];
  }
  if (!base64Image) {
    console.log('[MenuVision] Image data is null/undefined — aborting.');
    return [];
  }

  if (MOCK_SCAN_ENABLED) {
    console.log('[MenuVision] MOCK MODE — returning dummy data, no API call made.');
    return MOCK_MENU_ITEMS;
  }

  console.log('[MenuVision] Using Model:', GEMINI_MODEL);
  console.log('[MenuVision] Sending image size:', base64Image.length, 'chars');

  const prompt = buildPrompt(restaurantName, existingItemNames);

  let response: Response;
  try {
    response = await fetch(`${GEMINI_VISION_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: 'image/jpeg', data: base64Image } },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2000,
        },
      }),
    });
  } catch (err) {
    console.log('FULL_API_ERROR:', JSON.stringify(err, null, 2));
    console.log('[MenuVision] Network error:', err);
    return [];
  }

  // Log the full status for every non-200 so we can see exact error bodies
  if (!response.ok) {
    let errorBody = '';
    try { errorBody = await response.text(); } catch (_) {}
    console.log(`FULL_API_ERROR: HTTP ${response.status} ${response.statusText}`);
    console.log('FULL_API_ERROR body:', errorBody);

    if (response.status === 429) {
      // Log the raw quota error — popup suppressed during debug so actual message is visible
      console.log('[MenuVision] 429 — quota exhausted. Throwing MenuVisionRateLimitError.');
      throw new MenuVisionRateLimitError();
    }
    return [];
  }

  const json = await response.json();
  const rawText: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  console.log('[MenuVision] Raw response preview:', rawText.slice(0, 200));

  if (!rawText) {
    console.log('[MenuVision] Empty response from model.');
    return [];
  }

  const cleanText = extractJsonText(rawText);
  let parsed: any[] = [];
  try {
    parsed = JSON.parse(cleanText);
  } catch (e) {
    console.log('[MenuVision] JSON parse failed. Cleaned text:', cleanText.slice(0, 200));
    return [];
  }

  if (!Array.isArray(parsed)) {
    console.log('[MenuVision] Parsed result is not an array:', typeof parsed);
    return [];
  }

  console.log(`[MenuVision] Parsed ${parsed.length} items from response.`);
  const slug = restaurantName.replace(/\W+/g, '_').toLowerCase();
  return parsed
    .filter((item) => item && typeof item.name === 'string' && item.name.trim())
    .map((item, idx) => {
      const { category, isMandatory } = classifyItem(item.name);
      const p = Math.max(0, Math.round(parseFloat(item.protein) || 0));
      const c = Math.max(0, Math.round(parseFloat(item.carbs)   || 0));
      const f = Math.max(0, Math.round(parseFloat(item.fat)     || 0));
      return {
        id:         `ocr_${slug}_${idx}_${Date.now()}`,
        name:       item.name.trim(),
        category,
        isMandatory,
        protein:    p,
        carbs:      c,
        fat:        f,
        isAIResult: true,
        dataSource: 'ocr' as const,
      };
    })
    // Purge items with physically impossible macros for a single serving
    .filter((item) => item.protein <= 300 && item.carbs <= 400 && item.fat <= 200);
}
