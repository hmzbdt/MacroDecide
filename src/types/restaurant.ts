// ─── Restaurant Menu Data Model ───────────────────────────────────────────────

export type MenuCategory = 'protein' | 'base' | 'addon';

/** Where the item's macro data originated. */
export type DataSource = 'db' | 'fatsecret' | 'nutritionix' | 'spoonacular' | 'ai' | 'ocr' | 'verified' | 'userCorrected';

/**
 * A single selectable item on a restaurant menu.
 * All macro values are in grams.
 */
export interface RestaurantMenuItem {
  /** Stable identifier, e.g. "chipotle_protein_chicken" */
  id: string;
  name: string;
  category: MenuCategory;
  /** true = must select at least one (e.g. main protein). UI uses radio buttons. */
  isMandatory: boolean;
  protein: number;
  carbs: number;
  fat: number;
  /** true = macro values came from the AI estimator, not a verified source */
  isAIResult: boolean;
  /** AI self-reported certainty 0–100; only present when isAIResult is true. */
  confidence?: number;
  /** Serving weight in grams from Nutritionix/Spoonacular; used for g/oz display. */
  servingWeightG?: number;
  /** Audit trail: which data source produced this item's macros. */
  dataSource?: DataSource;
  /** Raw serving label from FatSecret, e.g. "1 sandwich", "100g", "2044g". */
  servingLabel?: string;
  /** True when the serving size was >500g and macros were divided to per-100g. */
  normalizedPer100g?: boolean;
  /** True when any single macro exceeded 150g and was divided by 10 (macro ceiling sanity check). */
  highServingSize?: boolean;
}

export interface RestaurantMenu {
  restaurantName: string;
  items: RestaurantMenuItem[];
}
