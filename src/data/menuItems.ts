import { Macros, MenuItem } from '../utils/engine';
import { CHIPOTLE } from './chipotleData';

export type { MenuItem };

export const CHICK_FIL_A: MenuItem[] = [
  {
    name: 'Grilled Cool Wrap',
    restaurant: 'Chick-fil-A',
    macros: { protein: 43, carbs: 32, fat: 14 },
  },
  {
    name: '12ct Grilled Nuggets',
    restaurant: 'Chick-fil-A',
    macros: { protein: 38, carbs: 2, fat: 6 },
  },
  {
    name: 'Cobb Salad w/ Grilled Chicken',
    restaurant: 'Chick-fil-A',
    macros: { protein: 40, carbs: 22, fat: 20 },
  },
];

export const WINGSTOP: MenuItem[] = [
  {
    name: '6pc Lemon Pepper Wings (Bone-In)',
    restaurant: 'Wingstop',
    macros: { protein: 60, carbs: 0, fat: 48 },
  },
  {
    name: '6pc Garlic Parmesan (Boneless)',
    restaurant: 'Wingstop',
    macros: { protein: 30, carbs: 42, fat: 42 },
  },
  {
    name: 'Voodoo Fries',
    restaurant: 'Wingstop',
    macros: { protein: 9, carbs: 55, fat: 29 },
  },
];

export const WHATABURGER: MenuItem[] = [
  {
    name: 'Whataburger (No Bun)',
    restaurant: 'Whataburger',
    macros: { protein: 25, carbs: 8, fat: 32 },
  },
  {
    name: 'Grilled Chicken Sandwich',
    restaurant: 'Whataburger',
    macros: { protein: 32, carbs: 49, fat: 8 },
  },
  {
    name: "Whatachick'n Strips (3pc)",
    restaurant: 'Whataburger',
    macros: { protein: 25, carbs: 22, fat: 14 },
  },
];

export const ALL_ITEMS: MenuItem[] = [...CHICK_FIL_A, ...WINGSTOP, ...WHATABURGER, ...CHIPOTLE];
