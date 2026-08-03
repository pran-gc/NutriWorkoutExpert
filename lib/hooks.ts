// TanStack Query hooks — the app's data layer. Every read/write goes through the
// typed API client (lib/api.ts); screens never touch supabase.from(). Query keys
// are [resource, ...params] so invalidation is precise. (NWE-114.)
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  MealPlan,
  CreateFavoriteInput,
  CreateExerciseInput,
  CreateFoodLogInput,
  CreateWorkoutSessionInput,
  EarnedBadge,
  Exercise,
  FavoriteFood,
  FoodLog,
  FoodSearchResult,
  GenerateInsightInput,
  GeneratedProgram,
  Insight,
  NotificationPrefs,
  AiConsent,
  AiMealCandidate,
  ApplyCouncilProposalInput,
  AnalyzeFoodPhotoInput,
  AnalyzePhysiqueInput,
  ResolvedIngredient,
  ResolveFoodInput,
  RoutineDiff,
  SaveGeneratedProgramInput,
  RegisterPushTokenInput,
  LogRecipeInput,
  Profile,
  RecentFood,
  Recipe,
  Routine,
  UpsertRoutineInput,
  UpdateWorkoutSessionInput,
  UpdateFoodLogInput,
  UpdateProfileInput,
  UpsertRecipeInput,
  WeightLog,
  WeeklySummary,
  WorkoutSession,
  AssistantThread,
  AssistantThreadSummary,
  AssistantProposal,
  ingredientMicronutrientTotals,
  goalProjection,
} from '@shared';

/** Response shape of GET /analytics/goal (see routes/analytics.ts). */
interface GoalAnalytics {
  projection: ReturnType<typeof goalProjection>;
  weights: WeightLog[];
}

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
  micronutrients?: ReturnType<typeof ingredientMicronutrientTotals>;
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workouts'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}

export function useUpdateWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateWorkoutSessionInput }) =>
      unwrap<WorkoutSession>(rpc.api.workouts[':id'].$patch(arg({ param: { id }, json: input }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workouts'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}

export function useDeleteWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap<{ id: string }>(rpc.api.workouts[':id'].$delete(arg({ param: { id } }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workouts'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}

// ── Exercises (NWE-301/303) ────────────────────────────────────────────────
export function useExercises(q = '') {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['exercises', q],
    queryFn: () => unwrap<(Exercise & { recent_at?: string | null })[]>(rpc.api.exercises.$get(arg({ query: { q } }))),
    enabled: hasSession,
  });
}

export function useCreateExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExerciseInput) =>
      unwrap<Exercise>(rpc.api.exercises.$post(arg({ json: input }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exercises'] }),
  });
}

export function useExerciseHistory(id: string | null, range: '30' | '90' | 'all' = '90') {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['exercises', id, 'history', range],
    queryFn: () =>
      unwrap<{ logged_on: string; best_e1rm: number; volume: number; summary: string }[]>(
        rpc.api.exercises[':id'].history.$get(arg({ param: { id }, query: { range } }))
      ),
    enabled: hasSession && Boolean(id),
  });
}

// ── Routines (NWE-302) ─────────────────────────────────────────────────────
export function useRoutines() {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['routines'],
    queryFn: () => unwrap<Routine[]>(rpc.api.routines.$get()),
    enabled: hasSession,
  });
}

export function useCreateRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertRoutineInput) =>
      unwrap<Routine>(rpc.api.routines.$post(arg({ json: input }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routines'] }),
  });
}

export function useUpdateRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpsertRoutineInput }) =>
      unwrap<Routine>(rpc.api.routines[':id'].$put(arg({ param: { id }, json: input }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routines'] }),
  });
}

export function useDeleteRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap<{ id: string }>(rpc.api.routines[':id'].$delete(arg({ param: { id } }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routines'] }),
  });
}

export function useRoutinePrefill(id: string | null) {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['routines', id, 'prefill'],
    queryFn: () =>
      unwrap<{ routine: Routine; exercises: any[] }>(
        rpc.api.routines[':id'].prefill.$get(arg({ param: { id } }))
      ),
    enabled: hasSession && Boolean(id),
  });
}

// ── Analytics (NWE-407/408/409) ────────────────────────────────────────────
export function useFoodAnalytics(params: { from: string; to: string }) {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['analytics', 'food', params.from, params.to],
    queryFn: () => unwrap<any>(rpc.api.analytics.food.$get(arg({ query: params }))),
    enabled: hasSession,
  });
}

export function useTrainingAnalytics(params: { from: string; to: string }) {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['analytics', 'training', params.from, params.to],
    queryFn: () => unwrap<any>(rpc.api.analytics.training.$get(arg({ query: params }))),
    enabled: hasSession,
  });
}

export function useGoalAnalytics() {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['analytics', 'goal'],
    queryFn: () => unwrap<GoalAnalytics>(rpc.api.analytics.goal.$get()),
    enabled: hasSession,
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

// ── Insights (Epic 5) ──────────────────────────────────────────────────────
export function useInsights() {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['insights'],
    queryFn: () => unwrap<Insight[]>(rpc.api.insights.$get()),
    enabled: hasSession,
  });
}

export function useWeeklySummary(week?: string) {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['insights', 'weekly-summary', week ?? null],
    queryFn: () =>
      unwrap<WeeklySummary>(
        rpc.api.insights['weekly-summary'].$get(arg({ query: { week } }))
      ),
    enabled: hasSession,
  });
}

export function useGenerateWeeklyInsight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateInsightInput = {}) =>
      unwrap<Insight>(rpc.api.insights.generate.$post(arg({ json: input }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insights'] });
      qc.invalidateQueries({ queryKey: ['badges'] });
    },
  });
}

export function useGenerateCouncilInsight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateInsightInput = {}) =>
      unwrap<Insight>(rpc.api.insights.council.$post(arg({ json: input }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insights'] }),
  });
}

export function useApplyCouncilProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ApplyCouncilProposalInput }) =>
      unwrap<{ insight: Insight; profile: Profile }>(
        rpc.api.insights[':id']['apply-proposal'].$post(arg({ param: { id }, json: input }))
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insights'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export function useAnalyzePhysique() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AnalyzePhysiqueInput) =>
      unwrap<Insight>(rpc.api.insights.physique.analyze.$post(arg({ json: input }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insights'] }),
  });
}

export function useDeleteInsight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap<{ id: string }>(rpc.api.insights[':id'].$delete(arg({ param: { id } }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insights'] }),
  });
}

export function useAiConsent() {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['me', 'ai-consent'],
    queryFn: () => unwrap<AiConsent>(rpc.api.me['ai-consent'].$get()),
    enabled: hasSession,
  });
}

export function useUpdateAiConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<AiConsent>) =>
      unwrap<AiConsent>(rpc.api.me['ai-consent'].$patch(arg({ json: input }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'ai-consent'] }),
  });
}

export function useAnalyzeFoodPhoto() {
  return useMutation({
    mutationFn: (input: AnalyzeFoodPhotoInput) =>
      unwrap<AiMealCandidate[]>(rpc.api.foods['analyze-photo'].$post(arg({ json: input }))),
  });
}

export function useResolveFood() {
  return useMutation({
    mutationFn: (input: ResolveFoodInput) =>
      unwrap<{
        dish_name: string;
        ingredients: ResolvedIngredient[];
        totals: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
      }>(rpc.api.foods.resolve.$post(arg({ json: input }))),
  });
}

export function useGenerateProgram() {
  return useMutation({
    mutationFn: (input: {
      goal: string;
      experience: 'beginner' | 'intermediate' | 'advanced';
      days_per_week: number;
      equipment: string[];
      constraints?: string;
      adjustment?: string;
    }) =>
      unwrap<{ program: GeneratedProgram; insight_id: string }>(
        rpc.api.routines.generate.$post(arg({ json: input }))
      ),
  });
}

// Program refinement chat (NWE-120): one turn = message in, {reply, revision?} out.
export function useRefineProgram() {
  return useMutation({
    mutationFn: (input: { insight_id: string; message: string }) =>
      unwrap<{ reply: string; updated_program: GeneratedProgram | null }>(
        rpc.api.routines.generated.refine.$post(arg({ json: input }))
      ),
  });
}

// ── AI meal planner (NWE-121) ────────────────────────────────────────────────
export function useGenerateMealPlan() {
  return useMutation({
    mutationFn: (input: { date: string }) =>
      unwrap<{ plan: MealPlan; insight_id: string }>(rpc.api.nutrition.plan.$post(arg({ json: input }))),
  });
}

export function useRefineMealPlan() {
  return useMutation({
    mutationFn: (input: { insight_id: string; message: string }) =>
      unwrap<{ reply: string; updated_plan: MealPlan | null }>(
        rpc.api.nutrition.plan.refine.$post(arg({ json: input }))
      ),
  });
}

export function useLogPlannedMeal(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { insight_id: string; meal_index: number; logged_on: string }) =>
      unwrap<FoodLog>(rpc.api.nutrition.plan['log-meal'].$post(arg({ json: input }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['food-logs', date] });
      qc.invalidateQueries({ queryKey: ['food-logs', 'totals', date] });
    },
  });
}

export function useSaveGeneratedProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveGeneratedProgramInput) =>
      unwrap<Routine[]>(rpc.api.routines.generated.save.$post(arg({ json: input }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routines'] });
      qc.invalidateQueries({ queryKey: ['insights'] });
    },
  });
}

export function useAdaptRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap<{ insight: Insight; diff: RoutineDiff }>(
        rpc.api.routines[':id'].adapt.$post(arg({ param: { id } }))
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insights'] }),
  });
}

export function useApplyRoutineDiff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap<Insight>(rpc.api.routines[':id']['apply-diff'].$post(arg({ param: { id } }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routines'] });
      qc.invalidateQueries({ queryKey: ['insights'] });
    },
  });
}

// ── Gamification + notifications (Epic 6) ─────────────────────────────────
export function useStreaks(date?: string) {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['streaks', date ?? null],
    queryFn: () => unwrap<{ food: { current: number; longest: number; lastLoggedOn: string | null } }>(
      rpc.api.streaks.$get(arg({ query: { date } }))
    ),
    enabled: hasSession,
  });
}

export function useQuests(date?: string) {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['quests', date ?? null],
    queryFn: () => unwrap<{ id: string; title: string; target: number; progress: number; complete: boolean }[]>(
      rpc.api.quests.$get(arg({ query: { date } }))
    ),
    enabled: hasSession,
  });
}

export function useBadges() {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['badges'],
    queryFn: () =>
      unwrap<{
        catalog: { id: string; title: string; description: string }[];
        earned: EarnedBadge[];
      }>(rpc.api.badges.$get(arg({ query: {} }))),
    enabled: hasSession,
  });
}

export function useNotificationPrefs() {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['notifications', 'prefs'],
    queryFn: () => unwrap<NotificationPrefs>(rpc.api.notifications.prefs.$get()),
    enabled: hasSession,
  });
}

export function useUpdateNotificationPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<NotificationPrefs>) =>
      unwrap<NotificationPrefs>(rpc.api.notifications.prefs.$patch(arg({ json: input }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', 'prefs'] }),
  });
}

export function useRegisterPushToken() {
  return useMutation({
    mutationFn: (input: RegisterPushTokenInput) =>
      unwrap<unknown>(rpc.api.notifications.tokens.$post(arg({ json: input }))),
  });
}

// ── Assistant Hub (NWE-123/124) ────────────────────────────────────────────
export function useAssistantThreads() {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['assistant', 'threads'],
    queryFn: () => unwrap<AssistantThreadSummary[]>(rpc.api.assistant.threads.$get()),
    enabled: hasSession,
  });
}

export function useAssistantThread(id?: string | null) {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ['assistant', 'thread', id],
    queryFn: () => unwrap<AssistantThread>(rpc.api.assistant.threads[':id'].$get(arg({ param: { id } }))),
    enabled: hasSession && Boolean(id),
  });
}

export function useApplyAssistantProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: string | { id: string; proposal?: AssistantProposal }) => {
      const { id, proposal } = typeof input === 'string' ? { id: input, proposal: undefined } : input;
      return unwrap<{ id: string; applied_at: string; result: Record<string, unknown> | null }>(
        rpc.api.assistant.proposals[':id'].apply.$post(arg({ param: { id }, json: proposal ? { proposal } : {} }))
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assistant'] });
      qc.invalidateQueries({ queryKey: ['food-logs'] });
      qc.invalidateQueries({ queryKey: ['routines'] });
      qc.invalidateQueries({ queryKey: ['recipes'] });
      qc.invalidateQueries({ queryKey: ['workouts'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export function useSaveAssistantProposalRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, proposal }: { id: string; proposal?: Extract<AssistantProposal, { kind: 'food_logs' }> }) =>
      unwrap<{ id: string; result: Record<string, unknown> }>(rpc.api.assistant.proposals[':id']['save-recipe'].$post(arg({ param: { id }, json: proposal ? { proposal } : {} }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assistant'] });
      qc.invalidateQueries({ queryKey: ['recipes'] });
    },
  });
}

export function useDismissAssistantProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap<{ id: string; dismissed_at: string }>(
      rpc.api.assistant.proposals[':id'].dismiss.$post(arg({ param: { id } }))
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assistant'] }),
  });
}
