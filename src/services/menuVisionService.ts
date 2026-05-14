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

// v1beta is required — v1 returns 404 for these models
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// 3.1-pro-preview is tried first; 2.5-pro is the stable fallback if 3.1 is unavailable
const GEMINI_MODELS   = ['gemini-3.1-pro-preview', 'gemini-2.5-pro'] as const;
type GeminiModel = typeof GEMINI_MODELS[number];

function modelUrl(model: GeminiModel): string {
  return `${GEMINI_API_BASE}/${model}:generateContent`;
}

/** Thrown when the Gemini API returns HTTP 429 (quota exhausted). */
export class MenuVisionRateLimitError extends Error {
  readonly code = 'rate_limit' as const;
  constructor() { super('rate_limit'); }
}

const JSON_FORMAT_INSTRUCTION =
  'Return ONLY a raw JSON object. ' +
  'Do not include markdown, backticks, code fences, or any introductory or closing text. ' +
  'Your entire response must be a single valid JSON object with exactly one top-level key "items" ' +
  'whose value is an array. ' +
  'Limit to the 5-10 most nutritionally significant items (prioritise proteins and mains). ' +
  'Each array element must have exactly these four keys: ' +
  'name (string), protein (number, grams), carbs (number, grams), fat (number, grams).';

function buildPrompt(restaurantName: string, existingItemNames: string[]): string {
  const dedup = existingItemNames.length > 0
    ? ` Do not include these already-captured items: [${existingItemNames.map((n) => `"${n}"`).join(', ')}].`
    : '';

  return (
    'You are a nutrition assistant. Analyse this menu image and estimate the macros for the key items. ' +
    'If the image is blurry, do your best — do not return an error.\n\n' +
    `Context: the user is at ${restaurantName}.${dedup}\n\n` +
    JSON_FORMAT_INSTRUCTION
  );
}

/**
 * Strip conversational fluff and markdown fences, then slice to the outermost
 * JSON boundary so a chatty model can't break the parser.
 * Strategy: fence-strip → find first { and last } → fallback to [ … ].
 */
function sanitizeJsonText(raw: string): string {
  // 1. Remove markdown code fences if present
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text   = (fenced ? fenced[1] : raw).trim();

  // 2. Extract outermost object { … }
  const objStart = text.indexOf('{');
  const objEnd   = text.lastIndexOf('}');
  if (objStart !== -1 && objEnd > objStart) {
    return text.slice(objStart, objEnd + 1);
  }

  // 3. Fallback: extract outermost array [ … ]
  const arrStart = text.indexOf('[');
  const arrEnd   = text.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd > arrStart) {
    return text.slice(arrStart, arrEnd + 1);
  }

  return text;
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

  console.log('[MenuVision] Sending image size:', base64Image.length, 'chars');

  const prompt   = buildPrompt(restaurantName, existingItemNames);
  const reqBody  = JSON.stringify({
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: 'image/jpeg', data: base64Image } },
      ],
    }],
    generationConfig: {
      temperature:        0.1,
      maxOutputTokens:    4096,   // 4 k gives headroom; 5-10 items never exceeds ~800 tokens
      response_mime_type: 'application/json',
    },
  });

  let response: Response | null = null;
  for (const model of GEMINI_MODELS) {
    console.log('[MenuVision] Trying model:', model);
    try {
      response = await fetch(`${modelUrl(model)}?key=${GEMINI_API_KEY}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    reqBody,
      });
    } catch (err) {
      console.log('FULL_API_ERROR:', JSON.stringify(err, null, 2));
      console.log('[MenuVision] Network error:', err);
      return [];
    }

    if (response.status === 404) {
      let body = '';
      try { body = await response.text(); } catch (_) {}
      console.log(`[MenuVision] 404 on ${model} — trying next. Body:`, body.slice(0, 200));
      response = null;
      continue;
    }
    break; // got a non-404 response — use it
  }

  if (!response) {
    console.log('[MenuVision] All models returned 404. Giving up.');
    return [];
  }

  if (!response.ok) {
    let errorBody = '';
    try { errorBody = await response.text(); } catch (_) {}
    console.log(`FULL_API_ERROR: HTTP ${response.status} ${response.statusText}`);
    console.log('FULL_API_ERROR body:', errorBody);
    if (response.status === 429) {
      console.log('[MenuVision] 429 — quota exhausted. Throwing MenuVisionRateLimitError.');
      throw new MenuVisionRateLimitError();
    }
    return [];
  }

  // response.json() awaits the complete body — generateContent is non-streaming,
  // so the full payload is buffered before we reach this line.
  const json = await response.json();
  const rawText: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  console.log('[MenuVision] Raw response preview:', rawText.slice(0, 400));

  if (!rawText) {
    console.log('[MenuVision] Empty response from model.');
    return [];
  }

  const cleanText = sanitizeJsonText(rawText);
  console.log('[MenuVision] Sanitised JSON preview:', cleanText.slice(0, 400));
  let parsed: any[] | null = null;
  try {
    const root = JSON.parse(cleanText);
    // Expected shape: { "items": [...] }
    // Tolerate a bare array in case the model ignores the wrapper instruction
    if (Array.isArray(root)) {
      parsed = root;
    } else if (Array.isArray(root?.items)) {
      parsed = root.items;
    }
  } catch (e) {
    console.log('[MenuVision] JSON parse failed. Cleaned text:', cleanText.slice(0, 200));
    return [];
  }

  if (!parsed) {
    console.log('[MenuVision] Response did not contain a recognisable items array.');
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
