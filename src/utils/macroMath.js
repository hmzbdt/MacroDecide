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
