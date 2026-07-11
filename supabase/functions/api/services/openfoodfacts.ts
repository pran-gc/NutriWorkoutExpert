// Open Food Facts search, proxied server-side (docs/api.md "Third-party proxying").
// The app never calls OFF directly — it goes through GET /foods/search. Sets a
// proper User-Agent and maps upstream failure to UPSTREAM_ERROR. (NWE-114 AC#4:
// absorbs the old lib/food-api.ts.)
import type { FoodSearchResult } from '../../_shared/index.ts';
import { HttpError } from '../middleware/error.ts';

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

export async function searchFoods(query: string): Promise<FoodSearchResult[]> {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '25',
    fields: 'code,product_name,brands,nutriments',
  });

  let res: Response;
  try {
    res = await fetch(`${SEARCH_URL}?${params.toString()}`, {
      headers: { 'User-Agent': 'NutriWorkoutExpert/1.0 (personal project)' },
    });
  } catch {
    throw new HttpError('UPSTREAM_ERROR', 'Food database is unreachable right now.');
  }
  if (!res.ok) {
    throw new HttpError('UPSTREAM_ERROR', `Food search failed (${res.status}).`);
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
