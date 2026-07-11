/**
 * NWE-110 cross-runtime proof: a single pure function executed from BOTH
 * the Expo app (Metro) and a Deno edge function, proving `packages/shared`
 * imports work in both runtimes. NWE-112 replaces this with the real domain code.
 */
export function sharedGreeting(runtime: string): string {
  return `@nwe/shared is alive in ${runtime}`;
}
