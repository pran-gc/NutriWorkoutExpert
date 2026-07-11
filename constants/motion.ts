export const Motion = {
  duration: {
    fast: 140,
    normal: 220,
    hero: 520,
  },
  scale: {
    press: 0.97,
    pop: 1.06,
  },
  easing: {
    standard: 'easeOut',
    celebratory: 'spring',
  },
} as const;

export type CelebrationKind = 'quest' | 'badge' | 'streak' | 'ring' | 'pr';
