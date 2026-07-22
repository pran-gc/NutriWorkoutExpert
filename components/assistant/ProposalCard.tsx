import BottomSheet, { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import {
  assistantProposalSchema, ingredientMicronutrientTotals, ingredientTotals, scaleIngredient,
  type AssistantProposal, type AssistantProposalState, type ProposalIngredient,
} from '@shared';
import { Text, View, useThemeColor } from '@/components/Themed';
import { Button, Card, Chip, ChipRow, Muted } from '@/components/ui';
import { Brand } from '@/constants/Colors';
import {
  useApplyAssistantProposal, useProfile, useResolveFood, useSaveAssistantProposalRecipe,
} from '@/lib/hooks';

type FoodProposal = Extract<AssistantProposal, { kind: 'food_logs' }>;
type WorkoutProposal = Extract<AssistantProposal, { kind: 'workout_log' }>;
type RecipeProposal = Extract<AssistantProposal, { kind: 'recipe' }>;

const sourceLabel = (source: ProposalIngredient['source']) => source === 'usda' ? 'USDA' : source === 'openfoodfacts' ? 'Open Food Facts' : 'Estimated';
const number = (value: number) => Math.round(value * 10) / 10;

function SheetInput({ label, value, onChangeText, style }: { label: string; value: string; onChangeText(value: string): void; style?: object }) {
  const color = useThemeColor({}, 'inputText');
  const borderColor = useThemeColor({}, 'inputBorder');
  const backgroundColor = useThemeColor({}, 'inputBackground');
  return <BottomSheetTextInput accessibilityLabel={label} keyboardType="decimal-pad" value={value} onChangeText={onChangeText} style={[styles.input, { color, borderColor, backgroundColor }, style]} />;
}

function SheetTextInput({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText(value: string): void; placeholder?: string }) {
  const color = useThemeColor({}, 'inputText'); const borderColor = useThemeColor({}, 'inputBorder');
  const backgroundColor = useThemeColor({}, 'inputBackground'); const placeholderTextColor = useThemeColor({}, 'inputPlaceholder');
  return <BottomSheetTextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={placeholderTextColor} style={[styles.input, styles.flex, { color, borderColor, backgroundColor }]} />;
}

function ProvenanceChip({ source }: { source: ProposalIngredient['source'] }) {
  return <View accessibilityLabel={`Nutrition source: ${sourceLabel(source)}`} style={[styles.provenance, source === 'estimated' && styles.estimated]}><Text style={styles.provenanceText}>{sourceLabel(source)}</Text></View>;
}

function MacroBar({ ingredients }: { ingredients: ProposalIngredient[] }) {
  const totals = ingredientTotals(ingredients);
  const profile = useProfile();
  const targets = profile.data;
  const deltas = [
    targets?.calorie_target == null ? null : `${number(totals.calories - targets.calorie_target)} kcal`,
    targets?.protein_target_g == null ? null : `${number(totals.protein_g - targets.protein_target_g)} g P`,
    targets?.carbs_target_g == null ? null : `${number(totals.carbs_g - targets.carbs_target_g)} g C`,
    targets?.fat_target_g == null ? null : `${number(totals.fat_g - targets.fat_target_g)} g F`,
  ].filter((value): value is string => value != null);
  return <View style={styles.macroBar}>
    <Text style={styles.macroPrimary}>{number(totals.calories)} kcal</Text>
    <Muted>{number(totals.protein_g)} P · {number(totals.carbs_g)} C · {number(totals.fat_g)} F</Muted>
    {!!deltas.length && <Muted>Daily target delta · {deltas.join(' · ')}</Muted>}
  </View>;
}

function Micronutrients({ ingredients }: { ingredients: ProposalIngredient[] }) {
  const [open, setOpen] = useState(false);
  const totals = ingredientMicronutrientTotals(ingredients);
  return <View style={styles.transparent}>
    <Pressable accessibilityRole="button" onPress={() => setOpen((value) => !value)} style={styles.secondaryAction}>
      <Text style={styles.link}>{open ? 'Hide micronutrients' : 'Show micronutrients'}</Text>
    </Pressable>
    {open && <View style={styles.microGrid}>{Object.entries(totals.values).map(([key, value]) =>
      <Muted key={key}>{key.replaceAll('_', ' ')} · {value == null ? 'Unavailable' : `${number(value)}${key.endsWith('_mg') ? ' mg' : ' g'}`}{totals.partial[key as keyof typeof totals.partial] ? ' · partial' : ''}</Muted>
    )}{totals.approximate && <Muted>Approximate — includes estimated ingredients.</Muted>}</View>}
  </View>;
}

function IngredientRows({ ingredients, onChange }: { ingredients: ProposalIngredient[]; onChange(value: ProposalIngredient[]): void }) {
  const resolver = useResolveFood();
  const [quantityText, setQuantityText] = useState<Record<number, string>>({});
  const [name, setName] = useState('');
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  useEffect(() => setQuantityText({}), [ingredients]);
  const updateQuantity = (index: number, raw: string) => {
    if (!/^\d*(?:\.\d*)?$/.test(raw)) return;
    setQuantityText((current) => ({ ...current, [index]: raw }));
    const quantity = raw === '' ? 0 : Math.min(10_000, Number(raw));
    if (!Number.isFinite(quantity)) return;
    onChange(ingredients.map((ingredient, itemIndex) => itemIndex === index ? scaleIngredient(ingredient, quantity) : ingredient));
  };
  const resolve = async () => {
    const trimmed = name.trim();
    if (!trimmed || resolver.isPending) return;
    try {
      const result = await resolver.mutateAsync({ dish_name: trimmed, ingredients: [{ name: trimmed, quantity_g: 100 }] });
      const row = result.ingredients[0];
      if (!row) return;
      const resolved: ProposalIngredient = {
        name: row.name, quantity_g: row.quantity_g, calories_per_100g: row.calories_per_100g,
        protein_per_100g: row.protein_per_100g, carbs_per_100g: row.carbs_per_100g, fat_per_100g: row.fat_per_100g,
        source: row.source === 'ai_estimate' ? 'estimated' : row.source, source_id: row.source_id, fdc_id: row.fdc_id,
        micronutrients_per_100g: row.micronutrients_per_100g,
      };
      onChange(replaceIndex == null ? [...ingredients, resolved] : ingredients.map((item, index) => index === replaceIndex ? resolved : item));
      setName(''); setReplaceIndex(null);
    } catch {
      // The mutation exposes its friendly error directly below without changing the draft.
    }
  };
  return <View style={styles.transparent}>
    {ingredients.map((ingredient, index) => {
      const contribution = ingredientTotals([ingredient]);
      return <View key={`${ingredient.name}-${index}`} style={styles.ingredientRow}>
        <View style={styles.rowBetween}><Text style={styles.detailTitle}>{ingredient.name}</Text><ProvenanceChip source={ingredient.source} /></View>
        <View style={styles.editRow}>
          <SheetInput label={`${ingredient.name} quantity in grams`} value={quantityText[index] ?? String(ingredient.quantity_g)} onChangeText={(value) => updateQuantity(index, value)} style={styles.quantity} />
          <Muted>g · {number(contribution.calories)} kcal · {number(contribution.protein_g)} g P</Muted>
        </View>
        <View style={styles.rowActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Swap ${ingredient.name}`} onPress={() => { setReplaceIndex(index); setName(''); }} style={styles.smallAction}><Text style={styles.link}>Swap</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${ingredient.name}`} onPress={() => onChange(ingredients.filter((_, itemIndex) => itemIndex !== index))} style={styles.smallAction}><Text style={styles.destructive}>Delete</Text></Pressable>
        </View>
      </View>;
    })}
    <Text style={styles.fieldLabel}>{replaceIndex == null ? 'Add ingredient' : `Replace ${ingredients[replaceIndex]?.name ?? 'ingredient'}`}</Text>
    <View style={styles.editRow}>
      <SheetTextInput label={replaceIndex == null ? 'New ingredient name' : 'Replacement ingredient name'} value={name} onChangeText={setName} placeholder="Ingredient name" />
      <Pressable accessibilityRole="button" accessibilityLabel={replaceIndex == null ? 'Resolve and add ingredient' : 'Resolve replacement ingredient'} onPress={resolve} disabled={!name.trim() || resolver.isPending} style={[styles.resolveButton, (!name.trim() || resolver.isPending) && styles.disabled]}><Text style={styles.resolveText}>{resolver.isPending ? 'Resolving…' : 'Resolve'}</Text></Pressable>
    </View>
    {resolver.isPending && <View accessibilityLabel={`Resolving ${name.trim()}`} style={styles.ingredientRow}><Muted>Resolving {name.trim()}…</Muted></View>}
    {resolver.isError && <Text accessibilityRole="alert" style={styles.error}>Couldn’t resolve that ingredient. Nothing changed; try again.</Text>}
  </View>;
}

function FoodEditor({ value, onChange }: { value: FoodProposal; onChange(value: FoodProposal): void }) {
  const updateIngredients = (entryIndex: number, ingredients: ProposalIngredient[]) => {
    const totals = ingredientTotals(ingredients);
    onChange({ ...value, entries: value.entries.map((entry, index) => index === entryIndex ? { ...entry, ...totals, quantity_g: number(ingredients.reduce((sum, item) => sum + item.quantity_g, 0)), ingredients } : entry) });
  };
  const allIngredients = value.entries.flatMap((entry) => entry.ingredients ?? []);
  return <View style={styles.transparent}>
    {value.entries.map((entry, entryIndex) => <View key={`${entry.food_name}-${entryIndex}`} style={styles.detail}>
      <Text style={styles.detailTitle}>{entry.food_name}</Text>
      {entry.ingredients ? <>
        <MacroBar ingredients={entry.ingredients} />
        <IngredientRows ingredients={entry.ingredients} onChange={(ingredients) => updateIngredients(entryIndex, ingredients)} />
      </> : <Muted>Ingredient detail unavailable. This older proposal can still be approved.</Muted>}
      <Text style={styles.fieldLabel}>Meal</Text><ChipRow>{(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((meal) => <Chip key={meal} label={meal} active={entry.meal_type === meal} onPress={() => onChange({ ...value, entries: value.entries.map((item, index) => index === entryIndex ? { ...item, meal_type: meal } : item) })} />)}</ChipRow>
      <Text style={styles.fieldLabel}>Date</Text><SheetTextInput label={`${entry.food_name} logged date`} value={entry.logged_on} onChangeText={(logged_on) => onChange({ ...value, entries: value.entries.map((item, index) => index === entryIndex ? { ...item, logged_on } : item) })} />
    </View>)}
    {!!allIngredients.length && <Micronutrients ingredients={allIngredients} />}
  </View>;
}

function RecipeEditor({ value, onChange }: { value: RecipeProposal; onChange(value: RecipeProposal): void }) {
  return <View style={styles.transparent}><MacroBar ingredients={value.ingredients} /><IngredientRows ingredients={value.ingredients} onChange={(ingredients) => onChange({ ...value, ingredients })} />
    <Text style={styles.fieldLabel}>Servings</Text><View style={styles.stepper}>
      <Pressable accessibilityRole="button" accessibilityLabel="Decrease servings" onPress={() => onChange({ ...value, servings: Math.max(0.5, value.servings - 0.5) })} style={styles.stepButton}><Text>−</Text></Pressable>
      <Text>{value.servings}</Text><Pressable accessibilityRole="button" accessibilityLabel="Increase servings" onPress={() => onChange({ ...value, servings: Math.min(100, value.servings + 0.5) })} style={styles.stepButton}><Text>+</Text></Pressable>
    </View><Micronutrients ingredients={value.ingredients} /></View>;
}

function WorkoutEditor({ value, onChange }: { value: WorkoutProposal; onChange(value: WorkoutProposal): void }) {
  const updateSet = (exerciseIndex: number, setIndex: number, key: string, raw: string) => {
    if (!/^\d*(?:\.\d*)?$/.test(raw)) return;
    const parsed = raw === '' ? 0 : Math.min(10_000, Number(raw));
    onChange({ ...value, exercises: value.exercises.map((exercise, index) => index !== exerciseIndex ? exercise : {
      ...exercise, sets: exercise.sets.map((set, index2) => index2 === setIndex ? { ...set, [key]: parsed } : set),
    }) } as WorkoutProposal);
  };
  return <View style={styles.transparent}>
    <Text style={styles.fieldLabel}>Title</Text><SheetTextInput label="Workout title" value={value.title} onChangeText={(title) => onChange({ ...value, title })} />
    <Text style={styles.fieldLabel}>Date</Text><SheetTextInput label="Workout logged date" value={value.logged_on} onChangeText={(logged_on) => onChange({ ...value, logged_on })} />
    <Text style={styles.fieldLabel}>Duration</Text><View style={styles.editRow}><SheetInput label="Workout duration in minutes" value={String(value.duration_min ?? 0)} onChangeText={(raw) => {
      if (!/^\d*(?:\.\d*)?$/.test(raw)) return;
      onChange({ ...value, duration_min: raw === '' ? undefined : Math.min(10_000, Number(raw)) });
    }} /><Muted>minutes</Muted></View>
    <Text style={styles.fieldLabel}>Notes</Text><SheetTextInput label="Workout notes" value={value.notes ?? ''} onChangeText={(notes) => onChange({ ...value, notes: notes || undefined })} placeholder="Optional notes" />
    {value.exercises.map((exercise, exerciseIndex) => <View key={`${exercise.name}-${exerciseIndex}`} style={styles.detail}>
      <Text style={styles.fieldLabel}>Exercise</Text><SheetTextInput label={`Exercise ${exerciseIndex + 1} name`} value={exercise.name} onChangeText={(name) => onChange({ ...value, exercises: value.exercises.map((row, index) => index === exerciseIndex ? { ...row, name, exercise_id: undefined } : row) } as WorkoutProposal)} />
      <SetHeader kind={exercise.kind} />
      {exercise.sets.map((set, setIndex) => <View key={setIndex} style={styles.setRow}><Text style={styles.setNumber}>{setIndex + 1}</Text>
        {exercise.kind === 'strength' ? <><SheetInput label={`${exercise.name} set ${setIndex + 1} reps`} value={String('reps' in set ? set.reps : 0)} onChangeText={(raw) => updateSet(exerciseIndex, setIndex, 'reps', raw)} /><SheetInput label={`${exercise.name} set ${setIndex + 1} weight in kilograms`} value={String('weight_kg' in set ? set.weight_kg ?? 0 : 0)} onChangeText={(raw) => updateSet(exerciseIndex, setIndex, 'weight_kg', raw)} /></> : <><SheetInput label={`${exercise.name} set ${setIndex + 1} duration in minutes`} value={String(set.duration_min ?? 0)} onChangeText={(raw) => updateSet(exerciseIndex, setIndex, 'duration_min', raw)} /><SheetInput label={`${exercise.name} set ${setIndex + 1} distance in kilometres`} value={String('distance_km' in set ? set.distance_km ?? 0 : 0)} onChangeText={(raw) => updateSet(exerciseIndex, setIndex, 'distance_km', raw)} /></>}
      </View>)}
    </View>)}
  </View>;
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function SetHeader({ kind }: { kind: 'strength' | 'cardio' }) {
  return <View style={styles.setHeader}>
    <Muted style={styles.setNumber}>Set</Muted>
    <Muted style={styles.setColumn}>{kind === 'strength' ? 'Reps' : 'Minutes'}</Muted>
    <Muted style={styles.setColumn}>{kind === 'strength' ? 'kg' : 'km'}</Muted>
  </View>;
}

function WorkoutDetails({ value }: { value: WorkoutProposal }) {
  return <View style={styles.transparent}>
    <View style={styles.metaRow}><View style={styles.metaItem}><Muted>Date</Muted><Text style={styles.metaValue}>{formatDate(value.logged_on)}</Text></View>
      {Boolean(value.duration_min) && <View style={styles.metaItem}><Muted>Duration</Muted><Text style={styles.metaValue}>{value.duration_min} min</Text></View>}
    </View>
    {!!value.notes && <View style={styles.notes}><Muted>Notes</Muted><Text>{value.notes}</Text></View>}
    {value.exercises.map((exercise, exerciseIndex) => <View key={`${exercise.name}-${exerciseIndex}`} style={styles.exerciseCard}>
      <Text style={styles.exerciseTitle}>{exercise.name}</Text><SetHeader kind={exercise.kind} />
      {exercise.sets.map((set, setIndex) => <View key={setIndex} style={styles.readonlySetRow}>
        <Text style={styles.setNumber}>{setIndex + 1}</Text>
        <Text style={styles.setColumn}>{exercise.kind === 'strength' && 'reps' in set ? set.reps : set.duration_min ?? '—'}</Text>
        <Text style={styles.setColumn}>{exercise.kind === 'strength' && 'weight_kg' in set ? set.weight_kg ?? '—' : 'distance_km' in set ? set.distance_km ?? '—' : '—'}</Text>
      </View>)}
    </View>)}
  </View>;
}

function FoodDetails({ value }: { value: FoodProposal }) {
  return <View style={styles.transparent}>{value.entries.map((entry, index) => <View key={`${entry.food_name}-${index}`} style={styles.exerciseCard}>
    <View style={styles.rowBetween}><Text style={styles.exerciseTitle}>{entry.food_name}</Text><Muted>{entry.meal_type}</Muted></View>
    <Text>{number(entry.calories)} kcal · {number(entry.protein_g)} g protein · {number(entry.carbs_g)} g carbs · {number(entry.fat_g)} g fat</Text>
    <Muted>{number(entry.quantity_g)} g · {formatDate(entry.logged_on)}</Muted>
    {entry.ingredients?.map((ingredient, ingredientIndex) => <View key={`${ingredient.name}-${ingredientIndex}`} style={styles.ingredientSummary}><Text>{ingredient.name}</Text><Muted>{number(ingredient.quantity_g)} g · {sourceLabel(ingredient.source)}</Muted></View>)}
  </View>)}</View>;
}

function RecipeDetails({ value }: { value: RecipeProposal }) {
  const totals = ingredientTotals(value.ingredients);
  return <View style={styles.transparent}><View style={styles.macroBar}><Text style={styles.macroPrimary}>{number(totals.calories)} kcal</Text><Muted>{number(totals.protein_g)} P · {number(totals.carbs_g)} C · {number(totals.fat_g)} F · {value.servings} servings</Muted></View>
    <View style={styles.exerciseCard}>{value.ingredients.map((ingredient, index) => <View key={`${ingredient.name}-${index}`} style={styles.ingredientSummary}><Text>{ingredient.name}</Text><Muted>{number(ingredient.quantity_g)} g · {sourceLabel(ingredient.source)}</Muted></View>)}</View>
  </View>;
}

function summary(proposal: AssistantProposal): string {
  if (proposal.summary) return proposal.summary;
  if (proposal.kind === 'program_revision') return `${proposal.days.length} workout day${proposal.days.length === 1 ? '' : 's'}`;
  if (proposal.kind === 'meal_plan') return `${proposal.meals.length} meals · ${Math.round(proposal.meals.reduce((sum, meal) => sum + meal.macros.calories, 0)).toLocaleString()} kcal`;
  if (proposal.kind === 'food_logs') return `${proposal.entries.length} food entr${proposal.entries.length === 1 ? 'y' : 'ies'}`;
  if (proposal.kind === 'workout_log') return `${proposal.exercises.length} exercises${proposal.duration_min ? ` · ${proposal.duration_min} min` : ''}`;
  if (proposal.kind === 'recipe') return `${proposal.ingredients.length} ingredients · ${proposal.servings} servings`;
  return Object.entries(proposal.changes).map(([key, value]) => `${key.replaceAll('_', ' ')} → ${value}`).join(' · ');
}

function StaticDetails({ proposal }: { proposal: Exclude<AssistantProposal, FoodProposal | WorkoutProposal | RecipeProposal> }) {
  if (proposal.kind === 'program_revision') return <>{proposal.days.map((day) => <View key={day.name} style={styles.detail}><Text style={styles.detailTitle}>{day.name}</Text>{day.exercises.map((exercise) => <Muted key={exercise.name}>{exercise.name} · {String(exercise.sets ?? '—')} × {String(exercise.reps ?? '—')}</Muted>)}</View>)}</>;
  if (proposal.kind === 'meal_plan') return <>{proposal.meals.map((meal) => <View key={`${meal.meal_type}-${meal.name}`} style={styles.detail}><Text style={styles.detailTitle}>{meal.name}</Text><Muted>{meal.meal_type} · {Math.round(meal.macros.calories)} kcal · {Math.round(meal.macros.protein_g)} g protein</Muted>{!!meal.recipe.ingredients.length && <Muted>{meal.recipe.ingredients.join(' · ')}</Muted>}</View>)}</>;
  return <>{Object.entries(proposal.changes).map(([key, value]) => <View key={key} style={styles.rowBetween}><Text>{key.replaceAll('_', ' ')}</Text><Text style={styles.detailTitle}>{String(proposal.current[key as keyof typeof proposal.current] ?? '—')} → {String(value)}</Text></View>)}<Muted>{proposal.rationale}</Muted></>;
}

export function ProposalCard({ state }: { state: AssistantProposalState }) {
  const apply = useApplyAssistantProposal();
  const saveRecipe = useSaveAssistantProposalRecipe();
  const [draft, setDraft] = useState<AssistantProposal>(state.proposal);
  const [validation, setValidation] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const snapPoints = useMemo(() => ['65%', '95%'], []);
  const applied = Boolean(state.applied_at || apply.isSuccess);
  const superseded = Boolean(state.superseded);
  const dismissed = Boolean(state.dismissed_at) && !superseded;
  const message = (apply.data?.result?.message ?? state.apply_result?.message) as string | undefined;
  const emptyIngredients = (draft.kind === 'food_logs' && draft.entries.some((entry) => entry.ingredients?.length === 0)) || (draft.kind === 'recipe' && draft.ingredients.length === 0);
  const disabled = applied || dismissed || superseded || emptyIngredients;
  const editable = draft.kind === 'food_logs' || draft.kind === 'workout_log' || draft.kind === 'recipe';
  const actionTitle = draft.kind === 'workout_log' || draft.kind === 'food_logs' ? 'Log' : draft.kind === 'recipe' ? 'Save' : 'Apply';
  const closeSheet = () => { setDraft(state.proposal); setValidation(null); setEditing(false); setSheetOpen(false); };
  const approve = async () => {
    const parsed = assistantProposalSchema.safeParse(draft);
    if (!parsed.success) { setValidation('Review the highlighted values. Nutrition totals and ingredient quantities must be consistent.'); return; }
    setValidation(null);
    await apply.mutateAsync({ id: state.id, proposal: parsed.data });
    setSheetOpen(false);
  };
  if (superseded) return <Card style={styles.superseded}><Text style={styles.detailTitle}>{state.proposal.title}</Text><Muted>Updated below</Muted></Card>;
  return <>
    <Pressable testID="assistant-proposal-card" accessibilityRole="button" accessibilityLabel={`Review proposal: ${state.proposal.title}`} onPress={() => { setDraft(state.proposal); setValidation(null); setEditing(false); setSheetOpen(true); }} disabled={dismissed || applied}>
      <Card style={[styles.card, applied && styles.applied, dismissed && styles.dismissed]}>
        <View style={styles.heading}><SymbolView name={{ ios: applied ? 'checkmark.circle.fill' : 'wand.and.stars', android: applied ? 'check_circle' : 'auto_fix_high', web: applied ? 'check_circle' : 'auto_fix_high' }} tintColor={Brand.accent} size={24} /><View style={styles.headingText}><Text style={styles.title}>{state.proposal.title}</Text><Muted>{summary(state.proposal)}</Muted></View></View>
        <Text style={styles.status}>{applied ? (message ?? 'Done') : dismissed ? 'Dismissed' : 'Review'}</Text>
      </Card>
    </Pressable>
    <Modal visible={sheetOpen} transparent animationType="none" onRequestClose={closeSheet}>
      <SafeAreaProvider>
      <SafeAreaView style={styles.modalRoot} edges={['top', 'right', 'bottom', 'left']}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close proposal review" onPress={closeSheet} style={styles.backdrop} />
        <BottomSheet index={0} snapPoints={snapPoints} enablePanDownToClose keyboardBehavior="interactive" android_keyboardInputMode="adjustResize" onClose={closeSheet} backgroundStyle={{ backgroundColor }} handleIndicatorStyle={{ backgroundColor: textColor }}>
          <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheet}>
        <View style={styles.sheetHeading}><Text style={styles.sheetTitle}>{draft.title}</Text>{editable && <Pressable accessibilityRole="button" accessibilityLabel={editing ? 'Finish editing proposal' : 'Edit proposal'} onPress={() => setEditing((value) => !value)} hitSlop={8} style={styles.editAction}><Text style={styles.link}>{editing ? 'Done' : 'Edit'}</Text></Pressable>}</View>
        {editing ? draft.kind === 'food_logs' ? <FoodEditor value={draft} onChange={setDraft} /> : draft.kind === 'workout_log' ? <WorkoutEditor value={draft} onChange={setDraft} /> : draft.kind === 'recipe' ? <RecipeEditor value={draft} onChange={setDraft} /> : null
          : draft.kind === 'food_logs' ? <FoodDetails value={draft} /> : draft.kind === 'workout_log' ? <WorkoutDetails value={draft} /> : draft.kind === 'recipe' ? <RecipeDetails value={draft} /> : <StaticDetails proposal={draft} />}
        {emptyIngredients && <Text accessibilityRole="alert" style={styles.error}>Add at least one ingredient.</Text>}
        {!!validation && <Text accessibilityRole="alert" style={styles.error}>{validation}</Text>}
        {apply.isError && <Text accessibilityRole="alert" style={styles.error}>{apply.error.message}</Text>}
        <Button accessibilityLabel={applied ? (message ?? 'Done') : actionTitle} title={applied ? (message ?? 'Done') : actionTitle} disabled={disabled} loading={apply.isPending} onPress={approve} />
        {draft.kind === 'food_logs' && draft.entries.some((entry) => entry.ingredients?.length) && <Pressable accessibilityRole="button" accessibilityLabel="Save proposal as recipe" disabled={Boolean(saveRecipe.data || state.recipe_result) || saveRecipe.isPending} onPress={() => saveRecipe.mutateAsync({ id: state.id, proposal: draft })} style={[styles.outlineButton, (saveRecipe.data || state.recipe_result) && styles.disabled]}><Text style={styles.link}>{saveRecipe.isPending ? 'Saving…' : (saveRecipe.data?.result?.message ?? state.recipe_result?.message) as string ?? 'Save as recipe'}</Text></Pressable>}
            <Pressable accessibilityRole="button" onPress={closeSheet} style={styles.secondaryAction}><Text style={styles.link}>Close</Text></Pressable>
          </BottomSheetScrollView>
        </BottomSheet>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, backgroundColor: 'transparent' }, backdrop: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  transparent: { backgroundColor: 'transparent' }, flex: { flex: 1 }, card: { marginTop: 6, borderWidth: 1, borderColor: 'rgba(22,163,74,0.35)' }, applied: { borderColor: Brand.accent }, dismissed: { opacity: 0.55 }, superseded: { marginTop: 6, opacity: 0.55, paddingVertical: 10 },
  heading: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: 'transparent' }, headingText: { flex: 1, gap: 2, backgroundColor: 'transparent' }, title: { fontSize: 15, fontWeight: '700' }, status: { color: Brand.accent, fontWeight: '700', fontSize: 13 },
  sheet: { padding: 22, paddingBottom: 64, gap: 16 }, sheetHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: 'transparent' }, sheetTitle: { flex: 1, fontSize: 22, fontWeight: '800' }, editAction: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 4 }, detail: { backgroundColor: 'transparent', gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(128,128,128,0.3)' }, detailTitle: { fontWeight: '700' },
  macroBar: { backgroundColor: 'rgba(22,163,74,0.08)', borderRadius: 12, padding: 12, gap: 2 }, macroPrimary: { color: Brand.accent, fontSize: 18, fontWeight: '800' }, ingredientRow: { backgroundColor: 'transparent', paddingVertical: 10, gap: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(128,128,128,0.25)' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, backgroundColor: 'transparent' }, editRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'transparent' }, rowActions: { flexDirection: 'row', gap: 12, backgroundColor: 'transparent' }, smallAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  input: { minHeight: 44, minWidth: 70, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontSize: 16 }, quantity: { width: 78 }, fieldLabel: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  provenance: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(22,163,74,0.15)' }, estimated: { backgroundColor: 'rgba(245,158,11,0.2)' }, provenanceText: { fontSize: 11, fontWeight: '700' }, resolveButton: { minHeight: 44, borderRadius: 10, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: Brand.accent }, resolveText: { color: '#fff', fontWeight: '700' }, disabled: { opacity: 0.45 },
  link: { color: Brand.accent, fontWeight: '700' }, destructive: { color: Brand.destructive, fontWeight: '700' }, error: { color: Brand.destructive, lineHeight: 20 }, secondaryAction: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, microGrid: { backgroundColor: 'transparent', gap: 5 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: 'transparent' }, stepButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(128,128,128,0.4)', alignItems: 'center', justifyContent: 'center' },
  setHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, paddingBottom: 4, backgroundColor: 'transparent' }, setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'transparent' }, readonlySetRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(128,128,128,0.22)', backgroundColor: 'transparent' }, setNumber: { width: 40, fontWeight: '700', textTransform: 'uppercase' }, setColumn: { flex: 1, fontVariant: ['tabular-nums'], textTransform: 'uppercase' },
  exerciseCard: { backgroundColor: 'rgba(128,128,128,0.08)', borderRadius: 14, padding: 14, gap: 8 }, exerciseTitle: { fontSize: 17, fontWeight: '700' }, metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, backgroundColor: 'transparent' }, metaItem: { minWidth: 112, gap: 3, backgroundColor: 'transparent' }, metaValue: { fontWeight: '700' }, notes: { gap: 4, backgroundColor: 'transparent' }, ingredientSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 36, backgroundColor: 'transparent' },
  outlineButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Brand.accent, borderRadius: 10 },
});
