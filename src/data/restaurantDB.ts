import { RestaurantMenuItem } from '../types/restaurant';

// Helper — all verified items have isAIResult: false by definition
const v = (
  id: string,
  name: string,
  category: 'protein' | 'base' | 'addon',
  isMandatory: boolean,
  protein: number,
  carbs: number,
  fat: number,
): RestaurantMenuItem => ({ id, name, category, isMandatory, protein, carbs, fat, isAIResult: false });

// ─── Verified menu data ────────────────────────────────────────────────────────
// Source: official nutrition pages (accurate as of 2025)

export const RESTAURANT_DB: Record<string, RestaurantMenuItem[]> = {
  'Chipotle': [
    // Proteins — radio (isMandatory: true)
    v('cpt_p_chicken',   'Chicken',   'protein', true,  33, 4, 6),
    v('cpt_p_steak',     'Steak',     'protein', true,  31, 5, 7),
    v('cpt_p_barbacoa',  'Barbacoa',  'protein', true,  25, 5, 7),
    v('cpt_p_sofritas',  'Sofritas',  'protein', true,  10, 8, 10),
    // Bases — checkbox (isMandatory: false)
    v('cpt_b_wrice',  'White Rice',   'base', false, 4,  40, 3),
    v('cpt_b_brice',  'Brown Rice',   'base', false, 4,  41, 4),
    v('cpt_b_greens', 'Supergreens',  'base', false, 1,  3,  0),
    // Add-ons — checkbox
    v('cpt_a_dmeat',  'Double Meat',    'addon', false, 32, 0,  12),
    v('cpt_a_bbean',  'Black Beans',    'addon', false, 7,  22, 1),
    v('cpt_a_pbean',  'Pinto Beans',    'addon', false, 8,  22, 1),
    v('cpt_a_guac',   'Guacamole',      'addon', false, 2,  8,  22),
    v('cpt_a_cheese', 'Cheese',         'addon', false, 6,  1,  8),
    v('cpt_a_scream', 'Sour Cream',     'addon', false, 2,  3,  9),
    v('cpt_a_fveg',   'Fajita Veggies', 'addon', false, 1,  5,  3),
  ],

  'Chick-fil-A': [
    v('cfa_p_gnug',   'Grilled Nuggets (12ct)',  'protein', true, 38, 2,  6),
    v('cfa_p_gcool',  'Grilled Cool Wrap',        'protein', true, 43, 32, 14),
    v('cfa_p_cobb',   'Cobb Salad (Grilled)',     'protein', true, 40, 22, 20),
    v('cfa_p_spicy',  'Spicy Grilled Deluxe',     'protein', true, 42, 41, 14),
    v('cfa_a_salad',  'Side Salad',  'addon', false, 2, 5,  6),
    v('cfa_a_fruit',  'Fruit Cup',   'addon', false, 1, 16, 0),
    v('cfa_a_yogurt', 'Greek Yogurt','addon', false, 8, 6,  0),
  ],

  'Wingstop': [
    v('ws_p_lp6',  '6pc Lemon Pepper (Bone-In)',     'protein', true, 60, 0,  48),
    v('ws_p_gp6',  '6pc Garlic Parmesan (Boneless)', 'protein', true, 30, 42, 42),
    v('ws_p_cl6',  '6pc Classic (Bone-In)',           'protein', true, 54, 0,  40),
    v('ws_p_ca6',  '6pc Cajun (Boneless)',            'protein', true, 30, 38, 36),
    v('ws_a_vfry', 'Voodoo Fries',   'addon', false, 9, 55, 29),
    v('ws_a_sfry', 'Seasoned Fries', 'addon', false, 5, 50, 24),
    v('ws_a_cel',  'Celery & Ranch', 'addon', false, 1, 4,  14),
  ],

  'Whataburger': [
    v('wb_p_plain',  'Whataburger (No Bun)',     'protein', true, 25, 8,  32),
    v('wb_p_grch',   'Grilled Chicken Sandwich', 'protein', true, 32, 49, 8),
    v('wb_p_strp',   "Whatachick'n Strips 3pc",  'protein', true, 25, 22, 14),
    v('wb_p_dbl',    'Double Meat Whataburger',  'protein', true, 45, 62, 38),
    v('wb_a_apple',  'Apple Slices', 'addon', false, 0, 11, 0),
    v('wb_a_salad',  'Side Salad',   'addon', false, 2, 5,  5),
    v('wb_a_onion',  'Onion Rings',  'addon', false, 3, 32, 14),
  ],
};
