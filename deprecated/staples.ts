export interface StapleIngredient {
  id: string;
  name: string;
  category: 'Proteins' | 'Carbs' | 'Fats';
  /** Macros per 100 grams of the ingredient */
  macrosPer100g: { protein: number; carbs: number; fat: number };
  /** Optional display subtitle (e.g. 'cooked') */
  subtitle?: string;
}

export const STAPLE_INGREDIENTS: StapleIngredient[] = [
  // ── Proteins ──────────────────────────────────────────────────────────────
  { id: 'chicken_breast',   name: 'Chicken Breast',    category: 'Proteins', macrosPer100g: { protein: 31,   carbs: 0,    fat: 3.6  } },
  { id: 'ground_beef',      name: '93/7 Ground Beef',  category: 'Proteins', macrosPer100g: { protein: 26,   carbs: 0,    fat: 7    } },
  { id: 'egg_whites',       name: 'Egg Whites',         category: 'Proteins', macrosPer100g: { protein: 11,   carbs: 0.7,  fat: 0.2  } },
  { id: 'whey_protein',     name: 'Whey Protein',       category: 'Proteins', macrosPer100g: { protein: 75,   carbs: 6,    fat: 2    } },
  { id: 'ground_turkey',    name: 'Ground Turkey',      category: 'Proteins', macrosPer100g: { protein: 29,   carbs: 0,    fat: 5    }, subtitle: '93/7 lean' },
  { id: 'salmon',           name: 'Salmon',             category: 'Proteins', macrosPer100g: { protein: 20,   carbs: 0,    fat: 13   } },
  { id: 'tilapia',          name: 'Tilapia',            category: 'Proteins', macrosPer100g: { protein: 26,   carbs: 0,    fat: 2.7  } },
  { id: 'skyr_yogurt',      name: 'Skyr Yogurt',        category: 'Proteins', macrosPer100g: { protein: 11,   carbs: 4,    fat: 0.2  } },

  // ── Carbs ─────────────────────────────────────────────────────────────────
  { id: 'jasmine_rice',     name: 'Jasmine Rice',       category: 'Carbs',    macrosPer100g: { protein: 2.7,  carbs: 28.2, fat: 0.3  }, subtitle: 'cooked' },
  { id: 'sweet_potato',     name: 'Sweet Potato',       category: 'Carbs',    macrosPer100g: { protein: 1.6,  carbs: 20.1, fat: 0.1  } },
  { id: 'oats',             name: 'Oats',               category: 'Carbs',    macrosPer100g: { protein: 13.4, carbs: 66.3, fat: 6.9  } },
  { id: 'cream_of_rice',    name: 'Cream of Rice',      category: 'Carbs',    macrosPer100g: { protein: 1.5,  carbs: 20,   fat: 0.2  }, subtitle: 'cooked' },
  { id: 'brown_rice',       name: 'Brown Rice',         category: 'Carbs',    macrosPer100g: { protein: 2.6,  carbs: 23,   fat: 0.9  }, subtitle: 'cooked' },
  { id: 'quinoa',           name: 'Quinoa',             category: 'Carbs',    macrosPer100g: { protein: 4.4,  carbs: 21.3, fat: 1.9  }, subtitle: 'cooked' },
  { id: 'ww_pasta',         name: 'Whole Wheat Pasta',  category: 'Carbs',    macrosPer100g: { protein: 5.3,  carbs: 25,   fat: 0.9  }, subtitle: 'cooked' },
  { id: 'berries',          name: 'Berries',            category: 'Carbs',    macrosPer100g: { protein: 0.7,  carbs: 14,   fat: 0.3  }, subtitle: 'mixed' },

  // ── Fats ──────────────────────────────────────────────────────────────────
  { id: 'avocado',          name: 'Avocado',            category: 'Fats',     macrosPer100g: { protein: 2,    carbs: 8.5,  fat: 14.7 } },
  { id: 'olive_oil',        name: 'Olive Oil',          category: 'Fats',     macrosPer100g: { protein: 0,    carbs: 0,    fat: 100  } },
  { id: 'almond_butter',    name: 'Almond Butter',      category: 'Fats',     macrosPer100g: { protein: 21,   carbs: 19,   fat: 50   } },
  { id: 'walnuts',          name: 'Walnuts',            category: 'Fats',     macrosPer100g: { protein: 15.2, carbs: 13.7, fat: 65.2 } },
  { id: 'peanut_butter',    name: 'Peanut Butter',      category: 'Fats',     macrosPer100g: { protein: 25.1, carbs: 20,   fat: 49.9 } },
  { id: 'coconut_oil',      name: 'Coconut Oil',        category: 'Fats',     macrosPer100g: { protein: 0,    carbs: 0,    fat: 100  } },
];
