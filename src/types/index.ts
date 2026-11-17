export type Screen = 'landing' | 'login' | 'register' | 'dashboard' | 'builder' | 'runner' | 'history' | 'social';

export type ExerciseKey =
  | 'squat'
  | 'shoulders'
  | 'biceps'
  | 'pushups'
  | 'plank'
  | 'lunges'
  | 'burpee'
  | 'jumping_jacks'
  | 'climbers';

export interface User {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string;
}

export interface SocialPost {
  id: string;
  authorId?: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  createdAt: string;
  likesCount: number;
  isLiked: boolean;
}

export const AVATAR_OPTIONS = [
  { id: 'lion', emoji: '🦁', name: 'Лев' },
  { id: 'lightning', emoji: '⚡', name: 'Молния' },
  { id: 'cyborg', emoji: '🦾', name: 'Киборг' },
  { id: 'eagle', emoji: '🦅', name: 'Орёл' },
  { id: 'fire', emoji: '🔥', name: 'Огонь' }
];

export const DEFAULT_AVATAR = '⚡';

export interface DiaryEntry {
  id: number;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  createdAt?: string;
}

export interface DailyTargets {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface WorkoutSet {
  id: string;
  exercise: ExerciseKey | string;
  exerciseName?: string;
  reps: number;
  createdAt: string;
}

export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface ExerciseState {
  reps: number;
  stage: string;
  statusText: string;
  statusColor: string;
  errorFlag: boolean;
  feedback?: string;
  angles?: Record<string, number>;
}

export interface ExerciseDefinition {
  key: ExerciseKey;
  name: string;
  description: string;
  icon: string;
  hasAiCamera: boolean;
  defaultSets: number;
  defaultReps: number;
  unit: string;
}

export interface ConfiguredExercise {
  key: ExerciseKey;
  name: string;
  icon: string;
  hasAiCamera: boolean;
  setsCount: number;
  targetReps: number;
  unit: string;
}

export interface WorkoutSessionConfig {
  name: string;
  exercises: ConfiguredExercise[];
  restDurationSeconds: number;
}

export interface CompletedWorkoutSession {
  id: string;
  name: string;
  completedAt: string;
  durationSeconds: number;
  totalSets: number;
  totalReps: number;
  exercises: {
    key: string;
    name: string;
    icon: string;
    hasAiCamera: boolean;
    setsCount: number;
    targetReps: number;
    unit: string;
  }[];
}
