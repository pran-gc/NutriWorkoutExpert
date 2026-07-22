/** One model resolution path prevents chat, proposals, and generators drifting apart. */
export function interactionModel(get = (name: string) => Deno.env.get(name)): string {
  return get('GEMINI_INTERACTIONS_MODEL') ?? get('GEMINI_MODEL') ?? 'gemini-3.5-flash';
}
