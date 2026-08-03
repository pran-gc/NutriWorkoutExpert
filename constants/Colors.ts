const tintColorLight = '#2f95dc';
const tintColorDark = '#fff';

/**
 * Brand constants shared across screens. Lift a color here (instead of copy-pasting
 * a hex) the moment more than one file needs it (components/CLAUDE.md rule).
 */
export const Brand = {
  accent: '#16a34a', // primary green (buttons, chips, links)
  destructive: '#dc2626', // delete / sign-out
  // Macro colors (also protein == destructive red by design)
  protein: '#dc2626',
  // Darkened from amber-500 so chart strokes clear 3:1 on both white and black.
  carbs: '#b45309',
  fat: '#3b82f6',
  water: '#3b82f6',
} as const;

export default {
  light: {
    text: '#000',
    background: '#fff',
    tint: tintColorLight,
    tabIconDefault: '#ccc',
    tabIconSelected: tintColorLight,
    // Input affordances derived per-theme so text is readable in BOTH modes (NWE-101).
    inputText: '#111',
    inputPlaceholder: '#9ca3af',
    inputBorder: '#c7c7cc',
    inputBackground: 'rgba(0,0,0,0.02)',
    surface: '#f5f5f7',
    glassTint: 'rgba(245,245,247,0.78)',
    accentText: '#15803d',
    destructiveText: '#b91c1c',
  },
  dark: {
    text: '#fff',
    background: '#000',
    tint: tintColorDark,
    tabIconDefault: '#ccc',
    tabIconSelected: tintColorDark,
    inputText: '#f2f2f7',
    inputPlaceholder: '#8e8e93',
    inputBorder: '#48484a',
    inputBackground: 'rgba(255,255,255,0.04)',
    surface: '#121214',
    glassTint: 'rgba(18,18,20,0.82)',
    accentText: '#4ade80',
    destructiveText: '#ff6961',
  },
};
