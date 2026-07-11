import { formatPace, todayISO } from '@shared';
import type { Exercise, GeneratedProgram, Routine, RoutineDiff, WorkoutSession } from '@shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { Button, Card, Chip, ChipRow, EmptyState, Input, Muted, SectionTitle } from '@/components/ui';
import { Brand } from '@/constants/Colors';
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

export default function WorkoutsScreen() {
  const router = useRouter();
  const [segment, setSegment] = useState<Segment>('routines');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<WorkoutSession | null>(null);
  const [routineEditing, setRoutineEditing] = useState<Routine | 'new' | null>(null);
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
      const program = await generateProgram.mutateAsync({
        goal: programGoal,
        experience: programExperience,
        days_per_week: Math.max(1, Math.min(7, parseInt(programDays, 10) || 3)),
        equipment: programEquipment.split(',').map((item) => item.trim()).filter(Boolean),
        constraints: programConstraints.trim() || undefined,
      });
      setGeneratedProgram(program);
    } catch (e) {
      Alert.alert('Could not generate program', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const saveAiProgram = async () => {
    if (!generatedProgram) return;
    try {
      await saveGeneratedProgram.mutateAsync({ program: generatedProgram });
      setGeneratedProgram(null);
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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <ChipRow>
            <Chip label="Routines" active={segment === 'routines'} onPress={() => setSegment('routines')} />
            <Chip label="History" active={segment === 'history'} onPress={() => setSegment('history')} />
          </ChipRow>
          <Pressable accessibilityLabel="Gym analytics" onPress={() => router.push('/gym-analytics')}>
            <Text style={styles.iconLink}>↗</Text>
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

        {routineEditing ? (
          <RoutineEditor
            routine={routineEditing}
            exercises={exercises}
            onClose={() => setRoutineEditing(null)}
            onPickQuery={setExerciseQuery}
          />
        ) : segment === 'routines' ? (
          <>
            <Card>
              <View style={styles.sessionHeader}>
                <View style={{ backgroundColor: 'transparent', flex: 1 }}>
                  <Text style={styles.sessionTitle}>Generate my program</Text>
                  <Muted>Answer a few questions, preview the plan, then save editable routines.</Muted>
                </View>
                <Button title={showProgramGen ? 'Hide' : 'Open'} onPress={() => setShowProgramGen((v) => !v)} />
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
            {routinesQuery.isLoading && <ActivityIndicator />}
            {routines.map((routine) => (
              <Card key={routine.id}>
                <View style={styles.sessionHeader}>
                  <View style={{ backgroundColor: 'transparent' }}>
                    <Text style={styles.sessionTitle}>{routine.name}</Text>
                    <Muted>{routine.routine_exercises?.length ?? 0} exercises</Muted>
                  </View>
                  <Button title="Start" onPress={() => startRoutine(routine)} />
                </View>
                <Pressable onPress={() => setRoutineEditing(routine)}>
                  <Text style={styles.link}>Edit routine</Text>
                </Pressable>
                <Pressable onPress={() => suggestAdaptation(routine)}>
                  <Text style={styles.link}>Coach suggestion</Text>
                </Pressable>
                <Pressable onLongPress={() => deleteRoutine.mutate(routine.id)}>
                  <Muted>Long-press here to delete.</Muted>
                </Pressable>
              </Card>
            ))}
            <Pressable onPress={() => setRoutineEditing('new')}>
              <Card style={styles.centerCard}>
                <Text style={styles.link}>+ New routine</Text>
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
    </KeyboardAvoidingView>
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
  onClose,
}: {
  routine: Routine | 'new';
  exercises: Exercise[];
  onClose: () => void;
  onPickQuery: (v: string) => void;
}) {
  const createRoutine = useCreateRoutine();
  const updateRoutine = useUpdateRoutine();
  const initial = routine === 'new' ? [] : routine.routine_exercises ?? [];
  const [name, setName] = useState(routine === 'new' ? '' : routine.name);
  const [items, setItems] = useState(
    initial.map((item, index) => ({
      exercise_id: item.exercise_id,
      name: item.exercise?.name ?? 'Exercise',
      target_sets: String(item.target_sets),
      target_reps: item.target_reps?.toString() ?? '',
      position: index,
    }))
  );
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
    <Card>
      <Text style={styles.sessionTitle}>{routine === 'new' ? 'New routine' : 'Edit routine'}</Text>
      <Input accessibilityLabel="Routine name" placeholder="Routine name" value={name} onChangeText={setName} />
      {items.map((item, index) => (
        <View key={`${item.exercise_id}-${index}`} style={styles.setBlock}>
          <Text>{item.name}</Text>
          <View style={styles.setRow}>
            <Input style={{ flex: 1 }} placeholder="Sets" keyboardType="numeric" value={item.target_sets} onChangeText={(v) => setItems((prev) => prev.map((x, i) => (i === index ? { ...x, target_sets: v } : x)))} />
            <Input style={{ flex: 1 }} placeholder="Reps" keyboardType="numeric" value={item.target_reps} onChangeText={(v) => setItems((prev) => prev.map((x, i) => (i === index ? { ...x, target_reps: v } : x)))} />
          </View>
          <View style={styles.setRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Move ${item.name} up`}
              disabled={index === 0}
              onPress={() =>
                setItems((prev) => {
                  const next = [...prev];
                  [next[index - 1], next[index]] = [next[index], next[index - 1]];
                  return next;
                })
              }>
              <Muted>Move up</Muted>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Move ${item.name} down`}
              disabled={index === items.length - 1}
              onPress={() =>
                setItems((prev) => {
                  const next = [...prev];
                  [next[index], next[index + 1]] = [next[index + 1], next[index]];
                  return next;
                })
              }>
              <Muted>Move down</Muted>
            </Pressable>
            <Button
              title="Remove"
              variant="destructive"
              accessibilityLabel={`Remove ${item.name}`}
              onPress={() => setItems((prev) => prev.filter((_, i) => i !== index))}
              style={styles.inlineButton}
            />
          </View>
        </View>
      ))}
      <ScrollView horizontal keyboardShouldPersistTaps="handled" style={{ maxHeight: 46 }}>
        {exercises.slice(0, 20).map((exercise) => (
          <Pressable
            key={exercise.id}
            style={styles.exercisePill}
            onPress={() =>
              setItems((prev) => [
                ...prev,
                { exercise_id: exercise.id, name: exercise.name, target_sets: '3', target_reps: exercise.kind === 'cardio' ? '' : '8', position: prev.length },
              ])
            }>
            <Text style={styles.pillText}>{exercise.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.setRow}>
        <Button title="Save routine" onPress={save} loading={createRoutine.isPending || updateRoutine.isPending} style={{ flex: 1 }} />
        <Pressable style={styles.cancelInline} onPress={onClose}>
          <Muted>Cancel</Muted>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'transparent' },
  iconLink: { color: Brand.accent, fontSize: 22, fontWeight: '700' },
  setsHeading: { fontSize: 15, fontWeight: '600', marginTop: 4 },
  setBlock: { gap: 6, paddingVertical: 5, backgroundColor: 'transparent' },
  setRow: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: 'transparent' },
  exerciseField: { borderWidth: 1, borderColor: 'rgba(142,142,147,.35)', borderRadius: 10, padding: 11 },
  pickerRow: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(142,142,147,.25)' },
  link: { color: Brand.accent, fontSize: 14, fontWeight: '600' },
  sessionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'transparent' },
  sessionTitle: { fontSize: 16, fontWeight: '600' },
  setLine: { fontSize: 14 },
  programBox: { gap: 8, paddingTop: 8, backgroundColor: 'transparent' },
  previewDay: { borderWidth: 1, borderColor: 'rgba(22,163,74,.25)' },
  centerCard: { alignItems: 'center' },
  cancelInline: { paddingHorizontal: 10, justifyContent: 'center' },
  inlineButton: { paddingHorizontal: 10, paddingVertical: 7 },
  exercisePill: { borderWidth: 1, borderColor: Brand.accent, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, marginRight: 6 },
  pillText: { color: Brand.accent, fontSize: 13 },
});
