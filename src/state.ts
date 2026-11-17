import {
  DEFAULT_REAGENT_PREFERENCE,
  REAGENT_PREFERENCES,
  Reagent,
  ReagentCount,
} from './reagents';
import type { ReagentPreference } from './reagents';
import { MIXTURE_TYPES } from './complete-potions';
import { PotionResult } from './solver/solver';
import { normalizeRecorded, sameTriple } from './recorded';

export type MixtureId = keyof typeof MIXTURE_TYPES;

/** What the player got out of a brew: either a known recipe or a filler mixture. */
export type OutcomeSelection =
  | { kind: 'potion'; potionId: string }
  | { kind: 'mixture'; mixtureId: MixtureId };

export interface RecordedPotion {
  /** Reagent indices, sorted ascending (matches the solver's convention). */
  reagents: [Reagent, Reagent, Reagent];
  outcome: OutcomeSelection;
}

const MIXTURE_RESULT: Record<MixtureId, PotionResult> = {
  useless: PotionResult.USELESS,
  promising: PotionResult.PROMISING,
  very_promising: PotionResult.VERY,
  extraordinary_promising: PotionResult.EXTRAORDINARY,
};

export function outcomeToResult(outcome: OutcomeSelection): PotionResult {
  return outcome.kind === 'potion' ? PotionResult.COMPLETE : MIXTURE_RESULT[outcome.mixtureId];
}

export const BREWING_SLOTS = 3;

interface AppState {
  brewing: Reagent[];
  outcome: OutcomeSelection | null;
  recorded: RecordedPotion[];
  /** One classification per reagent index (`Reagent`). */
  reagentPreferences: ReagentPreference[];
}

const STORAGE_KEY = 'potion-class-solver:recorded:v1';
const PREFERENCES_STORAGE_KEY = 'potion-class-solver:reagent-preferences:v1';

function isReagentPreference(value: unknown): value is ReagentPreference {
  return typeof value === 'string'
    && (REAGENT_PREFERENCES as readonly string[]).includes(value);
}

function loadRecorded(): RecordedPotion[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const result: RecordedPotion[] = [];
    for (const item of parsed) {
      const rec = normalizeRecorded(item);
      if (!rec || result.some(existing => sameTriple(existing.reagents, rec.reagents))) {
        continue;
      }
      result.push(rec);
    }
    return result;
  } catch {
    return [];
  }
}

function persist(recorded: RecordedPotion[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recorded));
  } catch {
    // Storage unavailable (private mode, etc.) — persistence is best-effort.
  }
}

function defaultPreferences(): ReagentPreference[] {
  return new Array<ReagentPreference>(ReagentCount).fill(DEFAULT_REAGENT_PREFERENCE);
}

function loadPreferences(): ReagentPreference[] {
  const preferences = defaultPreferences();
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return preferences;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return preferences;
    }
    for (let reagent = 0; reagent < ReagentCount; reagent++) {
      const value = parsed[reagent];
      if (isReagentPreference(value)) {
        preferences[reagent] = value;
      }
    }
  } catch {
    // Corrupt or unavailable storage — fall back to all-neutral preferences.
  }
  return preferences;
}

function persistPreferences(preferences: readonly ReagentPreference[]): void {
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage unavailable (private mode, etc.) — persistence is best-effort.
  }
}

let state: AppState = {
  brewing: [],
  outcome: null,
  recorded: loadRecorded(),
  reagentPreferences: loadPreferences(),
};

const listeners = new Set<() => void>();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getState(): Readonly<AppState> {
  return state;
}

/**
 * Adds a reagent to the brewing field, or removes it when it is already
 * selected. Adding is ignored once all slots are full.
 */
export function toggleReagentInBrewing(reagent: Reagent): void {
  if (state.brewing.includes(reagent)) {
    state = { ...state, brewing: state.brewing.filter(existing => existing !== reagent) };
    emit();
    return;
  }
  if (state.brewing.length >= BREWING_SLOTS) {
    return;
  }
  state = { ...state, brewing: [...state.brewing, reagent] };
  emit();
}

/** Removes the reagent in the brewing slot at `index`. */
export function removeBrewingAt(index: number): void {
  state = { ...state, brewing: state.brewing.filter((_, i) => i !== index) };
  emit();
}

export function setOutcome(outcome: OutcomeSelection | null): void {
  state = { ...state, outcome };
  emit();
}

export function getReagentPreference(reagent: Reagent): ReagentPreference {
  return state.reagentPreferences[reagent] ?? DEFAULT_REAGENT_PREFERENCE;
}

/** Changes one reagent's classification and, with it, the solver order. */
export function setReagentPreference(
  reagent: Reagent,
  preference: ReagentPreference,
): void {
  if (state.reagentPreferences[reagent] === preference) {
    return;
  }
  const reagentPreferences = [...state.reagentPreferences];
  reagentPreferences[reagent] = preference;
  state = { ...state, reagentPreferences };
  persistPreferences(reagentPreferences);
  emit();
}

/** True if this reagent triple (in any order) has already been recorded. */
export function isRecorded(reagents: readonly Reagent[]): boolean {
  const sorted = [...reagents].sort((a, b) => a - b);
  return state.recorded.some(rec => sameTriple(rec.reagents, sorted));
}

/** Records the current brewing + outcome; resets both on success. */
export function recordCurrent(): boolean {
  const { brewing, outcome } = state;
  if (brewing.length !== BREWING_SLOTS || !outcome || isRecorded(brewing)) {
    return false;
  }
  const reagents = [...brewing].sort((a, b) => a - b) as [Reagent, Reagent, Reagent];
  const recorded = [...state.recorded, { reagents, outcome }];
  state = { ...state, brewing: [], outcome: null, recorded };
  persist(recorded);
  emit();
  return true;
}

/**
 * Records an explicit reagent triple + outcome. Used by the quick outcome
 * buttons in the checking section, which know both halves of the entry from
 * the solver result. Leaves any in-progress manual selection untouched.
 */
export function recordCombination(
  reagents: readonly Reagent[],
  outcome: OutcomeSelection,
): boolean {
  const sorted = [...reagents].sort((a, b) => a - b);
  if (sorted.length !== BREWING_SLOTS || new Set(sorted).size !== BREWING_SLOTS) {
    return false;
  }
  if (isRecorded(sorted)) {
    return false;
  }
  const recorded = [
    ...state.recorded,
    { reagents: sorted as [Reagent, Reagent, Reagent], outcome },
  ];
  state = { ...state, recorded };
  persist(recorded);
  emit();
  return true;
}

/**
 * Replaces the recorded list wholesale, dropping repeated reagent triples.
 * Used by share-code import and save import, which restore a list rather than
 * merging into the current one.
 */
export function replaceRecorded(entries: readonly RecordedPotion[]): void {
  const next: RecordedPotion[] = [];
  for (const entry of entries) {
    if (!next.some(rec => sameTriple(rec.reagents, entry.reagents))) {
      next.push(entry);
    }
  }
  state = { ...state, recorded: next };
  persist(next);
  emit();
}

export function removeRecorded(index: number): void {
  state = { ...state, recorded: state.recorded.filter((_, i) => i !== index) };
  persist(state.recorded);
  emit();
}

export function clearRecorded(): void {
  if (state.recorded.length === 0) {
    return;
  }
  state = { ...state, recorded: [] };
  persist(state.recorded);
  emit();
}
