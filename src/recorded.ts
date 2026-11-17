import { Reagent, ReagentCount } from './reagents';
import POTIONS, { COMPLETE_POTION, MIXTURE_TYPES } from './complete-potions';
import type { OutcomeSelection, RecordedPotion } from './state';

/** True if `value` is a valid reagent index. */
export function isValidReagent(value: unknown): value is Reagent {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < ReagentCount;
}

/** True if `value` is an outcome with a known potion or mixture id. */
export function isValidOutcome(value: unknown): value is OutcomeSelection {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const outcome = value as Record<string, unknown>;
  if (outcome.kind === 'potion') {
    return (
      typeof outcome.potionId === 'string' &&
      (outcome.potionId === COMPLETE_POTION.id ||
        POTIONS.some(potion => potion.id === outcome.potionId))
    );
  }
  if (outcome.kind === 'mixture') {
    return (
      typeof outcome.mixtureId === 'string' &&
      Object.hasOwn(MIXTURE_TYPES, outcome.mixtureId)
    );
  }
  return false;
}

/**
 * Validates and normalizes one persisted/shared entry. Reagents are sorted
 * ascending (the solver's convention); invalid entries return null.
 */
export function normalizeRecorded(value: unknown): RecordedPotion | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const entry = value as Record<string, unknown>;
  const reagents = entry.reagents;
  if (!Array.isArray(reagents) || reagents.length !== 3 || !reagents.every(isValidReagent)) {
    return null;
  }
  if (new Set(reagents).size !== 3) {
    return null;
  }
  if (!isValidOutcome(entry.outcome)) {
    return null;
  }
  const triple = [...(reagents as Reagent[])].sort((a, b) => a - b) as [Reagent, Reagent, Reagent];
  return { reagents: triple, outcome: entry.outcome };
}

/** True if both reagent arrays contain the same indices in the same order. */
export function sameTriple(a: readonly Reagent[], b: readonly Reagent[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
