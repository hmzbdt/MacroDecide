export interface Macros {
  protein: number;
  carbs: number;
  fat: number;
}

export interface MenuItem {
  name: string;
  restaurant: string;
  macros: Macros;
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

/**
 * Returns true if the menu item exceeds the user's Fat or Carb targets
 * by more than the given threshold (default 10%).
 * Skips a macro check when the target for that macro is 0.
 */
export function exceedsConstraints(
  target: Macros,
  item: Macros,
  threshold: number = 0.1
): boolean {
  if (target.carbs > 0 && item.carbs > target.carbs * (1 + threshold)) {
    return true;
  }
  if (target.fat > 0 && item.fat > target.fat * (1 + threshold)) {
    return true;
  }
  return false;
}

/**
 * Generates a human-readable analysis comparing a menu item's macros
 * against the user's targets.
 */
export function generateAnalysis(target: Macros, item: Macros): string {
  const notes: string[] = [];

  // Protein
  if (target.protein > 0 && Math.abs(item.protein - target.protein) <= target.protein * 0.1) {
    notes.push('Optimal Protein ratio found');
  } else if (item.protein > target.protein) {
    notes.push('Higher in Protein than your target');
  } else if (target.protein > 0) {
    notes.push('Lower in Protein than your target');
  }

  // Carbs
  if (target.carbs > 0) {
    if (Math.abs(item.carbs - target.carbs) <= target.carbs * 0.1) {
      // within range — no note needed
    } else if (item.carbs > target.carbs) {
      notes.push('slightly higher in Carbs than your target');
    } else {
      notes.push('slightly lower in Carbs than your target');
    }
  }

  // Fat
  if (target.fat > 0) {
    if (Math.abs(item.fat - target.fat) <= target.fat * 0.1) {
      // within range
    } else if (item.fat > target.fat) {
      notes.push('slightly higher in Fat than your target');
    } else {
      notes.push('slightly lower in Fat than your target');
    }
  }

  if (notes.length === 0) return 'All macros within target range.';
  if (notes.length === 1) return notes[0] + '.';
  return notes[0] + ', but ' + notes.slice(1).join(' and ') + '.';
}

/**
 * Generates a concise pros/cons analysis for cleaner UI
 */
export function generateConciseAnalysis(target: Macros, item: Macros): { pros: string[]; cons: string[] } {
  const pros: string[] = [];
  const cons: string[] = [];

  // Protein analysis
  if (target.protein > 0) {
    if (Math.abs(item.protein - target.protein) <= target.protein * 0.1) {
      pros.push('On-target Protein');
    } else if (item.protein > target.protein * 1.1) {
      pros.push('High Protein');
    } else if (item.protein < target.protein * 0.8) {
      cons.push('Low Protein');
    }
  }

  // Carbs analysis
  if (target.carbs > 0) {
    if (Math.abs(item.carbs - target.carbs) <= target.carbs * 0.1) {
      pros.push('On-target Carbs');
    } else if (item.carbs > target.carbs * 1.2) {
      cons.push('High Carbs');
    } else if (item.carbs < target.carbs * 0.5) {
      pros.push('Low Carbs');
    }
  }

  // Fat analysis
  if (target.fat > 0) {
    if (Math.abs(item.fat - target.fat) <= target.fat * 0.1) {
      pros.push('On-target Fat');
    } else if (item.fat > target.fat * 1.2) {
      cons.push('High Fat');
    } else if (item.fat < target.fat * 0.5) {
      pros.push('Low Fat');
    }
  }

  return { pros, cons };
}
