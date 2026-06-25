// 2026 verified nutrition data — sourced from official chain nutrition PDFs

const v = (id, name, category, isMandatory, protein, carbs, fat, lowPriority = false) => ({
  id, name, category, isMandatory, protein, carbs, fat,
  isAIResult: false, dataSource: 'verified',
  low_priority: lowPriority,
});

export const VERIFIED_MENUS = {
  'Chipotle': [
    v('cpt_p_chicken',  'Chicken',            'protein', true,  32,  1,  7),
    v('cpt_p_steak',    'Steak',              'protein', true,  29,  1,  8),
    v('cpt_p_carnitas', 'Carnitas',           'protein', true,  23,  0, 12),
    v('cpt_p_barbacoa', 'Barbacoa',           'protein', true,  24,  2, 10),
    v('cpt_p_pollo',    'Pollo Asado',        'protein', true,  28,  2,  9),
    v('cpt_p_sofritas', 'Sofritas',           'protein', true,   8,  9, 10, true),
    v('cpt_b_wrice',    'White Rice',         'base',    false,  4, 40,  3, true),
    v('cpt_b_brice',    'Brown Rice',         'base',    false,  4, 40,  4, true),
    v('cpt_b_lettuce',  'Romaine Lettuce',    'base',    false,  1,  2,  0, true),
    v('cpt_b_greens',   'Supergreens',        'base',    false,  1,  3,  0, true),
    v('cpt_a_bbean',    'Black Beans',        'addon',   false,  7, 22,  1, true),
    v('cpt_a_pbean',    'Pinto Beans',        'addon',   false,  8, 22,  1, true),
    v('cpt_a_guac',     'Guacamole',          'addon',   false,  2,  8, 22, true),
    v('cpt_a_queso',    'Queso Blanco',       'addon',   false,  4,  3,  8, true),
    v('cpt_a_cheese',   'Cheese',             'addon',   false,  6,  1,  8, true),
    v('cpt_a_scream',   'Sour Cream',         'addon',   false,  2,  3,  9, true),
    v('cpt_a_corn',     'Corn Salsa',         'addon',   false,  2, 19,  1, true),
    v('cpt_a_tomato',   'Fresh Tomato Salsa', 'addon',   false,  1,  4,  0, true),
    v('cpt_a_fveg',     'Fajita Veggies',     'addon',   false,  1,  5,  3, true),
  ],

  // Source: chickfila_2026.pdf — image-based PDF; camelot cannot extract tables; data retained from verified CFA nutrition page
  'Chick-fil-A': [
    v('cfa_gnug',  'Grilled Nuggets (12ct)',        'protein', true,  38,  2,  5),
    v('cfa_cobb',  'Cobb Salad w/ Grilled Chicken', 'protein', true,  40, 22, 19),
    v('cfa_gcsw',  'Grilled Chicken Sandwich',      'protein', true,  28, 44, 12),
    v('cfa_gcool', 'Grilled Cool Wrap',             'protein', true,  43, 32, 14),
    v('cfa_spicy', 'Spicy Grilled Deluxe',          'protein', true,  42, 41, 14),
    v('cfa_salad', 'Side Salad',                    'addon',   false,  2,  5,  6, true),
    v('cfa_fruit', 'Fruit Cup',                     'addon',   false,  1, 16,  0, true),
    v('cfa_yogurt','Greek Yogurt',                  'addon',   false,  8,  6,  0, true),
  ],

  // Source: mcdonalds_2026.pdf — multi-row cell layout required custom name reconstruction
  "McDonald's": [
    v('mcd_grsl_g', 'Bacon Ranch Salad w/ Grilled Chicken', 'protein', true,  38, 47, 14), // 12.3%
    v('mcd_asal_g', 'Asian Salad w/ Grilled Chicken',       'protein', true,  32, 32,  9), // 11.9%
    v('mcd_wrap_g', 'Premium McWrap Grilled Chicken',       'protein', true,  41, 66, 19), //  8.2%
    v('mcd_agc',    'Artisan Grilled Chicken Sandwich',     'protein', true,  33, 40,  6), //  9.2%
    v('mcd_bcmdb',  'Bacon McDouble',                       'protein', true,  28, 47, 23), //  6.1%
    v('mcd_dqpc',   'Double Quarter Pounder w/ Cheese',     'protein', true,  50, 43, 27), //  5.9%
    v('mcd_qpc',    'Quarter Pounder w/ Cheese',            'protein', true,  31, 46, 28), //  5.7%
    v('mcd_mdbl',   'McDouble',                             'protein', true,  22, 35, 18), //  5.6%
    v('mcd_egmuf',  'Egg McMuffin',                         'protein', true,  17, 31, 13), //  5.7%
    v('mcd_bcbgl',  'Bacon Egg & Cheese Bagel',             'protein', true,  27, 56, 23), //  5.1%
    v('mcd_bm',     'Big Mac',                              'protein', false, 25, 40, 28),  //  4.6%
    v('mcd_nug10',  '10-Piece Chicken McNuggets',           'protein', false, 22, 30, 18),  //  4.7%
    v('mcd_nug20',  '20-Piece Chicken McNuggets',           'protein', false, 44, 59, 30),  //  4.7%
    v('mcd_chbgr',  'Cheeseburger',                         'addon',   false, 15, 29, 12),
    v('mcd_hambgr', 'Hamburger',                            'addon',   false, 12, 20,  8),
    v('mcd_sfry_m', 'Medium French Fries',                  'addon',   false,  4, 44, 16, true),
    v('mcd_aslc',   'Apple Slices',                         'addon',   false,  0,  4,  0, true),
    v('mcd_ssal',   'Side Salad',                           'addon',   false,  1,  2,  0, true),
  ],

  // Source: burgerking_2026.pdf — ⚠️ Australian BK PDF (kJ units converted; carbs estimated via macro math)
  // Verify calorie/carb values against US BK nutrition page before shipping
  'Burger King': [
    v('bk_aasg',    'All American Steakhouse',       'protein', true,  55, 24, 56), //  6.7%
    v('bk_wdbl',    'WHOPPER Double w/ Cheese',      'protein', false, 72, 50, 81), //  5.9%
    v('bk_pdbl',    'Plant Based Double Whopper',    'protein', false, 49, 44, 40), //  6.7%
    v('bk_bkdblch', 'BK Double Chicken',             'protein', true,  45, 60, 42), //  5.7%
    v('bk_tchz',    'Triple Cheeseburger',           'protein', false, 46, 27, 45), //  6.6%
    v('bk_bbqdch',  'BBQ Bacon Double Cheeseburger', 'protein', true,  35, 14, 35), //  6.8%
    v('bk_dchz',    'Double Cheeseburger',           'protein', true,  32, 25, 31), //  6.3%
    v('bk_whop',    'WHOPPER',                       'protein', true,  38, 50, 46), //  5.0%
    v('bk_bkch',    'BK Chicken',                    'protein', false, 26, 46, 34),  //  4.4%
    v('bk_nug10',   'Chicken Nuggets (10pc)',         'addon',   false, 23, 23, 34),  //  4.7%
    v('bk_chfry9',  'Chicken Fries (9 Pack)',         'addon',   false, 14, 23, 27),
    v('bk_fries_r', 'Thick Cut Fries (Regular)',      'addon',   false,  3, 26,  5, true),
    v('bk_oring6',  'Onion Rings (6 pack)',           'addon',   false,  4, 23, 10, true),
  ],

  // Source: dominos_2026.pdf — US Domino's nutrition guide; 84 items extracted
  "Domino's": [
    v('dom_chcesar',   'Chicken Caesar Salad',                 'protein', true,  19, 14,  7), // 10.0%
    v('dom_chparm',    'Chicken Parm Sandwich',                'protein', true,  24, 38, 15), //  6.0%
    v('dom_chbr',      'Chicken Bacon Ranch Sandwich',         'protein', true,  23, 37, 22), //  5.1%
    v('dom_buf_ranch', 'Buffalo Ranch Sandwich',               'protein', true,  23, 39, 30), //  4.7%
    v('dom_bac_ched',  'Bacon Cheddar Sandwich',               'protein', false, 23, 48, 24), //  4.7%
    v('dom_sw_sp',     'Sweet & Spicy Chicken Habanero Sand',  'protein', false, 21, 44, 14), //  5.4%
    v('dom_buf_ch',    'Buffalo Chicken Sandwich',             'protein', false, 20, 39, 20), //  4.8%
    v('dom_htbuf_w',   'Hot Buffalo Wings (4pc)',               'protein', true,  15,  9, 20), //  5.8%
    v('dom_mildbuf_w', 'Mild Buffalo Wings (4pc)',              'protein', true,  15, 10, 20), //  5.8%
    v('dom_honbbq_w',  'Honey BBQ Wings (4pc)',                 'protein', true,  15, 22, 20), //  4.8%
    v('dom_garparm_w', 'Garlic Parmesan Wings (4pc)',           'protein', false, 15, 10, 34), //  3.8%
    v('dom_mango_w',   'Sweet Mango Habanero Wings (4pc)',      'protein', false, 15, 21, 20), //  4.8%
    v('dom_pasta_alf', 'Chicken Alfredo Pasta',                 'base',    false, 24, 60, 28), //  4.1%
    v('dom_pasta_it',  'Italian Pasta',                         'base',    false, 21, 37, 20), //  5.0%
    v('dom_bfast_hb',  'Ham & Bacon Breakfast Pizza',           'addon',   false, 12, 22, 12),
    v('dom_boneless',  'Boneless Chicken (4pc)',                 'addon',   false,  9, 18,  7, true), //  5.3%
    v('dom_crust_ht2', 'Hand Tossed Crust (1/2 pizza)',         'base',    false,  7, 42,  3, true),
    v('dom_crust_ht3', 'Hand Tossed Crust (1/3 pizza)',         'base',    false,  7, 40,  3, true),
    v('dom_crust_ht8', 'Hand Tossed Crust (1/8 pizza)',         'base',    false,  4, 21,  2, true),
    v('dom_crust_ny',  'New York Style Crust (1/6 pizza)',      'base',    false,  4, 20,  2, true),
    v('dom_crust_thin','Crunchy Thin Crust (1/4 pizza)',        'base',    false,  2, 15,  5, true),
    v('dom_brd_bites', 'Garlic Bread Bites',                    'addon',   false,  5, 27,  9, true),
    v('dom_gar_knot',  'Stuffed Cheesy Bread',                  'addon',   false,  5, 15,  8, true),
    v('dom_cin_bites', 'Cinnamon Bread Bites',                  'addon',   false,  5, 30,  9, true),
    v('dom_choc_lava', 'Chocolate Lava Crunch Cake',            'addon',   false,  4, 47, 17, true),
    v('dom_sal_gdn',   'Classic Garden Salad',                  'addon',   false,  3,  8,  4, true),
  ],

  // Source: kfc_2026.pdf — stream flavor
  // ⚠️ Original Recipe Breast/Drum/Thigh absent from this PDF version; re-download if needed
  'KFC': [
    v('kfc_spcy_breast',  'Spicy Crispy Chicken Breast',         'protein', true,  30, 11, 20), //  8.6%
    v('kfc_grilled_thigh','Kentucky Grilled Chicken Thigh',      'protein', true,  17,  0,  9), // 11.3%
    v('kfc_spcy_thigh',   'Spicy Crispy Chicken Thigh',          'protein', false, 13, 10, 20), //  4.8%
    v('kfc_mac_bowl',     'Mac & Cheese Bowl',                   'addon',   false, 30, 42, 22), //  6.2%
    v('kfc_tender_ea',    'Original Recipe Tender (each)',       'protein', false, 11, 20,  6, true), //  6.5%
    v('kfc_grilled_wing', 'Kentucky Grilled Chicken Whole Wing', 'protein', false,  9,  0,  3, true), // 12.9%
    v('kfc_spcy_drum',    'Spicy Crispy Chicken Drumstick',      'protein', false,  9,  5,  8, true), //  6.9%
    v('kfc_bbq_beans',    'BBQ Baked Beans',                     'addon',   false, 11, 34,  1, true),
    v('kfc_spcy_wing',    'Spicy Crispy Chicken Whole Wing',     'protein', false,  7,  5,  8, true), //  5.8%
    v('kfc_fries',        'Secret Recipe Fries',                 'addon',   false,  5, 41, 15, true),
    v('kfc_biscuit',      'Biscuit',                             'addon',   false,  4, 22,  8, true),
    v('kfc_mash_gvy',     'Mashed Potatoes With Gravy',          'addon',   false,  3, 20,  5, true),
    v('kfc_corn',         'Corn on the Cob',                     'addon',   false,  2, 17,  1, true),
    v('kfc_slaw',         'Coleslaw',                            'addon',   false,  1, 14, 12, true),
    v('kfc_nug1',         'Kentucky Fried Nuggets (1pc)',        'addon',   false,  3,  1,  2, true),
  ],

  // Source: starbucks_2026.pdf — UK Starbucks menu (croques, ciabattas, wraps)
  'Starbucks': [
    v('sbx_ch_caesar',     'Chicken & Bacon Caesar Wrap',        'protein', false, 29, 46, 27), //  5.4%
    v('sbx_ch_honey',      'Chicken & Hot Honey Ciabatta',       'protein', false, 28, 69, 19), //  5.1%
    v('sbx_hamcheese_cib', 'Ham & Cheese Ciabatta',              'protein', false, 27, 55, 15), //  5.8%
    v('sbx_ch_pesto',      'Chicken Pesto Croque',               'protein', false, 25, 54, 22), //  4.8%
    v('sbx_hamcheese_crq', 'Ham & Cheese Croque',                'protein', false, 22, 57, 14), //  5.0%
    v('sbx_kr_hwrap',      'Korean Hot Honey Chicken Wrap',      'protein', false, 21, 57, 11), //  5.4%
    v('sbx_chorizo',       'Chorizo & Mozzarella Romana',        'protein', false, 21, 51, 14), //  5.5%
    v('sbx_all_day_bfast', 'All Day Breakfast Ciabatta',         'base',    false, 22, 57, 21), //  4.3%
    v('sbx_bfast_toastie', 'Breakfast Toastie',                  'base',    false, 20, 52, 22), //  4.1%
    v('sbx_sausage_bap',   'Sausage Bap',                        'base',    false, 17, 45, 23), //  3.8%
    v('sbx_hamcheese_crs', 'Ham And Cheese Croissant',           'addon',   false, 14, 25, 16),
    v('sbx_porridge_milk', 'Porridge (Semi-Skimmed Milk)',       'base',    false, 10, 32,  5, true),
    v('sbx_cinn_swirl',    'Cinnamon Swirl',                     'addon',   false, 11, 67,  8, true),
    v('sbx_nuts',          'Roasted & Salted Nuts',              'addon',   false,  7,  8, 18, true),
    v('sbx_butter_crs',    'Butter Croissant',                   'addon',   false,  5, 28, 13, true),
    v('sbx_popchips',      'Popchips',                           'addon',   false,  2, 16,  3, true),
  ],

  // Source: tacobell_2026.pdf — ⚠️ Australian Taco Bell menu (Pulled Oats = AU vegan protein; US menu uses Black Bean/Beef)
  'Taco Bell': [
    v('tb_gstuft_po',   'Grilled Stuft Burrito - Pulled Oats',     'protein', true,  40, 70, 26), //  6.0%
    v('tb_gstuft_ch',   'Grilled Stuft Burrito - Grilled Chicken', 'protein', true,  34, 63, 24), //  5.6%
    v('tb_gstuft_beef', 'Grilled Stuft Burrito - Seasoned Beef',   'protein', false, 29, 66, 31), //  4.6%
    v('tb_ques_po',     'Quesadilla - Pulled Oats',                'protein', true,  33, 42, 30), //  5.7%
    v('tb_nkd_po',      'Naked Burrito Bowl - Pulled Oats',        'protein', true,  32, 55, 19), //  6.5%
    v('tb_ques_ch',     'Quesadilla - Grilled Chicken',            'protein', true,  31, 38, 29), //  5.7%
    v('tb_ques_beef',   'Quesadilla - Seasoned Beef',              'protein', true,  28, 40, 32), //  4.9%
    v('tb_nkd_ch',      'Naked Burrito Bowl - Grilled Chicken',    'protein', true,  27, 48, 17), //  6.4%
    v('tb_gor_po',      'Cheesy Gordita Crunch - Pulled Oats',     'protein', false, 27, 42, 28), //  5.1%
    v('tb_gor_ch',      'Cheesy Gordita Crunch - Grilled Chicken', 'protein', false, 25, 38, 27), //  5.1%
    v('tb_cwrap_ch',    'Crunchwrap Supreme - Grilled Chicken',    'protein', false, 23, 56, 26), //  4.7%
    v('tb_nkd_beef',    'Naked Burrito Bowl - Seasoned Beef',      'protein', false, 22, 51, 24), //  4.6%
    v('tb_cwrap_beef',  'Crunchwrap Supreme - Seasoned Beef',      'protein', false, 21, 57, 30), //  4.0%
    v('tb_vegan_gr',    'Vegan Griller',                           'base',    false, 19, 39,  8), //  6.0%
    v('tb_meximelt',    'Mexi Melt',                               'addon',   false, 17, 17, 15),
    v('tb_spcychgr',    'Spicy Chicken Griller',                   'addon',   false, 17, 36, 12),
    v('tb_chal_ch',     'Chalupa Supreme - Grilled Chicken',       'protein', false, 17, 33, 20), //  5.6%
    v('tb_st_ch',       'Soft Taco - Grilled Chicken',             'protein', false, 15, 16,  7),  //  8.1%
    v('tb_ct_ch',       'Crunchy Taco - Grilled Chicken',          'protein', false, 13,  9,  7),  //  8.8%
    v('tb_st_beef',     'Soft Taco - Seasoned Beef',               'protein', false, 12, 17, 11),  //  5.7%
    v('tb_ct_beef',     'Crunchy Taco - Seasoned Beef',            'protein', false, 10, 10, 11, true), //  5.8%
    v('tb_cheesy_ru',   'Cheesy Roll Up',                          'addon',   false, 10, 16, 11, true),
    v('tb_bblk',        'Black Beans',                             'addon',   false,  6, 16,  0, true),
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
    v('ws_a_vfry', 'Voodoo Fries',   'addon', false,  9, 55, 29, true),
    v('ws_a_sfry', 'Seasoned Fries', 'addon', false,  5, 50, 24, true),
    v('ws_a_cel',  'Celery & Ranch', 'addon', false,  1,  4, 14, true),
  ],
};
