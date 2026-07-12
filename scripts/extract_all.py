#!/usr/bin/env python3
"""Extract nutrition data from all restaurant PDFs."""
import camelot
import re
import json

def safe_num(val, default=0):
    s = str(val).replace(',', '.').strip()
    lines = s.split('\n')
    for line in reversed(lines):
        m = re.search(r'(\d+(?:\.\d+)?)', line.strip())
        if m:
            return round(float(m.group(1)))
    return default

def clean(s):
    s = re.sub(r'[®™]', '', str(s))
    s = re.sub(r'\n', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    s = s.encode('ascii', 'replace').decode('ascii').replace('?', '').strip()
    s = re.sub(r'\s+', ' ', s).strip()
    return s

SECTION_SKIP = {
    '', 'nan', '!', 'kfc nutrition menu', 'limited time offers', 'beverages',
    'dipping sauces & condiments', 'd ipping sauces & condiments',
    'menu item', 'serving size (g)', 'kilojoules (kj)', 'calories (kcal)',
    'fresh burrito', 'crunchy taco supreme', 'cravings menu', 'build your own pizza',
    'ingredient nutrition per serving size', 'of 1/2 of pizza', 'of 1/3 of pizza',
    'of 1/4 of pizza', 'product name', 'bakery', 'hot food',
    'calories (kcal)', 'calories (kcal).', 'kilojoules (kj).', 'kilojoules (kj)',
    'crunchy taco supreme', 'fresh burrito', 'cravings menu', 'beverages',
    'hot drinks', 'cold drinks', 'desserts', 'sides', 'meal deals',
    'breakfast', 'snacks', 'of 1/2 of pizza', 'of 1/3 of pizza', 'of 1/4 of pizza',
}

results = {}

# ===================== KFC =====================
print("Processing KFC...")
tables = camelot.read_pdf('src/data/raw_pdfs/kfc_2026.pdf', flavor='stream', pages='all')
kfc_items = []
seen = set()
for t in tables:
    df = t.df
    ncols = len(df.columns)
    for _, row in df.iterrows():
        name = clean(row.iloc[0])
        nl = name.lower()
        if nl in SECTION_SKIP or len(name) <= 2:
            continue
        if any(x in nl for x in ['calories', 'total fat', 'saturated', 'cholesterol',
                                   'sodium', 'carbohydrate', 'protein (g)', 'dietary fiber',
                                   'serving size', 'nutrition']):
            continue
        if ncols >= 13:
            cal = safe_num(row.iloc[2])
            fat = safe_num(row.iloc[3])
            carbs = safe_num(row.iloc[8])
            prot = safe_num(row.iloc[12])
        else:  # 12 cols
            cal = safe_num(row.iloc[1])
            fat = safe_num(row.iloc[2])
            carbs = safe_num(row.iloc[7])
            prot = safe_num(row.iloc[11])
        if cal <= 0 or cal > 1500:
            continue
        key = nl
        if key not in seen:
            seen.add(key)
            kfc_items.append({'name': name, 'cal': cal, 'fat': fat, 'carbs': carbs, 'prot': prot})
results['KFC'] = kfc_items
print(f'  KFC: {len(kfc_items)} items')

# ===================== Taco Bell =====================
print("Processing Taco Bell...")
tables = camelot.read_pdf('src/data/raw_pdfs/tacobell_2026.pdf', flavor='stream', pages='all')
tb_items = []
seen = set()
for t in tables:
    df = t.df
    if len(df.columns) < 9:
        continue
    for _, row in df.iterrows():
        name = clean(row.iloc[0])
        nl = name.lower()
        if nl in SECTION_SKIP or len(name) <= 2:
            continue
        if any(x in nl for x in ['menu item', 'serving size', 'kilojoule', 'calorie', 'total fat',
                                   'crunchy taco supreme', 'fresh burrito', 'cravings menu',
                                   'bowls & burritos', 'tacos', 'quesadillas', 'nachos',
                                   'sides', 'desserts', 'drinks', 'combo meals', 'breakfast',
                                   'cravings box', 'build your own', 'proteins (g)', 'proteins',
                                   'sugars (g)', 'saturated fat', 'sodium']):
            continue
        # Col layout: 0=name, 1=serving(g), 2=kJ, 3=kcal, 4=fat, 5=sat_fat, 6=carbs, 7=sugar, 8=protein, 9=sodium
        cal = safe_num(row.iloc[3])
        fat = safe_num(row.iloc[4])
        carbs = safe_num(row.iloc[6])
        prot = safe_num(row.iloc[8])
        if cal <= 0 or cal > 1500:
            continue
        key = nl
        if key not in seen:
            seen.add(key)
            tb_items.append({'name': name, 'cal': cal, 'fat': fat, 'carbs': carbs, 'prot': prot})
results['Taco Bell'] = tb_items
print(f'  Taco Bell: {len(tb_items)} items')

# ===================== Starbucks =====================
print("Processing Starbucks...")
tables = camelot.read_pdf('src/data/raw_pdfs/starbucks_2026.pdf', flavor='stream', pages='1,2')
sbx_items = []
seen = set()
for t in tables:
    df = t.df
    for _, row in df.iterrows():
        if len(row) < 18:
            continue
        name = clean(row.iloc[0])
        nl = name.lower()
        if nl in SECTION_SKIP or len(name) <= 2:
            continue
        if any(x in nl for x in ['product name', 'serving size', 'energy', 'bakery',
                                   'hot food', 'cold drinks', 'hot drinks', 'frappuccino',
                                   'kcal', 'kj', 'fat (g)', 'protein (g)']):
            continue
        # Col: 0=name, 1=serving, 2=kJ, 3=?, 4=kcal, 5=?, 6=fat, 7=?, 8=sat_fat, 9=?, 10=carbs, 11=?, 12=sugar, 13=?, 14=fibre, 15=?, 16=protein, 17=?, 18=salt
        # Wait: row0 showed col5=Energy(Kcal), col7=Fat, col11=Carbs, col17=Protein
        # But row2 was: ['Butter Croissant', '58g', '1046', '', '250', '', '13', '', '9', '', '28', '', '4.4', '', '1.1', '', '4.8', '', '0.57', '']
        # col0=name, col2=kJ, col4=kcal, col6=fat, col8=sat_fat, col10=carbs, col12=sugar, col14=fibre, col16=protein, col18=salt
        cal = safe_num(row.iloc[4])
        fat = safe_num(row.iloc[6])
        carbs = safe_num(row.iloc[10])
        prot = safe_num(row.iloc[16])
        if cal <= 0 or cal > 1500:
            continue
        key = nl
        if key not in seen:
            seen.add(key)
            sbx_items.append({'name': name, 'cal': cal, 'fat': fat, 'carbs': carbs, 'prot': prot})
results['Starbucks'] = sbx_items
print(f'  Starbucks: {len(sbx_items)} items')

# ===================== Domino's =====================
print("Processing Dominos...")
tables = camelot.read_pdf('src/data/raw_pdfs/dominos_2026.pdf', flavor='stream', pages='all')
dom_items = []
seen = set()
DOM_SKIP = {
    'of 1/2 of pizza', 'of 1/3 of pizza', 'of 1/4 of pizza', 'of 1/6 of pizza', 'of 1/8 of pizza',
    'ingredient nutrition per serving size', 'weight (g)', 'calories', 'total fat',
    'serving size', '', 'nan', 'crust', 'sauce', 'cheese', 'toppings', 'meats', 'veggies',
    'build your own pizza',
}
for t in tables:
    df = t.df
    ncols = len(df.columns)
    if ncols < 13:
        continue
    for _, row in df.iterrows():
        name = clean(row.iloc[0])
        nl = name.lower()
        if nl in DOM_SKIP or len(name) <= 2:
            continue
        if any(x in nl for x in ['weight (g)', 'calories', 'total fat', 'serving size',
                                   'ingredient nutrition', 'specialty pizza',
                                   'of 1/', 'fiber', 'sodium', 'protein',
                                   'crust', 'sauce', 'cheese', 'meats', 'veggies',
                                   'build your own']):
            continue
        # Two formats:
        # 13-col (pizza crusts/toppings): col0=name, col1=weight, col2=cal, col3=fat, col8=carbs, col12=protein
        # 14-col (wings, breads, sandwiches): col0=name, col1=serving, col2=weight, col3=cal, col4=fat, col9=carbs, col13=protein
        if ncols >= 14:
            cal = safe_num(row.iloc[3])
            fat = safe_num(row.iloc[4])
            carbs = safe_num(row.iloc[9])
            prot = safe_num(row.iloc[13])
        else:  # 13 cols
            cal = safe_num(row.iloc[2])
            fat = safe_num(row.iloc[3])
            carbs = safe_num(row.iloc[8])
            prot = safe_num(row.iloc[12])
        if cal <= 0 or cal > 1200:
            continue
        key = nl
        if key not in seen:
            seen.add(key)
            dom_items.append({'name': name, 'cal': cal, 'fat': fat, 'carbs': carbs, 'prot': prot})
results["Domino's"] = dom_items
print(f'  Dominos: {len(dom_items)} items')

# ===================== Burger King =====================
# This is an Australian BK PDF. Table formats:
# 11-col tables (burgers/chicken): col0=name, col1=serving_g, col2=kJ, col3=kcal, col4=protein, col5=fat
# 12-col tables (beverages): col0=name, col1=size, col2=serving_g, col3=kJ, col4=kcal, col5=protein, col6=fat
print("Processing Burger King (Australian PDF - kJ conversion)...")
tables = camelot.read_pdf('src/data/raw_pdfs/burgerking_2026.pdf', flavor='stream', pages='all')
bk_items = []
seen = set()
for t in tables:
    df = t.df
    ncols = len(df.columns)
    if ncols < 6:
        continue
    # Skip allergen tables (they have Yes/No values)
    first_data = None
    for _, row in df.iterrows():
        if str(row.iloc[0]).strip() not in ('', 'nan', 'PRODUCT'):
            first_data = row
            break
    if first_data is not None and str(first_data.iloc[2]).strip().lower() in ('no', 'yes'):
        continue  # allergen table
    for _, row in df.iterrows():
        name = clean(row.iloc[0])
        nl = name.lower()
        if nl in SECTION_SKIP or len(name) <= 2:
            continue
        if any(x in nl for x in ['product', 'energy', 'protein (g)', 'fat (g)', 'sugar',
                                   'sat fat', 'saturated', 'sodium', 'per 100', 'kj per']):
            continue
        if re.match(r'^\d+$', name):
            continue
        # Detect format by checking whether col2 value is plausible as serving_g or kJ
        col2_val = safe_num(row.iloc[2])
        col3_val = safe_num(row.iloc[3])
        col4_val = safe_num(row.iloc[4]) if ncols > 4 else 0
        col5_val = safe_num(row.iloc[5]) if ncols > 5 else 0
        col6_val = safe_num(row.iloc[6]) if ncols > 6 else 0

        # Heuristic: if col3 is ~1/4 of col2, col2 is kJ and col3 is kcal (11-col format)
        # If col4 is ~1/4 of col3, col3 is kJ and col4 is kcal (12-col format)
        if col2_val > 0 and col3_val > 0 and 0.2 < (col3_val / col2_val) < 0.3:
            # 11-col format: col2=kJ, col3=kcal, col4=protein, col5=fat
            cal = col3_val
            prot = col4_val
            fat = col5_val
        elif col3_val > 0 and col4_val > 0 and 0.2 < (col4_val / col3_val) < 0.3:
            # 12-col format: col3=kJ, col4=kcal, col5=protein, col6=fat
            cal = col4_val
            prot = col5_val
            fat = col6_val
        elif col2_val > 500:
            # col2 is clearly kJ, convert
            cal = round(col2_val / 4.184)
            prot = col4_val
            fat = col5_val
        else:
            continue
        if cal <= 0 or cal > 1500:
            continue
        # Estimate carbs using: cal = 4*prot + 9*fat + 4*carbs => carbs = (cal - 4*prot - 9*fat) / 4
        carbs = max(0, round((cal - 4*prot - 9*fat) / 4))
        key = nl
        if key not in seen:
            seen.add(key)
            bk_items.append({'name': name, 'cal': cal, 'fat': fat, 'carbs': carbs, 'prot': prot})
results['Burger King'] = bk_items
print(f'  Burger King: {len(bk_items)} items (carbs estimated from macro math)')

# ===================== McDonald's =====================
print("Processing McDonald's (complex multi-row layout)...")
tables = camelot.read_pdf('src/data/raw_pdfs/mcdonalds_2026.pdf', flavor='stream', pages='all')
# McDonald's PDF: 23-col format, names split across rows
# Col layout: 0=item_name_part, 1=serving_size, 2=calories, 3=calories_from_fat,
#              4=total_fat, ..., 12=carbs, ..., 18=protein
# Known clean items (where name is on same row as calories):
mcd_items = []
seen = set()

# Manual reconstruction approach: collect (name_parts, data_row) pairs
for tidx, t in enumerate(tables):
    df = t.df
    if len(df.columns) < 19:
        continue
    name_buf = []
    for i, row in df.iterrows():
        name0 = clean(str(row.iloc[0]))
        n0l = name0.lower()
        # Skip header/category rows
        if n0l in ('', 'nan', 'nutrition facts', 'serving size', 'calories',
                   '% daily value', 'burgers & sandwiches', 'chicken & fish',
                   'salads', 'snacks & sides', 'beverages', 'mccafe', 'mccaf',
                   'desserts & shakes', 'breakfast', 'happy meal',
                   'extra value meals', 'limited time', 'sides', 'condiments',
                   'sauces', 'iron', 'calcium', 'vitamin a', 'vitamin c',
                   'dietary fiber', 'total fat', 'saturated fat', 'trans fat',
                   'cholesterol', 'sodium', 'sugars', 'protein', 'dipping sauces',
                   'we provide a nutrition analysis of our menu items to help you balance your'):
            name_buf = []
            continue
        try:
            cal = round(float(re.sub(r'[^\d.]', '', str(row.iloc[2]))))
        except:
            cal = 0
        try:
            fat = round(float(re.sub(r'[^\d.]', '', str(row.iloc[4]))))
        except:
            fat = 0
        try:
            carbs = round(float(re.sub(r'[^\d.]', '', str(row.iloc[12]))))
        except:
            carbs = 0
        try:
            prot = round(float(re.sub(r'[^\d.]', '', str(row.iloc[18]))))
        except:
            prot = 0
        if cal > 0 and 50 <= cal <= 1200:
            parts = name_buf + ([name0] if name0 and name0 != 'nan' else [])
            full = ' '.join(p for p in parts if p and p != 'nan').strip()
            full = re.sub(r'\s+', ' ', full)
            key = full.lower()
            if full and len(full) > 3 and key not in seen and len(full) < 80:
                seen.add(key)
                mcd_items.append({'name': full, 'cal': cal, 'fat': fat, 'carbs': carbs, 'prot': prot})
            name_buf = []
        elif name0 and name0 not in ('nan', ''):
            name_buf.append(name0)
results["McDonald's"] = mcd_items
print(f'  McDonald\'s: {len(mcd_items)} items (note: names may be partial due to multi-row PDF layout)')

# ===================== Save results =====================
with open('src/data/raw_pdfs/all_extracted.json', 'w', encoding='utf-8') as f:
    json.dump(results, f, indent=2)
print("\nSaved to all_extracted.json")

print("\n========== SUMMARY ==========")
for rest, items in results.items():
    if not items:
        print(f"{rest}: 0 items")
        continue
    top_picks = [i for i in items if i['cal'] > 0 and (i['prot']/i['cal'])*100 > 15]
    print(f"\n{rest}: {len(items)} total items, {len(top_picks)} top picks (density>15%)")
    if top_picks:
        for tp in sorted(top_picks, key=lambda x: -(x['prot']/x['cal']))[:5]:
            d = round((tp['prot']/tp['cal'])*100, 1)
            print(f"  [{d}%] {tp['name']}: p={tp['prot']}, c={tp['carbs']}, f={tp['fat']} ({tp['cal']}cal)")
