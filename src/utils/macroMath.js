/**
 * Calculates the match percentage between target macros and an item's macros
 * using the Euclidean distance formula in 3D (protein/carbs/fat) space.
 */
export function calculateMatchPercentage(target, item) {
  const deltaP = target.protein - item.protein;
  const deltaC = target.carbs - item.carbs;
  const deltaF = target.fat - item.fat;

  const distance = Math.sqrt(deltaP ** 2 + deltaC ** 2 + deltaF ** 2);

  const targetMagnitude = Math.sqrt(
    target.protein ** 2 + target.carbs ** 2 + target.fat ** 2
  );

  if (targetMagnitude === 0) {
    return distance === 0 ? 100 : 0;
  }

  const normalizedDistance = distance / targetMagnitude;
  const matchPercentage = Math.max(0, 100 * (1 - normalizedDistance));

  return Math.round(matchPercentage * 10) / 10;
}

// ─── Meal history grouping (cumulative tracking) ─────────────────────────
const SESSION_GAP_MS = 45 * 60 * 1000;

export function getDayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function getRelativeDayLabel(ts) {
  const d   = new Date(ts);
  const now = new Date();
  const dDay = new Date(d.getFullYear(),   d.getMonth(),   d.getDate());
  const nDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((nDay - dDay) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('default', { month: 'short', day: 'numeric' });
}

export function formatHistoryDate(ts) {
  const d = new Date(ts);
  const mon = d.toLocaleString('default', { month: 'short' });
  const h = d.getHours(), m = d.getMinutes().toString().padStart(2, '0');
  return `${mon} ${d.getDate()}, ${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function groupByDayAndRestaurant(entries) {
  if (!entries.length) return [];
  const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);
  const trips = [];
  let cur = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const timeDiff = sorted[i].timestamp - sorted[i - 1].timestamp;
    const sameRest = sorted[i].restaurant === sorted[i - 1].restaurant;
    if (timeDiff <= SESSION_GAP_MS && sameRest) {
      cur.push(sorted[i]);
    } else {
      trips.push(cur);
      cur = [sorted[i]];
    }
  }
  trips.push(cur);
  const dayMap = new Map();
  for (const trip of trips) {
    const key = getDayKey(trip[0].timestamp);
    const label = getRelativeDayLabel(trip[0].timestamp);
    if (!dayMap.has(key)) dayMap.set(key, { label, trips: [] });
    dayMap.get(key).trips.push(trip);
  }
  return [...dayMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, v]) => ({ dayLabel: v.label, trips: v.trips.reverse() }));
}

/**
 * Find the single best protein-category item to recommend for the given targets.
 * Returns { item, sug, density } for the top uncapped item (by density),
 * or the capped item with the highest projected protein if everything is capped.
 */
export function findBestItem(targets, items) {
  const withSug = items
    .filter(i => i.protein > 0)
    .map(i => {
      const sug = suggestServing(i, targets);
      if (!sug) return null;
      const cal = i.protein * 4 + (i.carbs || 0) * 4 + (i.fat || 0) * 9;
      return { item: i, sug, density: cal > 0 ? (i.protein / cal) * 100 : 0 };
    })
    .filter(Boolean);

  if (!withSug.length) return null;

  const uncapped = withSug.filter(x => !x.sug.limitedBy);
  if (uncapped.length) {
    uncapped.sort((a, b) => b.density - a.density);
    return uncapped[0];
  }

  withSug.sort((a, b) => b.sug.projP - a.sug.projP);
  return withSug[0];
}

/**
 * Suggest the optimal number of servings for a menu item given macro targets.
 *
 * Returns null when protein target is unset or the item has no protein.
 *
 * Return shape:
 *   { servings, limitedBy, projP, projC, projF }
 *   limitedBy: null (can hit protein goal) | 'fat' | 'carbs' (cap reached first)
 */
export function suggestServing(item, targets) {
  const tP = targets.protein || 0;
  const tC = targets.carbs   || 0;
  const tF = targets.fat     || 0;

  if (tP <= 0 || item.protein <= 0) return null;

  const protServings = tP / item.protein;

  const fatCap  = tF > 0 && item.fat   > 0 ? tF  / item.fat   : Infinity;
  const carbCap = tC > 0 && item.carbs > 0 ? tC  / item.carbs : Infinity;
  const minCap  = Math.min(fatCap, carbCap);

  // Only surface a "limited" warning when the cap is meaningfully tighter
  // than what protein alone would require (10 % tolerance).
  const limitedBy = minCap < protServings * 0.9
    ? (fatCap <= carbCap ? 'fat' : 'carbs')
    : null;

  const raw      = limitedBy ? minCap : protServings;
  const servings = Math.max(0.5, Math.min(Math.round(raw * 2) / 2, 10));

  return {
    servings,
    limitedBy,
    projP: Math.round(item.protein        * servings),
    projC: Math.round((item.carbs  || 0)  * servings),
    projF: Math.round((item.fat    || 0)  * servings),
  };
}
