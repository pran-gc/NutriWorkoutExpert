import type { FoodSearchResult } from '@/lib/types';

const SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';

interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  nutriments?: {
    'energy-kcal_100g'?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
  };
}

/**
 * Search the free Open Food Facts database. Values are per 100 g.
 * Results without a name or calorie data are dropped.
 */
export async function searchFoods(query: string, signal?: AbortSignal): Promise<FoodSearchResult[]> {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '25',
    fields: 'code,product_name,brands,nutriments',
  });

  const res = await fetch(`${SEARCH_URL}?${params.toString()}`, {
    signal,
    headers: { 'User-Agent': 'NutriWorkoutExpert/0.1 (personal project)' },
  });
  if (!res.ok) {
    throw new Error(`Food search failed (${res.status})`);
  }

  const data = (await res.json()) as { products?: OffProduct[] };
  const results: FoodSearchResult[] = [];
  for (const p of data.products ?? []) {
    const name = p.product_name?.trim();
    const kcal = p.nutriments?.['energy-kcal_100g'];
    if (!name || typeof kcal !== 'number') continue;
    results.push({
      id: p.code ?? name,
      name,
      brand: p.brands?.split(',')[0]?.trim() || null,
      caloriesPer100g: kcal,
      proteinPer100g: p.nutriments?.proteins_100g ?? 0,
      carbsPer100g: p.nutriments?.carbohydrates_100g ?? 0,
      fatPer100g: p.nutriments?.fat_100g ?? 0,
    });
  }
  return results;
}
