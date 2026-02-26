import { Macros, MenuItem } from '../utils/engine';
import { CHIPOTLE } from './chipotleData';

export type { MenuItem };

export const CHICK_FIL_A: MenuItem[] = [
  {
    name: 'Grilled Cool Wrap',
    restaurant: 'Chick-fil-A',
    macros: { protein: 43, carbs: 32, fat: 14 },
    imageUrl: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=400&h=300&fit=crop',
  },
  {
    name: '12ct Grilled Nuggets',
    restaurant: 'Chick-fil-A',
    macros: { protein: 38, carbs: 2, fat: 6 },
    imageUrl: 'https://images.unsplash.com/photo-1562967914-608f82629710?w=400&h=300&fit=crop',
  },
  {
    name: 'Cobb Salad w/ Grilled Chicken',
    restaurant: 'Chick-fil-A',
    macros: { protein: 40, carbs: 22, fat: 20 },
    imageUrl: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=300&fit=crop',
  },
];

export const WINGSTOP: MenuItem[] = [
  {
    name: '6pc Lemon Pepper Wings (Bone-In)',
    restaurant: 'Wingstop',
    macros: { protein: 60, carbs: 0, fat: 48 },
    imageUrl: 'https://images.unsplash.com/photo-1527477396000-e27163b60a4f?w=400&h=300&fit=crop',
  },
  {
    name: '6pc Garlic Parmesan (Boneless)',
    restaurant: 'Wingstop',
    macros: { protein: 30, carbs: 42, fat: 42 },
    imageUrl: 'https://images.unsplash.com/photo-1569058242567-93de6f36f8e6?w=400&h=300&fit=crop',
  },
  {
    name: 'Voodoo Fries',
    restaurant: 'Wingstop',
    macros: { protein: 9, carbs: 55, fat: 29 },
    imageUrl: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&h=300&fit=crop',
  },
];

export const WHATABURGER: MenuItem[] = [
  {
    name: 'Whataburger (No Bun)',
    restaurant: 'Whataburger',
    macros: { protein: 25, carbs: 8, fat: 32 },
    imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop',
  },
  {
    name: 'Grilled Chicken Sandwich',
    restaurant: 'Whataburger',
    macros: { protein: 32, carbs: 49, fat: 8 },
    imageUrl: 'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=400&h=300&fit=crop',
  },
  {
    name: "Whatachick'n Strips (3pc)",
    restaurant: 'Whataburger',
    macros: { protein: 25, carbs: 22, fat: 14 },
    imageUrl: 'https://images.unsplash.com/photo-1562967916-eb82221dfb44?w=400&h=300&fit=crop',
  },
];

export const ALL_ITEMS: MenuItem[] = [...CHICK_FIL_A, ...WINGSTOP, ...WHATABURGER, ...CHIPOTLE];
