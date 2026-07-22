import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { formatPace, todayISO } from '@shared';
import type { Exercise, GeneratedProgram, Routine, RoutineDiff, WorkoutSession } from '@shared';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { forwardRef, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, useThemeColor, View } from '@/components/Themed';
import { ProgramChat } from '@/components/workouts/ProgramChat';
import { KeyboardSafeView } from '@/components/KeyboardSafeView';
import { Button, Card, Chip, ChipRow, EmptyState, Input, Muted, SectionTitle } from '@/components/ui';
import { confirmDelete } from '@/components/SwipeToDelete';
import { Brand } from '@/constants/Colors';
import { GlassSheetBackground } from '@/lib/glass';
import {
  useCreateExercise,
  useCreateRoutine,
  useCreateWorkout,
  useAdaptRoutine,
  useDeleteRoutine,
  useDeleteWorkout,
  useExercises,
  useGenerateProgram,
  useRoutines,
  useSaveGeneratedProgram,
  useUpdateRoutine,
  useUpdateWorkout,
  useWorkouts,
} from '@/lib/hooks';

type Segment = 'routines' | 'history';
type RoutineSheetMode = 'view' | 'edit';
export type DraftSet = {
  id?: string;
  exercise: string;
  exerciseId: string | null;
  kind: 'strength' | 'cardio';
  reps: string;
  weight: string;
  duration: string;
  distance: string;
  placeholder?: string;
};

const emptySet = (): DraftSet => ({
  exercise: '',
  exerciseId: null,
  kind: 'strength',
  reps: '',
  weight: '',
  duration: '',
  distance: '',
});

function rangeStart(days = 90): string {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(
    since.getDate()
  ).padStart(2, '0')}`;
}

function routineDisplayName(name: string): { eyebrow: string | null; title: string } {
  const [program, day] = name.split(' · ');
  if (!day) return { eyebrow: null, title: name };
  return { eyebrow: program, title: day };
}

export default function WorkoutsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<Segment>('routines');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<WorkoutSession | null>(null);
  const [routineEditing, setRoutineEditing] = useState<Routine | 'new' | null>(null);
  const [routineSheetMode, setRoutineSheetMode] = useState<RoutineSheetMode>('view');
  const routineSheetRef = useRef<BottomSheetModal>(null);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [exerciseQuery, setExerciseQuery] = useState('');
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [routineId, setRoutineId] = useState<string | null>(null);
  const [sets, setSets] = useState<DraftSet[]>([emptySet()]);
  const [showProgramGen, setShowProgramGen] = useState(false);
  const [programGoal, setProgramGoal] = useState('Build strength');
  const [programExperience, setProgramExperience] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [programDays, setProgramDays] = useState('3');
  const [programEquipment, setProgramEquipment] = useState('gym, dumbbells');
  const [programConstraints, setProgramConstraints] = useState('');
  const [generatedProgram, setGeneratedProgram] = useState<GeneratedProgram | null>(null);
  const [programInsightId, setProgramInsightId] = useState<string | null>(null);
  const [routineDiff, setRoutineDiff] = useState<RoutineDiff | null>(null);

  const workoutsQuery = useWorkouts({ from: rangeStart(), to: todayISO() });
  const routinesQuery = useRoutines();
  const exercisesQuery = useExercises(exerciseQuery);
  const createExercise = useCreateExercise();
  const createWorkout = useCreateWorkout();
  const updateWorkout = useUpdateWorkout();
  const deleteWorkout = useDeleteWorkout();
  const deleteRoutine = useDeleteRoutine();
  const generateProgram = useGenerateProgram();
  const saveGeneratedProgram = useSaveGeneratedProgram();
  const adaptRoutine = useAdaptRoutine();
  const sessions = workoutsQuery.data ?? [];
  const routines = routinesQuery.data ?? [];
  const exercises = exercisesQuery.data ?? [];

  const resetForm = () => {
    setTitle('');
    setDuration('');
    setNotes('');
    setRoutineId(null);
    setSets([emptySet()]);
    setEditing(null);
    setShowForm(false);
  };

  const updateSet = (index: number, patch: Partial<DraftSet>) => {
    setSets((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const chooseExercise = (exercise: Exercise) => {
    if (pickerIndex == null) return;
    updateSet(pickerIndex, {
      exercise: exercise.name,
      exerciseId: exercise.id,
      kind: exercise.kind,
      reps: exercise.kind === 'cardio' ? '' : sets[pickerIndex].reps,
      weight: exercise.kind === 'cardio' ? '' : sets[pickerIndex].weight,
    });
    setPickerIndex(null);
    setExerciseQuery('');
  };

  const createCustomExercise = async () => {
    const name = exerciseQuery.trim();
    if (!name) return;
    try {
      const exercise = await createExercise.mutateAsync({
        name,
        muscle_group: 'full_body',
        kind: 'strength',
      });
      chooseExercise(exercise);
    } catch (e) {
      Alert.alert('Could not create exercise', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const save = async () => {
    const validSets = sets.filter((s) => s.exercise.trim());
    if (!title.trim() && validSets.length === 0) {
      Alert.alert('Empty workout', 'Give the workout a name or add at least one exercise.');
      return;
    }
    const input = {
      title: title.trim() || 'Workout',
      notes: notes.trim() || null,
      duration_min: parseInt(duration, 10) || null,
      routine_id: routineId,
      logged_on: todayISO(),
      sets: validSets.map((s, i) => ({
        id: s.id,
        exercise: s.exercise.trim(),
        exercise_id: s.exerciseId,
        set_number: i + 1,
        reps: s.kind === 'cardio' ? null : parseInt(s.reps, 10) || null,
        weight_kg: s.kind === 'cardio' ? null : parseFloat(s.weight) || null,
        duration_min: s.kind === 'cardio' ? parseFloat(s.duration) || null : null,
        distance_km: s.kind === 'cardio' ? parseFloat(s.distance) || null : null,
      })),
    };
    try {
      if (editing) await updateWorkout.mutateAsync({ id: editing.id, input });
      else await createWorkout.mutateAsync(input);
      resetForm();
      setSegment('history');
    } catch (e) {
      Alert.alert('Could not save workout', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const editSession = (session: WorkoutSession) => {
    setEditing(session);
    setTitle(session.title);
    setDuration(session.duration_min?.toString() ?? '');
    setNotes(session.notes ?? '');
    setRoutineId(session.routine_id ?? null);
    setSets(
      (session.workout_sets ?? []).sort((a, b) => a.set_number - b.set_number).map((set) => ({
        id: set.id,
        exercise: set.exercise,
        exerciseId: set.exercise_id ?? null,
        kind: set.distance_km != null ? 'cardio' : 'strength',
        reps: set.reps?.toString() ?? '',
        weight: set.weight_kg?.toString() ?? '',
        duration: set.duration_min?.toString() ?? '',
        distance: set.distance_km?.toString() ?? '',
      }))
    );
    setShowForm(true);
  };

  const startRoutine = (routine: Routine) => {
    setTitle(routine.name);
    setDuration('');
    setNotes(routine.notes ?? '');
    setRoutineId(routine.id);
    setSets(
      (routine.routine_exercises ?? [])
        .sort((a, b) => a.position - b.position)
        .flatMap((item) =>
          Array.from({ length: item.target_sets }, () => ({
            ...emptySet(),
            exercise: item.exercise?.name ?? 'Exercise',
            exerciseId: item.exercise_id,
            kind: item.exercise?.kind ?? 'strength',
            reps: item.target_reps?.toString() ?? '',
            placeholder: item.target_reps ? `${item.target_reps} reps target` : undefined,
          }))
        )
    );
    setShowForm(true);
    setSegment('history');
  };

  const generateAiProgram = async () => {
    try {
      const res = await generateProgram.mutateAsync({
        goal: programGoal,
        experience: programExperience,
        days_per_week: Math.max(1, Math.min(7, parseInt(programDays, 10) || 3)),
        equipment: programEquipment.split(',').map((item) => item.trim()).filter(Boolean),
        constraints: programConstraints.trim() || undefined,
      });
      setGeneratedProgram(res.program);
      setProgramInsightId(res.insight_id);
    } catch (e) {
      Alert.alert('Could not generate program', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const saveAiProgram = async () => {
    if (!generatedProgram) return;
    try {
      await saveGeneratedProgram.mutateAsync({ program: generatedProgram });
      setGeneratedProgram(null);
      setProgramInsightId(null);
      setShowProgramGen(false);
      Alert.alert('Program saved', 'Your generated days are now editable routines.');
    } catch (e) {
      Alert.alert('Could not save program', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const suggestAdaptation = async (routine: Routine) => {
    try {
      const result = await adaptRoutine.mutateAsync(routine.id);
      setRoutineDiff(result.diff);
    } catch (e) {
      Alert.alert('Could not review routine', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const confirmRoutineDelete = (routine: Routine) => {
    confirmDelete({
      title: 'Delete routine?',
      message: `"${routine.name}" will be removed. This cannot be undone.`,
      onDelete: () => deleteRoutine.mutate(routine.id),
    });
  };

  const openRoutineSheet = (routine: Routine | 'new', mode: RoutineSheetMode) => {
    setRoutineEditing(routine);
    setRoutineSheetMode(mode);
    requestAnimationFrame(() => routineSheetRef.current?.present());
  };

  const closeRoutineSheet = () => routineSheetRef.current?.dismiss();
  const handleRoutineSheetDismiss = () => setRoutineEditing(null);

  return (
    <KeyboardSafeView>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <View style={styles.segmented}>
            <SegmentButton label="Routines" active={segment === 'routines'} onPress={() => setSegment('routines')} />
            <SegmentButton label="History" active={segment === 'history'} onPress={() => setSegment('history')} />
          </View>
          <Pressable
            accessibilityLabel="Open gym analytics"
            accessibilityRole="button"
            onPress={() => router.push('/gym-analytics')}
            style={({ pressed }) => [styles.analyticsButton, pressed && styles.pressed]}>
            <SymbolView
              name={{ ios: 'chart.line.uptrend.xyaxis', android: 'monitoring', web: 'monitoring' }}
              tintColor={Brand.accent}
              size={19}
            />
            <Text style={styles.analyticsText}>Analytics</Text>
          </Pressable>
        </View>

        {showForm && (
          <SessionForm
            title={title}
            setTitle={setTitle}
            duration={duration}
            setDuration={setDuration}
            notes={notes}
            setNotes={setNotes}
            sets={sets}
            updateSet={updateSet}
            onPick={setPickerIndex}
            onAddSet={() => setSets([...sets, emptySet()])}
            onRemoveSet={(index) => setSets((prev) => prev.filter((_, i) => i !== index))}
            onCancel={resetForm}
            onSave={save}
            saving={createWorkout.isPending || updateWorkout.isPending}
            editing={Boolean(editing)}
          />
        )}

        {pickerIndex != null && (
          <ExercisePicker
            query={exerciseQuery}
            setQuery={setExerciseQuery}
            exercises={exercises}
            onChoose={chooseExercise}
            onCreate={createCustomExercise}
            loading={exercisesQuery.isFetching || createExercise.isPending}
          />
        )}

        {segment === 'routines' ? (
          <>
            <Card style={styles.coachCard}>
              <View style={styles.coachHeader}>
                <View style={styles.coachIcon}>
                  <SymbolView
                    name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }}
                    tintColor={Brand.accent}
                    size={20}
                  />
                </View>
                <View style={styles.coachCopy}>
                  <Text style={styles.cardTitle}>AI program builder</Text>
                  <Muted style={styles.cardSubtitle}>Answer a few questions, preview, then save editable routines.</Muted>
                </View>
                <Button
                  title={showProgramGen ? 'Close' : 'Open'}
                  onPress={() => setShowProgramGen((v) => !v)}
                  style={styles.compactButton}
                />
              </View>
              {showProgramGen && (
                <View style={styles.programBox}>
                  <Input placeholder="Goal" value={programGoal} onChangeText={setProgramGoal} />
                  <ChipRow>
                    {(['beginner', 'intermediate', 'advanced'] as const).map((level) => (
                      <Chip key={level} label={level} active={programExperience === level} onPress={() => setProgramExperience(level)} />
                    ))}
                  </ChipRow>
                  <Input placeholder="Days per week" keyboardType="numeric" value={programDays} onChangeText={setProgramDays} />
                  <Input placeholder="Equipment" value={programEquipment} onChangeText={setProgramEquipment} />
                  <Input placeholder="Constraints or injuries (optional)" value={programConstraints} onChangeText={setProgramConstraints} />
                  <Button title="Generate program" onPress={generateAiProgram} loading={generateProgram.isPending} />
                </View>
              )}
              {generatedProgram && (
                <View style={styles.programBox}>
                  <Text style={styles.sessionTitle}>{generatedProgram.title}</Text>
                  {generatedProgram.days.map((day) => (
                    <Card key={day.name} style={styles.previewDay}>
                      <Text style={styles.sessionTitle}>{day.name}</Text>
                      <Muted>{day.rationale}</Muted>
                      {day.exercises.map((exercise) => (
                        <Text key={`${day.name}-${exercise.name}`} style={styles.setLine}>
                          {exercise.name} — {exercise.sets}x{exercise.reps ?? 'time'}
                        </Text>
                      ))}
                    </Card>
                  ))}
                  {programInsightId && (
                    <ProgramChat insightId={programInsightId} onApplyRevision={setGeneratedProgram} />
                  )}
                  <Button title="Save program" onPress={saveAiProgram} loading={saveGeneratedProgram.isPending} />
                </View>
              )}
              {routineDiff && (
                <Card style={styles.previewDay}>
                  <Text style={styles.sessionTitle}>{routineDiff.title}</Text>
                  <Muted>{routineDiff.reason}</Muted>
                  {routineDiff.changes.map((change, index) => (
                    <Text key={`${change.exercise}-${index}`} style={styles.setLine}>
                      {change.type.toUpperCase()} · {change.exercise}: {change.detail}
                    </Text>
                  ))}
                  <Button title="Dismiss suggestion" onPress={() => setRoutineDiff(null)} />
                </Card>
              )}
            </Card>

            <View style={styles.listHeader}>
              <View style={styles.transparent}>
                <Text style={styles.listTitle}>Your routines</Text>
                <Muted>{routines.length ? `${routines.length} saved plans` : 'Start with a generated or custom routine.'}</Muted>
              </View>
              {routinesQuery.isLoading && <ActivityIndicator />}
            </View>

            {routines.map((routine) => {
              const display = routineDisplayName(routine.name);
              const exerciseCount = routine.routine_exercises?.length ?? 0;
              return (
                <Card key={routine.id} style={styles.routineCard}>
                  <View style={styles.routineMainRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${routine.name}`}
                      onPress={() => openRoutineSheet(routine, 'view')}
                      style={({ pressed }) => [styles.routineOpenArea, pressed && styles.pressed]}>
                      <View style={styles.routineMark}>
                        <SymbolView
                          name={{
                            ios: 'figure.strengthtraining.traditional',
                            android: 'fitness_center',
                            web: 'fitness_center',
                          }}
                          tintColor={Brand.accent}
                          size={20}
                        />
                      </View>
                      <View style={styles.routineTitleWrap}>
                        {display.eyebrow ? <Muted style={styles.routineEyebrow}>{display.eyebrow}</Muted> : null}
                        <Text style={styles.routineTitle}>{display.title}</Text>
                        <View style={styles.metaRow}>
                          <Text style={styles.metaPill}>{exerciseCount} exercises</Text>
                        </View>
                      </View>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Start ${routine.name}`}
                      onPress={() => startRoutine(routine)}
                      style={({ pressed }) => [styles.startMiniButton, pressed && styles.pressed]}>
                      <Text style={styles.startMiniText}>Start</Text>
                    </Pressable>
                  </View>
                  <View style={styles.routineActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${routine.name}`}
                      onPress={() => openRoutineSheet(routine, 'edit')}
                      style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
                      <Text style={styles.actionText}>Edit</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Get coach suggestion for ${routine.name}`}
                      onPress={() => suggestAdaptation(routine)}
                      style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
                      <Text style={styles.actionText}>Coach</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${routine.name}`}
                      onPress={() => confirmRoutineDelete(routine)}
                      style={({ pressed }) => [styles.deleteTextButton, pressed && styles.pressed]}>
                      <Text style={styles.deleteText}>Delete</Text>
                    </Pressable>
                  </View>
                </Card>
              );
            })}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create a new routine"
              onPress={() => openRoutineSheet('new', 'edit')}
              style={({ pressed }) => pressed && styles.pressed}>
              <Card style={styles.newRoutineCard}>
                <Text style={styles.newRoutineText}>New routine</Text>
                <Muted>Build your own plan from the exercise library.</Muted>
              </Card>
            </Pressable>
          </>
        ) : (
          <>
            <Button title={showForm ? 'Close form' : '+ Log a workout'} onPress={() => setShowForm(!showForm)} />
            <SectionTitle>Last 90 days</SectionTitle>
            {workoutsQuery.isLoading && <ActivityIndicator style={{ marginVertical: 8 }} />}
            {!workoutsQuery.isLoading && sessions.length === 0 && (
              <EmptyState text="No workouts yet. Log a session or start a routine." />
            )}
            {sessions.map((s) => (
              <Pressable key={s.id} onPress={() => editSession(s)} onLongPress={() => deleteWorkout.mutate(s.id)}>
                <Card>
                  <View style={styles.sessionHeader}>
                    <Text style={styles.sessionTitle}>{s.title}</Text>
                    <Muted>{s.logged_on}{s.duration_min ? ` · ${s.duration_min} min` : ''}</Muted>
                  </View>
                  {(s.workout_sets ?? []).sort((a, b) => a.set_number - b.set_number).map((set) => (
                    <Pressable
                      key={set.id}
                      onPress={() =>
                        set.exercise_id
                          ? router.push({ pathname: '/exercise-detail', params: { id: set.exercise_id, name: set.exercise } })
                          : undefined
                      }>
                      <Text style={styles.setLine}>
                        {set.exercise}
                        {set.distance_km != null
                          ? ` — ${Number(set.distance_km)} km · ${Number(set.duration_min ?? 0)} min · ${formatPace(Number(set.distance_km), Number(set.duration_min ?? 0)) ?? ''}`
                          : `${set.reps != null ? ` — ${set.reps} reps` : ''}${set.weight_kg != null ? ` @ ${set.weight_kg} kg` : ''}`}
                      </Text>
                    </Pressable>
                  ))}
                  {s.notes ? <Muted>{s.notes}</Muted> : null}
                </Card>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
      <RoutineBottomSheet ref={routineSheetRef} onDismiss={handleRoutineSheetDismiss}>
        {routineEditing && routineSheetMode === 'view' && routineEditing !== 'new' ? (
          <RoutineViewer
            routine={routineEditing}
            onEdit={() => setRoutineSheetMode('edit')}
            onStart={() => {
              startRoutine(routineEditing);
              closeRoutineSheet();
            }}
          />
        ) : routineEditing ? (
          <RoutineEditor
            routine={routineEditing}
            exercises={exercises}
            bottomInset={insets.bottom}
            onClose={closeRoutineSheet}
            onPickQuery={setExerciseQuery}
          />
        ) : null}
      </RoutineBottomSheet>
    </KeyboardSafeView>
  );
}

const RoutineBottomSheet = forwardRef<BottomSheetModal, {
  onDismiss: () => void;
  children: ReactNode;
}>(function RoutineBottomSheet({ onDismiss, children }, ref) {
  const snapPoints = useMemo(() => ['72%', '90%'], []);
  const insets = useSafeAreaInsets();
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.58}
        pressBehavior="close"
      />
    ),
    []
  );

  return (
    <BottomSheetModal
      ref={ref}
      index={0}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      enablePanDownToClose
      topInset={insets.top + 12}
      bottomInset={insets.bottom}
      backdropComponent={renderBackdrop}
      backgroundComponent={GlassSheetBackground}
      handleStyle={styles.sheetHandleArea}
      handleIndicatorStyle={styles.sheetHandle}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      onDismiss={onDismiss}>
      {children}
    </BottomSheetModal>
  );
});

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.segmentButton, active && styles.segmentButtonActive, pressed && styles.pressed]}>
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

function RoutineViewer({
  routine,
  onEdit,
  onStart,
}: {
  routine: Routine;
  onEdit: () => void;
  onStart: () => void;
}) {
  const display = routineDisplayName(routine.name);
  const items = [...(routine.routine_exercises ?? [])].sort((a, b) => a.position - b.position);
  return (
    <View style={styles.sheetContent}>
      <View style={styles.sheetHeader}>
        <View style={styles.sheetTitleWrap}>
          {display.eyebrow ? <Muted style={styles.routineEyebrow}>{display.eyebrow}</Muted> : null}
          <Text style={styles.sheetTitle}>{display.title}</Text>
          <Muted>{items.length} exercises</Muted>
        </View>
      </View>

      <BottomSheetScrollView
        style={styles.sheetScroller}
        contentContainerStyle={styles.sheetList}
        keyboardShouldPersistTaps="handled">
        {items.length === 0 ? (
          <Muted>This routine has no exercises yet.</Muted>
        ) : (
          items.map((item, index) => (
            <View key={item.id ?? `${item.exercise_id}-${index}`} style={styles.viewerExerciseRow}>
              <View style={styles.viewerExerciseMark}>
                <Text style={styles.viewerExerciseNumber}>{index + 1}</Text>
              </View>
              <View style={styles.viewerExerciseCopy}>
                <Text style={styles.viewerExerciseName}>{item.exercise?.name ?? 'Exercise'}</Text>
                <Muted>
                  {item.target_sets} sets{item.target_reps ? ` · ${item.target_reps} reps` : ''}
                </Muted>
              </View>
            </View>
          ))
        )}
      </BottomSheetScrollView>

      <View style={styles.sheetActions}>
        <Button title="Start" onPress={onStart} style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" onPress={onEdit} style={styles.secondarySheetButton}>
          <Text style={styles.actionText}>Edit</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function SessionForm(props: {
  title: string;
  setTitle: (v: string) => void;
  duration: string;
  setDuration: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  sets: DraftSet[];
  updateSet: (i: number, p: Partial<DraftSet>) => void;
  onPick: (i: number) => void;
  onAddSet: () => void;
  onRemoveSet: (i: number) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  editing: boolean;
}) {
  return (
    <Card>
      <Input accessibilityLabel="Workout name" placeholder="Workout name" value={props.title} onChangeText={props.setTitle} />
      <Input placeholder="Duration (minutes)" keyboardType="numeric" value={props.duration} onChangeText={props.setDuration} />
      <Text style={styles.setsHeading}>Sets</Text>
      {props.sets.map((s, i) => (
        <View key={i} style={styles.setBlock}>
          <Pressable
            accessibilityLabel={`Choose exercise ${i + 1}`}
            style={styles.exerciseField}
            onPress={() => props.onPick(i)}>
            <Text>{s.exercise || 'Choose exercise'}</Text>
            {s.placeholder ? <Muted>{s.placeholder}</Muted> : null}
          </Pressable>
          {s.kind === 'cardio' ? (
            <View style={styles.setRow}>
              <Input accessibilityLabel={`Set ${i + 1} distance km`} style={{ flex: 1 }} placeholder="km" keyboardType="numeric" value={s.distance} onChangeText={(v) => props.updateSet(i, { distance: v })} />
              <Input accessibilityLabel={`Set ${i + 1} duration min`} style={{ flex: 1 }} placeholder="min" keyboardType="numeric" value={s.duration} onChangeText={(v) => props.updateSet(i, { duration: v })} />
              <Muted style={{ flex: 1 }}>{formatPace(parseFloat(s.distance), parseFloat(s.duration)) ?? 'pace'}</Muted>
            </View>
          ) : (
            <View style={styles.setRow}>
              <Input accessibilityLabel={`Set ${i + 1} reps`} style={{ flex: 1 }} placeholder="Reps" keyboardType="numeric" value={s.reps} onChangeText={(v) => props.updateSet(i, { reps: v })} />
              <Input accessibilityLabel={`Set ${i + 1} weight kg`} style={{ flex: 1 }} placeholder="kg" keyboardType="numeric" value={s.weight} onChangeText={(v) => props.updateSet(i, { weight: v })} />
            </View>
          )}
          {props.sets.length > 1 ? (
            <Pressable accessibilityLabel={`Remove set ${i + 1}`} onPress={() => props.onRemoveSet(i)}>
              <Muted>Remove set</Muted>
            </Pressable>
          ) : null}
        </View>
      ))}
      <Pressable onPress={props.onAddSet}>
        <Text style={styles.link}>+ Add set</Text>
      </Pressable>
      <Input placeholder="Notes (optional)" value={props.notes} onChangeText={props.setNotes} multiline />
      <View style={styles.setRow}>
        <Button title={props.editing ? 'Save changes' : 'Save workout'} onPress={props.onSave} loading={props.saving} style={{ flex: 1 }} />
        <Pressable style={styles.cancelInline} onPress={props.onCancel}>
          <Muted>Cancel</Muted>
        </Pressable>
      </View>
    </Card>
  );
}

export function ExercisePicker({
  query,
  setQuery,
  exercises,
  onChoose,
  onCreate,
  loading,
}: {
  query: string;
  setQuery: (v: string) => void;
  exercises: (Exercise & { recent_at?: string | null })[];
  onChoose: (exercise: Exercise) => void;
  onCreate: () => void;
  loading: boolean;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, typeof exercises>();
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? exercises.filter((exercise) => exercise.name.toLowerCase().includes(needle))
      : exercises;
    const ordered = [...filtered].sort((a, b) => {
      if (a.recent_at && b.recent_at) return b.recent_at.localeCompare(a.recent_at);
      if (a.recent_at) return -1;
      if (b.recent_at) return 1;
      return a.name.localeCompare(b.name);
    });
    for (const exercise of ordered) map.set(exercise.muscle_group, [...(map.get(exercise.muscle_group) ?? []), exercise]);
    return [...map.entries()];
  }, [exercises]);
  return (
    <Card>
      <Input placeholder="Search exercises" value={query} onChangeText={setQuery} autoCorrect={false} />
      {loading && <ActivityIndicator />}
      {grouped.map(([group, rows]) => (
        <View key={group} style={{ gap: 5, backgroundColor: 'transparent' }}>
          <Muted>{group.replace('_', ' ').toUpperCase()}</Muted>
          {rows.slice(0, 8).map((exercise, index) => (
            <Pressable
              key={exercise.id}
              testID={`exercise-picker-row-${index}`}
              style={styles.pickerRow}
              onPress={() => onChoose(exercise)}
            >
              <Text>{exercise.name}</Text>
              <Muted>{exercise.user_id ? 'custom · ' : ''}{exercise.kind}</Muted>
            </Pressable>
          ))}
        </View>
      ))}
      {query.trim().length > 0 && !exercises.some((e) => e.name.toLowerCase() === query.trim().toLowerCase()) && (
        <Pressable onPress={onCreate}>
          <Text style={styles.link}>+ Create "{query.trim()}"</Text>
        </Pressable>
      )}
    </Card>
  );
}

export function RoutineEditor({
  routine,
  exercises,
  bottomInset = 0,
  onClose,
}: {
  routine: Routine | 'new';
  exercises: Exercise[];
  bottomInset?: number;
  onClose: () => void;
  onPickQuery: (v: string) => void;
}) {
  const createRoutine = useCreateRoutine();
  const updateRoutine = useUpdateRoutine();
  const initial = routine === 'new' ? [] : routine.routine_exercises ?? [];
  const originalItems = useMemo(
    () =>
      initial.map((item, index) => ({
        key: item.id ?? `${item.exercise_id}-${index}`,
        exercise_id: item.exercise_id,
        name: item.exercise?.name ?? 'Exercise',
        target_sets: String(item.target_sets),
        target_reps: item.target_reps?.toString() ?? '',
      })),
    [initial]
  );
  const [name, setName] = useState(routine === 'new' ? '' : routine.name);
  const [items, setItems] = useState(
    originalItems.map((item, index) => ({ ...item, position: index }))
  );
  const moveItem = (index: number, direction: -1 | 1) => {
    setItems((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };
  const save = async () => {
    if (!name.trim()) {
      Alert.alert('Name needed', 'Give this routine a name.');
      return;
    }
    const input = {
      name: name.trim(),
      notes: null,
      exercises: items.map((item, index) => ({
        exercise_id: item.exercise_id,
        position: index,
        target_sets: parseInt(item.target_sets, 10) || 3,
        target_reps: parseInt(item.target_reps, 10) || null,
      })),
    };
    try {
      if (routine === 'new') await createRoutine.mutateAsync(input);
      else await updateRoutine.mutateAsync({ id: routine.id, input });
      onClose();
    } catch (e) {
      Alert.alert('Could not save routine', e instanceof Error ? e.message : 'Please try again.');
    }
  };
  return (
    <View style={styles.sheetContent}>
      <View style={styles.sheetHeader}>
        <View style={styles.sheetTitleWrap}>
          <Text style={styles.sheetTitle}>{routine === 'new' ? 'New routine' : 'Edit routine'}</Text>
          <Muted>{items.length} exercises</Muted>
        </View>
      </View>

      <BottomSheetScrollView
        style={styles.sheetScroller}
        contentContainerStyle={[styles.editorList, { paddingBottom: bottomInset + 96 }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Routine name</Text>
          <Input accessibilityLabel="Routine name" placeholder="Routine name" value={name} onChangeText={setName} />
        </View>

        {items.map((item, index) => {
          const original = originalItems.find((candidate) => candidate.key === item.key);
          const changed =
            !!original &&
            (original.target_sets !== item.target_sets || original.target_reps !== item.target_reps);
          return (
            <View key={item.key} style={styles.editorExerciseCard}>
              <View style={styles.editorExerciseHeader}>
                <View style={styles.viewerExerciseMark}>
                  <Text style={styles.viewerExerciseNumber}>{index + 1}</Text>
                </View>
                <View style={styles.editorExerciseTitle}>
                  <Text style={styles.viewerExerciseName}>{item.name}</Text>
                  {changed ? (
                    <Text style={styles.diffText}>
                      {original?.target_sets || '-'}x{original?.target_reps || 'time'} to {item.target_sets || '-'}x{item.target_reps || 'time'}
                    </Text>
                  ) : (
                    <Muted>Target prescription</Muted>
                  )}
                </View>
                {changed ? <Text style={styles.changedPill}>Changed</Text> : null}
              </View>

              <View style={styles.editorInputRow}>
                <View style={styles.fieldGroupInline}>
                  <Text style={styles.fieldLabel}>Sets</Text>
                  <Input
                    style={styles.compactInput}
                    placeholder="Sets"
                    keyboardType="numeric"
                    value={item.target_sets}
                    onChangeText={(v) => setItems((prev) => prev.map((x, i) => (i === index ? { ...x, target_sets: v } : x)))}
                  />
                </View>
                <View style={styles.fieldGroupInline}>
                  <Text style={styles.fieldLabel}>Reps</Text>
                  <Input
                    style={styles.compactInput}
                    placeholder="Reps"
                    keyboardType="numeric"
                    value={item.target_reps}
                    onChangeText={(v) => setItems((prev) => prev.map((x, i) => (i === index ? { ...x, target_reps: v } : x)))}
                  />
                </View>
              </View>

              <View style={styles.editorActionRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${item.name} up`}
                  disabled={index === 0}
                  onPress={() => moveItem(index, -1)}
                  style={[styles.editorMiniButton, index === 0 && styles.disabledControl]}>
                  <Text style={styles.editorMiniText}>Up</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${item.name} down`}
                  disabled={index === items.length - 1}
                  onPress={() => moveItem(index, 1)}
                  style={[styles.editorMiniButton, index === items.length - 1 && styles.disabledControl]}>
                  <Text style={styles.editorMiniText}>Down</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.name}`}
                  onPress={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                  style={styles.editorRemoveButton}>
                  <Text style={styles.editorRemoveText}>Remove</Text>
                </Pressable>
              </View>
            </View>
          );
        })}

        <View style={styles.addExerciseBlock}>
          <Text style={styles.fieldLabel}>Add exercise</Text>
          <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>
            {exercises.slice(0, 20).map((exercise) => (
              <Pressable
                key={exercise.id}
                style={styles.exercisePill}
                onPress={() =>
                  setItems((prev) => [
                    ...prev,
                    {
                      key: `new-${exercise.id}-${prev.length}`,
                      exercise_id: exercise.id,
                      name: exercise.name,
                      target_sets: '3',
                      target_reps: exercise.kind === 'cardio' ? '' : '8',
                      position: prev.length,
                    },
                  ])
                }>
                <Text style={styles.pillText}>{exercise.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        <View style={styles.sheetActions}>
          <Button title="Save routine" onPress={save} loading={createRoutine.isPending || updateRoutine.isPending} style={{ flex: 1 }} />
          <Pressable accessibilityRole="button" style={styles.secondarySheetButton} onPress={onClose}>
            <Muted>Cancel</Muted>
          </Pressable>
        </View>
      </BottomSheetScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 28, gap: 12 },
  transparent: { backgroundColor: 'transparent' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, backgroundColor: 'transparent' },
  segmented: {
    flex: 1,
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(142,142,147,.22)',
    backgroundColor: 'rgba(142,142,147,.12)',
  },
  segmentButton: {
    minHeight: 44,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  segmentButtonActive: {
    backgroundColor: Brand.accent,
  },
  segmentText: {
    color: Brand.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: '#fff',
  },
  analyticsButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,.28)',
    backgroundColor: 'rgba(22,163,74,.10)',
  },
  analyticsText: { color: Brand.accent, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.72 },
  setsHeading: { fontSize: 15, fontWeight: '600', marginTop: 4 },
  setBlock: { gap: 6, paddingVertical: 5, backgroundColor: 'transparent' },
  setRow: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: 'transparent' },
  exerciseField: { borderWidth: 1, borderColor: 'rgba(142,142,147,.35)', borderRadius: 10, padding: 11 },
  pickerRow: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(142,142,147,.25)' },
  link: { color: Brand.accent, fontSize: 14, fontWeight: '600' },
  sessionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'transparent' },
  coachCard: { gap: 12, borderWidth: 1, borderColor: 'rgba(22,163,74,.16)', borderRadius: 12 },
  coachHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'transparent' },
  coachIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22,163,74,.12)',
  },
  coachCopy: { flex: 1, gap: 2, backgroundColor: 'transparent' },
  cardTitle: { fontSize: 17, fontWeight: '800' },
  cardSubtitle: { fontSize: 13, lineHeight: 18 },
  compactButton: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 10 },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    backgroundColor: 'transparent',
  },
  listTitle: { fontSize: 20, fontWeight: '800' },
  routineCard: {
    gap: 12,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(142,142,147,.12)',
  },
  routineMainRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: 'transparent' },
  routineOpenArea: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: 'transparent' },
  routineMark: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22,163,74,.10)',
  },
  routineTitleWrap: { flex: 1, gap: 6, backgroundColor: 'transparent' },
  routineEyebrow: { fontSize: 13, lineHeight: 18 },
  routineTitle: { fontSize: 18, lineHeight: 24, fontWeight: '800' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, backgroundColor: 'transparent' },
  metaPill: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    color: Brand.accent,
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: 'rgba(22,163,74,.12)',
  },
  startMiniButton: {
    minWidth: 70,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: Brand.accent,
  },
  startMiniText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  routineActions: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'transparent' },
  actionButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(142,142,147,.12)',
  },
  actionText: { color: Brand.accent, fontSize: 14, fontWeight: '800' },
  deleteTextButton: { minHeight: 44, marginLeft: 'auto', justifyContent: 'center', paddingHorizontal: 8 },
  deleteText: { color: Brand.destructive, fontSize: 13, fontWeight: '700' },
  sessionTitle: { fontSize: 16, fontWeight: '600' },
  setLine: { fontSize: 14 },
  programBox: { gap: 8, paddingTop: 8, backgroundColor: 'transparent' },
  previewDay: { borderWidth: 1, borderColor: 'rgba(22,163,74,.25)' },
  newRoutineCard: {
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(22,163,74,.38)',
    backgroundColor: 'rgba(22,163,74,.06)',
  },
  newRoutineText: { color: Brand.accent, fontSize: 16, fontWeight: '800' },
  cancelInline: { paddingHorizontal: 10, justifyContent: 'center' },
  inlineButton: { paddingHorizontal: 10, paddingVertical: 7 },
  exercisePill: { borderWidth: 1, borderColor: Brand.accent, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, marginRight: 6 },
  pillText: { color: Brand.accent, fontSize: 13 },
  sheetHandleArea: {
    paddingTop: 10,
    paddingBottom: 4,
  },
  sheetContent: {
    flex: 1,
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 0,
    backgroundColor: 'transparent',
  },
  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(142,142,147,.35)',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: 'transparent',
  },
  sheetTitleWrap: { flex: 1, gap: 3, backgroundColor: 'transparent' },
  sheetTitle: { fontSize: 22, lineHeight: 28, fontWeight: '800' },
  sheetScroller: { flex: 1 },
  sheetList: { gap: 8, paddingBottom: 24 },
  viewerExerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(142,142,147,.10)',
  },
  viewerExerciseMark: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22,163,74,.12)',
  },
  viewerExerciseNumber: { color: Brand.accent, fontSize: 14, fontWeight: '800' },
  viewerExerciseCopy: { flex: 1, gap: 2, backgroundColor: 'transparent' },
  viewerExerciseName: { fontSize: 16, lineHeight: 21, fontWeight: '700' },
  sheetActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'transparent',
  },
  secondarySheetButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(142,142,147,.12)',
  },
  editorList: { gap: 10 },
  fieldGroup: { gap: 6, backgroundColor: 'transparent' },
  fieldGroupInline: { flex: 1, gap: 6, backgroundColor: 'transparent' },
  fieldLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', color: Brand.accent },
  editorExerciseCard: {
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(142,142,147,.16)',
    backgroundColor: 'rgba(142,142,147,.08)',
  },
  editorExerciseHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'transparent' },
  editorExerciseTitle: { flex: 1, gap: 2, backgroundColor: 'transparent' },
  changedPill: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    color: Brand.accent,
    fontSize: 11,
    fontWeight: '800',
    backgroundColor: 'rgba(22,163,74,.12)',
  },
  diffText: { color: Brand.accent, fontSize: 12, fontWeight: '700' },
  editorInputRow: { flexDirection: 'row', gap: 10, backgroundColor: 'transparent' },
  compactInput: { minHeight: 44, paddingVertical: 8 },
  editorActionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'transparent' },
  editorMiniButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(142,142,147,.14)',
  },
  editorMiniText: { color: Brand.accent, fontSize: 13, fontWeight: '800' },
  editorRemoveButton: {
    minHeight: 40,
    marginLeft: 'auto',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(220,38,38,.10)',
  },
  editorRemoveText: { color: Brand.destructive, fontSize: 13, fontWeight: '800' },
  disabledControl: { opacity: 0.35 },
  addExerciseBlock: { gap: 8, backgroundColor: 'transparent' },
});
