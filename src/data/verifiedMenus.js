// 2026 verified nutrition data — sourced from official chain nutrition pages

const v = (id, name, category, isMandatory, protein, carbs, fat) => ({
  id, name, category, isMandatory, protein, carbs, fat,
  isAIResult: false, dataSource: 'verified',
});

export const VERIFIED_MENUS = {
  'Chipotle': [
    v('cpt_p_chicken',  'Chicken',            'protein', true,  32,  1,  7),
    v('cpt_p_steak',    'Steak',              'protein', true,  29,  1,  8),
    v('cpt_p_carnitas', 'Carnitas',           'protein', true,  23,  0, 12),
    v('cpt_p_barbacoa', 'Barbacoa',           'protein', true,  24,  2, 10),
    v('cpt_p_pollo',    'Pollo Asado',        'protein', true,  28,  2,  9),
    v('cpt_p_sofritas', 'Sofritas',           'protein', true,   8,  9, 10),
    v('cpt_b_wrice',    'White Rice',         'base',    false,  4, 40,  3),
    v('cpt_b_brice',    'Brown Rice',         'base',    false,  4, 40,  4),
    v('cpt_b_lettuce',  'Romaine Lettuce',    'base',    false,  1,  2,  0),
    v('cpt_b_greens',   'Supergreens',        'base',    false,  1,  3,  0),
    v('cpt_a_bbean',    'Black Beans',        'addon',   false,  7, 22,  1),
    v('cpt_a_pbean',    'Pinto Beans',        'addon',   false,  8, 22,  1),
    v('cpt_a_guac',     'Guacamole',          'addon',   false,  2,  8, 22),
    v('cpt_a_queso',    'Queso Blanco',       'addon',   false,  4,  3,  8),
    v('cpt_a_cheese',   'Cheese',             'addon',   false,  6,  1,  8),
    v('cpt_a_scream',   'Sour Cream',         'addon',   false,  2,  3,  9),
    v('cpt_a_corn',     'Corn Salsa',         'addon',   false,  2, 19,  1),
    v('cpt_a_tomato',   'Fresh Tomato Salsa', 'addon',   false,  1,  4,  0),
    v('cpt_a_fveg',     'Fajita Veggies',     'addon',   false,  1,  5,  3),
  ],

  'Chick-fil-A': [
    v('cfa_gnug',  'Grilled Nuggets (12ct)',        'protein', true,  38,  2,  5),
    v('cfa_cobb',  'Cobb Salad w/ Grilled Chicken', 'protein', true,  40, 22, 19),
    v('cfa_gcsw',  'Grilled Chicken Sandwich',      'protein', true,  28, 44, 12),
    v('cfa_gcool', 'Grilled Cool Wrap',             'protein', true,  43, 32, 14),
    v('cfa_spicy', 'Spicy Grilled Deluxe',          'protein', true,  42, 41, 14),
    v('cfa_salad', 'Side Salad',  'addon', false,  2,  5,  6),
    v('cfa_fruit', 'Fruit Cup',   'addon', false,  1, 16,  0),
    v('cfa_yogurt','Greek Yogurt','addon', false,  8,  6,  0),
  ],

  "McDonald's": [
    v('mcd_dqpc',  'Double Quarter Pounder w/ Cheese', 'protein', true, 48, 43, 42),
    v('mcd_mdbl',  'McDouble',                          'protein', true, 22, 33, 20),
    v('mcd_nug10', '10-Piece McNuggets',                'protein', true, 23, 26, 24),
  ],

  'Burger King': [
    v('bk_whop', 'Whopper (No Cheese)', 'protein', true,  28, 49, 40),
    v('bk_cfry', 'Chicken Fries (9pc)', 'addon',   false, 13, 16, 12),
  ],

  'Wingstop': [
    // Classic Bone-In Wings (6pc) — sorted by protein density (plain & dry rubs first)
    // Source: wingstop_2026.pdf — 1pc macros × 6; density = (protein/calories) × 100
    v('ws_bi_plain', '6pc Classic Plain',          'protein', true,  60,  0, 30), // 11.1%
    v('ws_bi_oth',   '6pc Classic Original Hot',   'protein', true,  60,  0, 30), // 11.1%
    v('ws_bi_caj',   '6pc Classic Cajun',           'protein', true,  60,  0, 30), // 11.1%
    v('ws_bi_atm',   '6pc Classic Atomic',          'protein', true,  60,  6, 30), // 11.1%
    v('ws_bi_haw',   '6pc Classic Hawaiian',        'protein', true,  60, 18, 30), // 10.0%
    v('ws_bi_skq',   '6pc Classic Spicy Korean Q',  'protein', true,  60, 18, 30), // 10.0%
    v('ws_bi_mh',    '6pc Classic Mango Habanero',  'protein', true,  60, 24, 30), // 10.0%
    v('ws_bi_hbb',   '6pc Classic Hickory BBQ',     'protein', true,  60, 24, 30), // 10.0%
    v('ws_bi_lr',    '6pc Classic Louisiana Rub',   'protein', true,  60,  0, 42), //  9.1%
    v('ws_bi_hhr',   '6pc Classic Hot Honey Rub',   'protein', true,  60, 12, 48), //  8.3%
    v('ws_bi_mild',  '6pc Classic Mild',            'protein', true,  60,  0, 48), //  8.3%
    v('ws_bi_lp',    '6pc Classic Lemon Pepper',    'protein', true,  60,  0, 48), //  8.3%
    v('ws_bi_gp',    '6pc Classic Garlic Parm',     'protein', true,  60,  6, 48), //  8.3%
    // Tenders (5pc) — sorted by protein density (plain & dry rubs first)
    v('ws_t_plain',  '5pc Tenders Plain',           'protein', true,  50, 50, 35), //  7.1%
    v('ws_t_oth',    '5pc Tenders Original Hot',    'protein', true,  50, 50, 35), //  7.1%
    v('ws_t_atm',    '5pc Tenders Atomic',           'protein', true,  50, 60, 35), //  6.7%
    v('ws_t_caj',    '5pc Tenders Cajun',            'protein', true,  50, 55, 35), //  6.7%
    v('ws_t_haw',    '5pc Tenders Hawaiian',         'protein', true,  50, 80, 35), //  6.3%
    v('ws_t_skq',    '5pc Tenders Spicy Korean Q',   'protein', true,  50, 80, 35), //  5.9%
    v('ws_t_hbb',    '5pc Tenders Hickory BBQ',      'protein', true,  50, 85, 35), //  5.9%
    v('ws_t_mh',     '5pc Tenders Mango Habanero',   'protein', true,  50, 85, 35), //  5.9%
    v('ws_t_lr',     '5pc Tenders Louisiana Rub',    'protein', true,  50, 50, 60), //  5.6%
    v('ws_t_lp',     '5pc Tenders Lemon Pepper',     'protein', true,  50, 50, 65), //  5.0%
    v('ws_t_mild',   '5pc Tenders Mild',             'protein', true,  50, 50, 70), //  5.0%
    v('ws_t_gp',     '5pc Tenders Garlic Parm',      'protein', true,  50, 55, 70), //  4.8%
    v('ws_t_hhr',    '5pc Tenders Hot Honey Rub',    'protein', true,  50, 70, 70), //  4.5%
    // Sides
    v('ws_a_vfry', 'Voodoo Fries',   'addon', false,  9, 55, 29),
    v('ws_a_sfry', 'Seasoned Fries', 'addon', false,  5, 50, 24),
    v('ws_a_cel',  'Celery & Ranch', 'addon', false,  1,  4, 14),
  ],
};
