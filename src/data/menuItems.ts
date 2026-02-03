import { Macros } from '../utils/engine';

export interface MenuItem {
  name: string;
  macros: Macros;
}

export const CHICK_FIL_A: MenuItem[] = [
  {
    name: 'Grilled Cool Wrap',
    macros: { protein: 43, carbs: 32, fat: 14 },
  },
  {
    name: '12ct Grilled Nuggets',
    macros: { protein: 38, carbs: 2, fat: 6 },
  },
  {
    name: 'Cobb Salad w/ Grilled Chicken',
    macros: { protein: 40, carbs: 22, fat: 20 },
  },
];
