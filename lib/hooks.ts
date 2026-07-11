// TanStack Query hooks — the app's data layer. Every read/write goes through the
// typed API client (lib/api.ts); screens never touch supabase.from(). Query keys
// are [resource, ...params] so invalidation is precise. (NWE-114.)
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  CreateFavoriteInput,
  CreateFoodLogInput,
  CreateWorkoutSessionInput,
  FavoriteFood,
  FoodLog,
  FoodSearchResult,
  LogRecipeInput,
  Profile,
  RecentFood,
  Recipe,
  UpdateFoodLogInput,
  UpdateProfileInput,
  UpsertRecipeInput,
  WeightLog,
  WorkoutSession,
} from '@shared';

import { useSession } from '@/components/SessionProvider';
import { rpc, unwrap } from '@/lib/api';

// Hono RPC input args are typed as the full ValidationTargets union; we only ever
// pass the one relevant key (json/query/param). These assert the arg so response
// inference is preserved while the input side stays ergonomic. The API re-validates
// everything with the shared Zod schemas, so this is safe.
const arg = <T>(a: T): any => a;

interface DayTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

function useHasSession(): boolean {
  const { session } = useSession();
  return Boolean(session);
}

// ── Profile ────────────────────────────────────────────────────────────────
export function useProfile() {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['me'],
    queryFn: () => unwrap<Profile>(rpc.api.me.$get()),
    enabled: hasSession,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) =>
      unwrap<Profile>(rpc.api.me.$patch(arg({ json: input }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
}

// ── Weights ──────────────────────────────────────────────────────────────��─
export function useWeights(params?: { from?: string; to?: string }) {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['weights', params?.from ?? null, params?.to ?? null],
    queryFn: () =>
      unwrap<WeightLog[]>(
        rpc.api.weights.$get(arg({ query: { from: params?.from, to: params?.to } }))
      ),
    enabled: hasSession,
  });
}

export function useLatestWeight() {
  const q = useWeights();
  const latest = q.data && q.data.length > 0 ? q.data[q.data.length - 1] : null;
  return { ...q, latest };
}

export function useUpsertWeight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, weight_kg }: { date: string; weight_kg: number }) =>
      unwrap<WeightLog>(rpc.api.weights[':date'].$put(arg({ param: { date }, json: { weight_kg } }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['weights'] });
      qc.invalidateQueries({ queryKey: ['me'] }); // targets may recompute
    },
  });
}

// ── Food logs ────────────────────────────────────────────────────────────��─
export function useFoodLogs(date: string) {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['food-logs', date],
    queryFn: () => unwrap<FoodLog[]>(rpc.api['food-logs'].$get(arg({ query: { date } }))),
    enabled: hasSession,
  });
}

export function useDayTotals(date: string) {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['food-logs', 'totals', date],
    queryFn: () =>
      unwrap<DayTotals>(rpc.api['food-logs'].totals.$get(arg({ query: { date } }))),
    enabled: hasSession,
  });
}

export function useCreateFoodLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFoodLogInput) =>
      unwrap<FoodLog>(rpc.api['food-logs'].$post(arg({ json: input }))),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['food-logs', input.logged_on] });
      qc.invalidateQueries({ queryKey: ['food-logs', 'totals', input.logged_on] });
    },
  });
}

export function useUpdateFoodLog(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateFoodLogInput }) =>
      unwrap<FoodLog>(rpc.api['food-logs'][':id'].$patch(arg({ param: { id }, json: patch }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['food-logs', date] });
      qc.invalidateQueries({ queryKey: ['food-logs', 'totals', date] });
    },
  });
}

export function useDeleteFoodLog(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap<{ id: string }>(rpc.api['food-logs'][':id'].$delete(arg({ param: { id } }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['food-logs', date] });
      qc.invalidateQueries({ queryKey: ['food-logs', 'totals', date] });
    },
  });
}

// ── Foods search ────────────────────────────────────────────────────────────
export function useFoodSearch(query: string) {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['foods', 'search', query],
    queryFn: () =>
      unwrap<FoodSearchResult[]>(rpc.api.foods.search.$get(arg({ query: { q: query } }))),
    enabled: hasSession && query.trim().length >= 3,
  });
}

// ── Recipes (NWE-202) ────────────────────────────────────────────────────────
export function useRecipes() {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['recipes'],
    queryFn: () => unwrap<Recipe[]>(rpc.api.recipes.$get()),
    enabled: hasSession,
  });
}

export function useCreateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertRecipeInput) =>
      unwrap<Recipe>(rpc.api.recipes.$post(arg({ json: input }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipes'] }),
  });
}

export function useUpdateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpsertRecipeInput }) =>
      unwrap<Recipe>(rpc.api.recipes[':id'].$put(arg({ param: { id }, json: input }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipes'] }),
  });
}

export function useDeleteRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap<{ id: string }>(rpc.api.recipes[':id'].$delete(arg({ param: { id } }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipes'] }),
  });
}

export function useLogRecipe(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: LogRecipeInput }) =>
      unwrap<FoodLog>(rpc.api.recipes[':id'].log.$post(arg({ param: { id }, json: input }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['food-logs', date] });
      qc.invalidateQueries({ queryKey: ['food-logs', 'totals', date] });
    },
  });
}

// ── Water (NWE-203) ──────────────────────────────────────────────────────────
export function useWater(date: string) {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['water', date],
    queryFn: () => unwrap<{ total_ml: number }>(rpc.api.water.$get(arg({ query: { date } }))),
    enabled: hasSession,
  });
}

export function useAddWater(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ml: number) =>
      unwrap<unknown>(rpc.api.water.$post(arg({ json: { ml, logged_on: date } }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['water', date] }),
  });
}

export function useUndoWater(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap<{ removed: string | null }>(rpc.api.water.last.$delete(arg({ query: { date } }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['water', date] }),
  });
}

// ── Favorites & recents (NWE-201) ────────────────────────────────────────────
export function useFavorites() {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['favorites'],
    queryFn: () => unwrap<FavoriteFood[]>(rpc.api.favorites.$get()),
    enabled: hasSession,
  });
}

export function useRecentFoods() {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['foods', 'recent'],
    queryFn: () => unwrap<RecentFood[]>(rpc.api.foods.recent.$get()),
    enabled: hasSession,
  });
}

export function useAddFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFavoriteInput) =>
      unwrap<FavoriteFood>(rpc.api.favorites.$post(arg({ json: input }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['favorites'] }),
  });
}

export function useRemoveFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap<{ id: string }>(rpc.api.favorites[':id'].$delete(arg({ param: { id } }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['favorites'] }),
  });
}

// ── Workouts ─────────────────────────────────────────────────────────────────
export function useWorkouts(params?: { from?: string; to?: string }) {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['workouts', params?.from ?? null, params?.to ?? null],
    queryFn: () =>
      unwrap<WorkoutSession[]>(
        rpc.api.workouts.$get(arg({ query: { from: params?.from, to: params?.to } }))
      ),
    enabled: hasSession,
  });
}

export function useCreateWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkoutSessionInput) =>
      unwrap<WorkoutSession>(rpc.api.workouts.$post(arg({ json: input }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workouts'] }),
  });
}

export function useDeleteWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap<{ id: string }>(rpc.api.workouts[':id'].$delete(arg({ param: { id } }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workouts'] }),
  });
}

// ── Account lifecycle (NWE-117) ──────────────────────────────────────────────
interface ExportBundle {
  exported_at: string;
  user_id: string;
  tables: Record<string, unknown[]>;
}

export function useExportData() {
  return useMutation({
    mutationFn: () => unwrap<ExportBundle>(rpc.api.me.export.$get()),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (newPassword: string) =>
      unwrap<{ ok: boolean }>(
        rpc.api.me['change-password'].$post(arg({ json: { new_password: newPassword } }))
      ),
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: () => unwrap<{ deleted: boolean }>(rpc.api.me.$delete()),
  });
}
