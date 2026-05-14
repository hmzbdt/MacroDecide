#!/usr/bin/env python3
"""
pdf_harvester.py — Extract nutrition tables from restaurant PDF menus
and output structured JSON compatible with src/data/verifiedMenus.js

Install deps:
    pip install "camelot-py[cv]" pandas

Usage:
    python scripts/pdf_harvester.py <pdf_path> [options]

Options:
    --restaurant  Restaurant name (default: inferred from filename)
    --output      Output JSON file path (default: stdout)
    --js          Also emit a copy-paste JS snippet for verifiedMenus.js
    --flavor      camelot flavor: 'cv' (image-based) | 'stream' (text-based PDF)
    --pages       Page range, e.g. '1-3,5' (default: all)

Examples:
    python scripts/pdf_harvester.py chipotle_nutrition.pdf --restaurant "Chipotle"
    python scripts/pdf_harvester.py menu.pdf --flavor stream --js --output out.json
"""

import sys
import os
import re
import json
import argparse
import logging

import pandas as pd

try:
    import camelot
except ImportError:
    sys.exit('camelot-py[cv] is required. Run: pip install "camelot-py[cv]"')

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)

# ── Column alias tables ────────────────────────────────────────────────────────
COLUMN_ALIASES: dict[str, list[str]] = {
    "item_name": [
        "item name", "item", "name", "food", "menu item",
        "description", "food item", "product", "serving",
    ],
    "calories": [
        "calories", "cal", "cals", "energy", "kcal",
        "total calories", "calories (kcal)",
    ],
    "protein": [
        "protein", "prot", "pro",
        "protein (g)", "protein(g)", "protein g",
    ],
    "carbohydrates": [
        "carbohydrates", "carbs", "carb",
        "total carbs", "total carbohydrates",
        "carbohydrate", "total carbohydrate",
        "carbs (g)", "carbohydrates (g)", "carbohydrate (g)",
        "carbohydrates(g)", "total carbs (g)",
    ],
    "total_fat": [
        "total fat", "fat", "lipids",
        "fat (g)", "total fat (g)", "fat(g)", "fats",
    ],
}

# ── Category keyword buckets ───────────────────────────────────────────────────
_PROTEIN_KW = {
    "chicken", "steak", "beef", "fish", "salmon", "turkey", "shrimp",
    "pork", "egg", "nugget", "burger", "grilled", "patty", "carnitas",
    "barbacoa", "sofritas", "brisket", "tuna", "tilapia", "cod",
    "wing", "breast", "thigh", "drumstick", "tender", "strip", "pollo",
    "chorizo", "bacon", "ham", "sausage",
}
_BASE_KW = {
    "rice", "bread", "bun", "wrap", "tortilla", "lettuce", "greens",
    "naan", "pita", "pasta", "noodle", "bowl base", "quinoa", "farro",
    "supergreens", "romaine",
}
_ADDON_KW = {
    "bean", "salsa", "sauce", "dressing", "cheese", "guac", "fry", "fries",
    "salad", "fruit", "drink", "soda", "juice", "water", "tea", "coffee",
    "cookie", "dessert", "ice cream", "shake", "soup", "side", "onion ring",
    "corn", "sour cream", "queso", "chips", "cookie", "brownie",
}


# ── Helpers ────────────────────────────────────────────────────────────────────

def slugify(text: str, max_len: int = 28) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", "", text)
    text = re.sub(r"\s+", "_", text.strip())
    return text[:max_len]


def safe_float(val) -> float | None:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    cleaned = re.sub(r"[^\d.]", "", str(val))
    try:
        return float(cleaned) if cleaned else None
    except ValueError:
        return None


def find_header_row(df: pd.DataFrame) -> int:
    """
    Return the index of the row most likely to be the column header.
    Scores each row by how many cells match any known alias.
    """
    all_aliases = {alias for aliases in COLUMN_ALIASES.values() for alias in aliases}
    best_row, best_score = 0, 0
    for i, row in df.iterrows():
        score = sum(
            1 for cell in row
            if isinstance(cell, str) and cell.lower().strip() in all_aliases
        )
        if score > best_score:
            best_score, best_row = score, i
    return best_row


def fuzzy_match_columns(df: pd.DataFrame) -> dict[str, str] | None:
    """
    Map canonical field names to actual DataFrame column names.
    Returns None when item_name or calories cannot be resolved.
    """
    cols_lower = {col: str(col).lower().strip() for col in df.columns}
    mapping: dict[str, str] = {}

    for canonical, aliases in COLUMN_ALIASES.items():
        for actual_col, lower_col in cols_lower.items():
            # Exact match first; then whole-word search to prevent "calcium" → "calories"
            if lower_col in aliases or any(
                re.search(r'\b' + re.escape(a) + r'\b', lower_col) for a in aliases
            ):
                if canonical not in mapping:
                    mapping[canonical] = actual_col
                    break

    if not {"item_name", "calories"}.issubset(mapping):
        return None
    return mapping


def infer_category(name: str, protein_density: float) -> tuple[str, bool]:
    """Return (category, isMandatory)."""
    lower = name.lower()
    if any(k in lower for k in _BASE_KW):
        return "base", False
    if any(k in lower for k in _ADDON_KW):
        return "addon", False
    if any(k in lower for k in _PROTEIN_KW) or protein_density > 15:
        return "protein", protein_density > 15
    return "addon", False


# ── Core extraction ────────────────────────────────────────────────────────────

def process_table(raw_df: pd.DataFrame, restaurant_prefix: str) -> list[dict]:
    """Extract validated nutrition rows from one camelot table DataFrame."""
    df = raw_df.dropna(how="all").reset_index(drop=True)
    if df.empty:
        return []

    # Promote the best header row to column names
    header_idx = find_header_row(df)
    df.columns = [str(c).strip() for c in df.iloc[header_idx]]
    df = df.iloc[header_idx + 1:].reset_index(drop=True)
    df = df.dropna(how="all")

    mapping = fuzzy_match_columns(df)
    if mapping is None:
        log.warning("  Table skipped — could not map required columns (item_name, calories).")
        return []

    log.info("  Column mapping: %s", mapping)

    items: list[dict] = []
    for _, row in df.iterrows():
        name_raw = str(row.get(mapping["item_name"], "")).strip()
        # Skip blank rows and rows that look like sub-headers
        if not name_raw or name_raw.lower() in ("nan", "", "item", "item name", "food", "name"):
            continue

        cal   = safe_float(row.get(mapping.get("calories")))
        prot  = safe_float(row.get(mapping.get("protein")))
        carbs = safe_float(row.get(mapping.get("carbohydrates")))
        fat   = safe_float(row.get(mapping.get("total_fat")))

        if cal is None or cal == 0:
            log.debug("  Skipping '%s' — missing or zero calories.", name_raw)
            continue

        prot_g  = round(prot  or 0)
        carbs_g = round(carbs or 0)
        fat_g   = round(fat   or 0)
        cal_i   = round(cal)

        protein_density = round((prot_g / cal_i) * 100, 1)
        category, is_mandatory = infer_category(name_raw, protein_density)
        is_top_pick = protein_density > 15

        items.append({
            "id":             f"{restaurant_prefix}_{slugify(name_raw)}",
            "name":           name_raw,
            "category":       category,
            "isMandatory":    is_mandatory,
            "protein":        prot_g,
            "carbs":          carbs_g,
            "fat":            fat_g,
            "calories":       cal_i,
            "proteinDensity": protein_density,
            "isTopPick":      is_top_pick,
            "low_priority":   prot_g < 12,
            "isAIResult":     False,
            "dataSource":     "verified",
        })

    return items


def build_output(restaurant: str, all_items: list[dict]) -> dict:
    """Deduplicate, sort, and wrap items into the final output structure."""
    seen: set[str] = set()
    unique: list[dict] = []
    for item in all_items:
        key = item["name"].lower()
        if key not in seen:
            seen.add(key)
            unique.append(item)

    top_picks = [i for i in unique if i["isTopPick"]]
    others    = [i for i in unique if not i["isTopPick"]]

    sorted_items = (
        sorted(top_picks, key=lambda x: -x["proteinDensity"])
        + sorted(others,  key=lambda x: -x["proteinDensity"])
    )

    avg_density = (
        round(sum(i["proteinDensity"] for i in sorted_items) / len(sorted_items), 1)
        if sorted_items else 0
    )

    return {
        "restaurant": restaurant,
        "summary": {
            "totalItems":         len(sorted_items),
            "topPickCount":       len(top_picks),
            "avgProteinDensity":  avg_density,
        },
        "topPicks": [i["name"] for i in top_picks],
        "items":    sorted_items,
    }


def emit_js_snippet(data: dict) -> str:
    """
    Emit a copy-paste JS block ready for src/data/verifiedMenus.js.
    Fields that verifiedMenus.js v() helper expects:
      v(id, name, category, isMandatory, protein, carbs, fat)
    """
    restaurant = data["restaurant"]
    lines = [
        f"  // Auto-harvested via pdf_harvester.py — verify values before shipping",
        f"  '{restaurant}': [",
    ]
    for item in data["items"]:
        top_tag = "  // TOP PICK" if item["isTopPick"] else ""
        lines.append(
            f"    v('{item['id']}', "
            f"'{item['name']}', "
            f"'{item['category']}', "
            f"{'true' if item['isMandatory'] else 'false'}, "
            f"{item['protein']}, "
            f"{item['carbs']}, "
            f"{item['fat']}, "
            f"{'true' if item.get('low_priority') else 'false'}),{top_tag}"
        )
    lines.append("  ],")
    return "\n".join(lines)


# ── Entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Harvest nutrition tables from a restaurant PDF.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("pdf", help="Path to the PDF file")
    parser.add_argument("--restaurant", "-r", default=None,
                        help="Restaurant name (default: inferred from filename)")
    parser.add_argument("--output", "-o", default=None,
                        help="Output JSON file (default: stdout)")
    parser.add_argument("--js", action="store_true",
                        help="Also write a JS snippet file for verifiedMenus.js")
    parser.add_argument("--flavor", choices=["cv", "stream"], default="cv",
                        help="camelot flavor — 'cv' for scanned/image PDFs, "
                             "'stream' for digital text PDFs (default: cv)")
    parser.add_argument("--pages", default="all",
                        help="Pages to parse, e.g. '1-3,5' (default: all)")
    args = parser.parse_args()

    if not os.path.isfile(args.pdf):
        sys.exit(f"Error: file not found — {args.pdf}")

    restaurant = (
        args.restaurant
        or os.path.splitext(os.path.basename(args.pdf))[0]
           .replace("_", " ").replace("-", " ").title()
    )
    # Short prefix for IDs, e.g. "Chick-fil-A" → "chic"
    prefix = re.sub(r"[^a-z0-9]", "", restaurant.lower())[:4]

    log.info("Restaurant : %s (prefix='%s')", restaurant, prefix)
    log.info("PDF        : %s", args.pdf)
    log.info("Flavor     : %s | Pages: %s", args.flavor, args.pages)

    try:
        tables = camelot.read_pdf(args.pdf, flavor=args.flavor, pages=args.pages)
    except Exception as exc:
        sys.exit(f"camelot extraction failed: {exc}")

    log.info("Found %d table(s).", len(tables))

    all_items: list[dict] = []
    for idx, table in enumerate(tables):
        log.info("Table %d/%d — accuracy=%.1f%%", idx + 1, len(tables), table.accuracy)
        rows = process_table(table.df, prefix)
        log.info("  → %d usable rows.", len(rows))
        all_items.extend(rows)

    if not all_items:
        sys.exit(
            "No usable nutrition rows found.\n"
            "Tip: try --flavor stream for digital/text-based PDFs."
        )

    output = build_output(restaurant, all_items)

    # ── JSON output ────────────────────────────────────────────────────────────
    json_str = json.dumps(output, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(json_str)
        log.info("JSON written → %s", args.output)
    else:
        print(json_str)

    # ── JS snippet ─────────────────────────────────────────────────────────────
    if args.js:
        base = (args.output or args.pdf).rsplit(".", 1)[0]
        js_path = base + "_snippet.js"
        with open(js_path, "w", encoding="utf-8") as f:
            f.write(emit_js_snippet(output))
        log.info("JS snippet → %s", js_path)

    # ── Summary ────────────────────────────────────────────────────────────────
    s = output["summary"]
    log.info(
        "Done. %d items extracted | %d top picks (proteinDensity > 15) | avg density %.1f%%",
        s["totalItems"], s["topPickCount"], s["avgProteinDensity"],
    )


if __name__ == "__main__":
    main()
