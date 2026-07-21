// @nwe/shared — cross-runtime domain package.
//
// Imported by BOTH runtimes:
//   • the Expo app (Metro/Babel) via the `@shared` path alias (tsconfig + metro.config.js)
//   • the Hono API (Deno) via `supabase/functions/_shared/index.ts`
//
// Everything here MUST be pure and runtime-agnostic: no React Native, no Deno,
// no Node built-ins — only portable TypeScript + Zod.

export * from './proof.ts';
export * from './types.ts';
export * from './nutrition.ts';
export * from './envelope.ts';
export * from './contracts.ts';
export * from './foodMath.ts';
export * from './recipeMath.ts';
export * from './programMath.ts';
export * from './mealPlanMath.ts';
export * from './workoutAnalytics.ts';
export * from './insights.ts';
export * from './gamification.ts';
export * from './notifications.ts';
export * from './trainingDetectors.ts';
