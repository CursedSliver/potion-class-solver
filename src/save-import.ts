/**
 * Extracts potion-class trial history from a Cookie Clicker save file.
 *
 * The Just Natural Expansion mod keeps its minigame saves inside its own mod
 * data, which Cookie Clicker appends after the last `|` of the save string.
 * The potions minigame only persists a bitset of "combinations I have already
 * tried" (`x`: 193 bytes = C(22, 3) = 1540 bits); the outcome of a trial is not
 * stored. Outcomes are reconstructed here from state that *is* stored —
 * unlocked potions, plus the randomized recipe map (`rm`) when recipes have
 * been rerolled — using the minigame's own rules.
 *
 * The decoding pipeline mirrors what the minigame does:
 *   unescape → strip `!END!` → base64 → UTF-8 → after last `|` → split `;`
 *   → `JustNaturalExpansionMod:` entry → `[P]`/`[S]` unescapes → JSON
 *   → `pm` (potions minigame save) → URI-decode → JSON → trials bitset.
 */

import REAGENTS, { Reagent } from './reagents';
import POTIONS, { COMPLETE_POTION, type PotionType } from './complete-potions';
import type { MixtureId, RecordedPotion } from './state';

const SAVE_END_MARKER = '!END!';
const MOD_PREFIX = 'JustNaturalExpansionMod:';
const BASELINE_POTION_ID = 'oil_of_hephaestus';

/** The bitset covers every unordered triple of the 22 reagents. */
const NUM_REAGENTS = REAGENTS.length;
const NUM_COMBOS = (NUM_REAGENTS * (NUM_REAGENTS - 1) * (NUM_REAGENTS - 2)) / 6;
const BITSET_BYTES = 193;
const BITSET_HEX_LENGTH = BITSET_BYTES * 2;

type ReagentTriple = [Reagent, Reagent, Reagent];

/** Import options. */
export interface SaveImportOptions {
  /**
   * Import discovered potions as the generic "Complete potion" (default) so
   * their names stay hidden, instead of as the potion that was discovered.
   */
  useCompletePotions?: boolean;
}

export interface SaveImportSuccess {
  ok: true;
  /** One entry per reconstructed trial, sorted by reagent indices. */
  entries: RecordedPotion[];
  /** Number of tried combinations the save records. */
  tested: number;
  /** Tried combinations whose outcome could not be reconstructed. */
  unclassified: number;
}

export interface SaveImportFailure {
  ok: false;
  error: string;
}

export type SaveImportOutcome = SaveImportSuccess | SaveImportFailure;

// ---------------------------------------------------------------------------
// Combination indexing (port of TriedRecipes.recipe_index)
// ---------------------------------------------------------------------------

function combinations2(n: number): number {
  return n > 1 ? (n * (n - 1)) / 2 : 0;
}

function combinations1(n: number): number {
  return n > 0 ? n : 0;
}

function recipeIndex(a: number, b: number, c: number): number {
  const sorted = [a, b, c].sort((x, y) => x - y);
  const [first, second, third] = sorted;
  if (first < 0 || third >= NUM_REAGENTS || first === second || second === third) {
    return -1;
  }
  let index = 0;
  for (let i = 0; i < first; i += 1) index += combinations2(NUM_REAGENTS - i - 1);
  for (let j = first + 1; j < second; j += 1) index += combinations1(NUM_REAGENTS - j - 1);
  return index + third - second - 1;
}

/** Index → reagent triple, in the order the minigame assigns bit indices. */
const COMBOS_BY_INDEX: ReagentTriple[] = (() => {
  const combos: ReagentTriple[] = [];
  for (let a = 0; a < NUM_REAGENTS; a += 1) {
    for (let b = a + 1; b < NUM_REAGENTS; b += 1) {
      for (let c = b + 1; c < NUM_REAGENTS; c += 1) {
        combos[recipeIndex(a, b, c)] = [a as Reagent, b as Reagent, c as Reagent];
      }
    }
  }
  return combos;
})();

function tripleKey(triple: readonly number[]): string {
  return triple.join('-');
}

// ---------------------------------------------------------------------------
// Save decoding
// ---------------------------------------------------------------------------

/**
 * Cookie Clicker's own base64 of URI-encoded UTF-8, kept verbatim from the
 * mod's save handling. Returns '' when the string is not valid.
 */
function base64ToUtf8(input: string): string {
  try {
    return decodeURIComponent(
      Array.prototype.map.call(atob(input), (character: string) => {
        return '%' + ('00' + character.charCodeAt(0).toString(16)).slice(-2);
      }).join(''),
    );
  } catch {
    return '';
  }
}

/**
 * Finds and parses the Just Natural Expansion entry in the mod-data section.
 *
 * Entries are separated by `;` and a mod's own data escapes the delimiters as
 * `[P]` (pipe) and `[S]` (semicolon). Should a save hold a raw `;` inside the
 * entry anyway, the following parts are re-joined until the JSON parses.
 */
function readModData(modSection: string): { found: boolean; data?: unknown } {
  const parts = modSection.split(';');
  const start = parts.findIndex(part => part.startsWith(MOD_PREFIX));
  if (start === -1) {
    return { found: false };
  }
  // Offset of the entry in `modSection`; split + join round-trips exactly.
  const offset = parts.slice(0, start).join(';').length + (start > 0 ? 1 : 0);
  // A mod entry spans at most a few parts, so bound the re-join attempts.
  const limit = Math.min(parts.length, start + 64);
  for (let end = start; end < limit; end += 1) {
    const length = parts.slice(start, end + 1).join(';').length;
    const json = modSection
      .slice(offset, offset + length)
      .slice(MOD_PREFIX.length)
      .split('[P]')
      .join('|')
      .split('[S]')
      .join(';');
    try {
      return { found: true, data: JSON.parse(json) };
    } catch {
      // Keep growing the slice: the split may have cut the JSON in half.
    }
  }
  return { found: true };
}

function readPotionsSave(modData: unknown): { ok: true; payload: unknown } | { ok: false } {
  if (typeof modData !== 'object' || modData === null) {
    return { ok: false };
  }
  const pm = (modData as Record<string, unknown>).pm;
  if (typeof pm !== 'string' || pm === '') {
    return { ok: false };
  }
  let json = pm;
  try {
    json = decodeURIComponent(pm);
  } catch {
    // Older saves may store the payload as plain JSON.
  }
  try {
    return { ok: true, payload: JSON.parse(json) };
  } catch {
    return { ok: false };
  }
}

function decodeBitset(hex: string): Set<number> {
  const bytes = new Uint8Array(BITSET_BYTES);
  for (let i = 0; i < BITSET_BYTES; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  const tried = new Set<number>();
  for (let index = 0; index < NUM_COMBOS; index += 1) {
    if ((bytes[index >> 3] & (1 << (index & 7))) !== 0) {
      tried.add(index);
    }
  }
  return tried;
}

/** Decodes the minigame's compact randomized-recipe map. */
function decodeRecipeMap(
  hex: string,
  activePotions: readonly PotionType[],
): Map<string, ReagentTriple> {
  const recipes = new Map<string, ReagentTriple>();
  if (hex.length < 2) {
    return recipes;
  }
  const count = parseInt(hex.slice(0, 2), 16);
  const data = hex.slice(2);
  const bits: number[] = [];
  for (let i = 0; i < data.length; i += 2) {
    const byte = parseInt(data.slice(i, i + 2), 16);
    for (let k = 7; k >= 0; k -= 1) {
      bits.push((byte >> k) & 1);
    }
  }
  let bit = 0;
  const nextValue = (): number => {
    let value = 0;
    for (let k = 0; k < 5; k += 1) {
      value = (value << 1) | (bits[bit] ?? 0);
      bit += 1;
    }
    return value;
  };
  for (let i = 0; i < activePotions.length && i < count; i += 1) {
    const triple: number[] = [];
    for (let j = 0; j < 3; j += 1) {
      triple.push(nextValue());
    }
    if (
      triple.some(value => !Number.isInteger(value) || value < 0 || value >= NUM_REAGENTS) ||
      new Set(triple).size !== 3
    ) {
      continue;
    }
    const sorted = [...triple].sort((x, y) => x - y) as ReagentTriple;
    recipes.set(activePotions[i].id, sorted);
  }
  return recipes;
}

function isRecordArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** Potions the mod has unlocked: saved flags, honouring prestige gating. */
function unlockedPotionIds(payload: Record<string, unknown>): Set<string> {
  const flags = isRecordArray(payload.p) ? payload.p : [];
  const unlocked = new Set<string>();
  POTIONS.forEach((potion, index) => {
    const flag = flags[index];
    if (flag === 2 || (flag === undefined && potion.unlocked === true)) {
      unlocked.add(potion.id);
    }
  });
  // The minigame force-unlocks its starter potion until the first prestige.
  const prestigeCount = typeof payload.pc === 'number' ? payload.pc : 0;
  if (prestigeCount === 0) {
    unlocked.add(BASELINE_POTION_ID);
  }
  return unlocked;
}

function activePotionsInModOrder(unlockedPrestige: readonly string[]): PotionType[] {
  return POTIONS.filter(potion => !potion.prestige || unlockedPrestige.includes(potion.id));
}

/** Potion recipes in effect for this save: randomized map, else fixed table. */
function resolveRecipes(
  payload: Record<string, unknown>,
  activePotions: readonly PotionType[],
): Map<string, ReagentTriple> {
  const recipes = new Map<string, ReagentTriple>();
  const recipeMap = typeof payload.rm === 'string' ? payload.rm : '';
  if (recipeMap !== '') {
    for (const [id, triple] of decodeRecipeMap(recipeMap, activePotions)) {
      recipes.set(id, triple);
    }
    if (recipes.size > 0) {
      return recipes;
    }
  }
  for (const potion of activePotions) {
    const keys = potion.reagents ? Object.keys(potion.reagents) : [];
    if (keys.length !== 3) {
      continue;
    }
    const indices = keys.map(key => REAGENTS.findIndex(reagent => reagent.id === key));
    if (indices.some(index => index < 0)) {
      continue;
    }
    recipes.set(potion.id, [...indices].sort((x, y) => x - y) as ReagentTriple);
  }
  return recipes;
}

/**
 * The minigame's mixture tier: how many of the three reagent pairs also appear
 * together in some still-unknown potion's recipe.
 */
function buildKnownPairs(
  activePotions: readonly PotionType[],
  recipes: ReadonlyMap<string, ReagentTriple>,
  unlocked: ReadonlySet<string>,
): Set<string> {
  const pairs = new Set<string>();
  for (const potion of activePotions) {
    if (unlocked.has(potion.id)) {
      continue;
    }
    const recipe = recipes.get(potion.id);
    if (!recipe) {
      continue;
    }
    pairs.add(tripleKey([recipe[0], recipe[1]].sort((x, y) => x - y)));
    pairs.add(tripleKey([recipe[0], recipe[2]].sort((x, y) => x - y)));
    pairs.add(tripleKey([recipe[1], recipe[2]].sort((x, y) => x - y)));
  }
  return pairs;
}

function mixtureTier(triple: ReagentTriple, knownPairs: ReadonlySet<string>): MixtureId {
  const [first, second, third] = triple;
  let matchingPairs = 0;
  for (const [x, y] of [
    [first, second],
    [first, third],
    [second, third],
  ]) {
    if (knownPairs.has(tripleKey([x, y].sort((a, b) => a - b)))) {
      matchingPairs += 1;
    }
  }
  if (matchingPairs >= 3) return 'extraordinary_promising';
  if (matchingPairs >= 2) return 'very_promising';
  if (matchingPairs >= 1) return 'promising';
  return 'useless';
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/** Decodes a Cookie Clicker save and returns every trial it can reconstruct. */
export function importFromSave(
  text: string,
  options: SaveImportOptions = {},
): SaveImportOutcome {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { ok: false, error: 'Paste your save file first.' };
  }

  let decoded = '';
  try {
    let raw = unescape(trimmed);
    if (!raw.endsWith(SAVE_END_MARKER)) {
      return {
        ok: false,
        error:
          'That does not look like a Cookie Clicker save: the !END! marker is missing. ' +
          'Copy the whole save again from Options → Save.',
      };
    }
    raw = raw.slice(0, -SAVE_END_MARKER.length);
    decoded = base64ToUtf8(raw);
  } catch {
    return { ok: false, error: 'That save could not be decoded; it may be truncated or corrupted.' };
  }
  if (decoded === '') {
    return { ok: false, error: 'That save could not be decoded; it may be truncated or corrupted.' };
  }

  const lastPipe = decoded.lastIndexOf('|');
  if (lastPipe === -1) {
    return { ok: false, error: 'That save contains no mod data.' };
  }
  const modData = readModData(decoded.slice(lastPipe + 1));
  if (!modData.found) {
    return {
      ok: false,
      error: 'That save was not made with the Just Natural Expansion mod, so it has no potion data.',
    };
  }
  if (modData.data === undefined) {
    return {
      ok: false,
      error: 'The Just Natural Expansion data in that save could not be read.',
    };
  }

  const potionsSave = readPotionsSave(modData.data);
  if (!potionsSave.ok) {
    return {
      ok: false,
      error:
        'That save has no potions minigame data. Open the Alchemy lab minigame once, save, and try again.',
    };
  }

  return extractTrials(potionsSave.payload, options.useCompletePotions !== false);
}

function extractTrials(payload: unknown, useCompletePotions: boolean): SaveImportOutcome {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'The potion data in that save could not be read.' };
  }
  const data = payload as Record<string, unknown>;
  if (data.v !== 1 && data.v !== 2) {
    return { ok: false, error: 'That save holds an unsupported potions minigame version.' };
  }
  const bitset = data.x;
  if (typeof bitset !== 'string' || bitset.length !== BITSET_HEX_LENGTH || !/^[0-9a-f]+$/i.test(bitset)) {
    return { ok: false, error: 'That save has no potion trial history yet.' };
  }

  const unlockedPrestige = isRecordArray(data.up)
    ? data.up.filter((id): id is string => typeof id === 'string')
    : [];
  const activePotions = activePotionsInModOrder(unlockedPrestige);
  const recipes = resolveRecipes(data, activePotions);
  const unlocked = unlockedPotionIds(data);
  const knownPairs = buildKnownPairs(activePotions, recipes, unlocked);

  const recipeByTriple = new Map<string, string>();
  for (const potion of activePotions) {
    const recipe = recipes.get(potion.id);
    if (recipe) {
      recipeByTriple.set(tripleKey(recipe), potion.id);
    }
  }

  const tried = decodeBitset(bitset);
  const entries: RecordedPotion[] = [];
  let unclassified = 0;
  for (const index of tried) {
    const triple = COMBOS_BY_INDEX[index];
    if (!triple) {
      unclassified += 1;
      continue;
    }
    const potionId = recipeByTriple.get(tripleKey(triple));
    if (potionId !== undefined) {
      // The combination was brewed before that potion was unlocked, so it is a
      // discovery. Its name is kept hidden behind the generic Complete potion.
      if (!unlocked.has(potionId)) {
        unclassified += 1;
        continue;
      }
      entries.push({
        reagents: triple,
        outcome: { kind: 'potion', potionId: useCompletePotions ? COMPLETE_POTION.id : potionId },
      });
      continue;
    }
    entries.push({ reagents: triple, outcome: { kind: 'mixture', mixtureId: mixtureTier(triple, knownPairs) } });
  }

  entries.sort((a, b) => a.reagents[0] - b.reagents[0] || a.reagents[1] - b.reagents[1] || a.reagents[2] - b.reagents[2]);
  return { ok: true, entries, tested: tried.size, unclassified };
}
