export interface Macros {
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * Calculates the match percentage between target macros and a menu item's macros
 * using the Euclidean distance formula.
 *
 * @param target - User's target macros (P, C, F in grams)
 * @param item - Menu item's macros (P, C, F in grams)
 * @returns Match percentage (0-100)
 */
export function calculateMatchPercentage(target: Macros, item: Macros): number {
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
