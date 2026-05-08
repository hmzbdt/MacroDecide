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
};
