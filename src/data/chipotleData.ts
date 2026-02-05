import { Macros, MenuItem } from '../utils/engine';

interface Base {
  name: string;
  macros: Macros;
}

interface Modifier {
  name: string;
  macros: Macros;
}

// Bases: Protein + Supergreens only (no rice, no beans, no extras)
const BASES: Base[] = [
  { name: 'Chicken Bowl', macros: { protein: 33, carbs: 4, fat: 6 } },
  { name: 'Steak Bowl', macros: { protein: 31, carbs: 5, fat: 7 } },
  { name: 'Barbacoa Bowl', macros: { protein: 25, carbs: 5, fat: 7 } },
];

// Modifiers: add-ons that stack onto a base
const MODIFIERS: Record<string, Modifier> = {
  doubleMeat: { name: 'Double Meat', macros: { protein: 32, carbs: 0, fat: 12 } },
  guac: { name: 'Guacamole', macros: { protein: 2, carbs: 8, fat: 22 } },
  beans: { name: 'Black Beans', macros: { protein: 7, carbs: 22, fat: 1 } },
};

// Combinations to generate — each is [baseIndex, ...modifierKeys]
const COMBOS: [number, ...string[]][] = [
  [0, 'doubleMeat', 'beans'],  // Chicken + Double Meat + Beans
  [0, 'doubleMeat', 'guac'],   // Chicken + Double Meat + Guac
  [0, 'doubleMeat'],           // Chicken + Double Meat
  [1, 'doubleMeat', 'beans'],  // Steak + Double Meat + Beans
  [2, 'doubleMeat', 'guac'],   // Barbacoa + Double Meat + Guac
];

function buildCombo(baseIndex: number, modifierKeys: string[]): MenuItem {
  const base = BASES[baseIndex];
  const mods = modifierKeys.map((k) => MODIFIERS[k]);

  const macros: Macros = {
    protein: base.macros.protein,
    carbs: base.macros.carbs,
    fat: base.macros.fat,
  };

  mods.forEach((m) => {
    macros.protein += m.macros.protein;
    macros.carbs += m.macros.carbs;
    macros.fat += m.macros.fat;
  });

  const modNames = mods.map((m) => m.name).join(' + ');
  const name = `${base.name} — ${modNames}`;

  return { name, restaurant: 'Chipotle', macros };
}

export const CHIPOTLE: MenuItem[] = COMBOS.map(([baseIndex, ...modifierKeys]) =>
  buildCombo(baseIndex, modifierKeys)
);
