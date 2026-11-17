import REAGENTS, {
  REAGENT_PREFERENCES,
  Reagent,
  ReagentCount,
  ReagentsSortedFromEasyToHard,
  sortReagentsByPreference,
} from './reagents';
import type { ReagentPreference, ReagentType } from './reagents';
import POTIONS, { COMPLETE_POTION, MIXTURE_TYPES } from './complete-potions';
import type { PotionType } from './complete-potions';
import solve from './solver/solver';
import type { Potion, SolveResult } from './solver/solver';
import { begin } from './z-solver-ready';
import { createIcon } from './ui/icons';
import type { IconSpec } from './ui/icons';
import { attachTooltip, hideTooltip } from './ui/tooltip';
import type { TooltipContent, TooltipRow } from './ui/tooltip';
import { formatBrewTime, formatPercent } from './ui/format';
import { openPrompt } from './ui/prompt';
import { renderMarkdown } from './ui/markdown';
import { INFO_SECTIONS } from './info';
import type { InfoSection } from './info';
import { copyText } from './ui/clipboard';
import { decodeRecorded, encodeRecorded } from './share';
import { importFromSave } from './save-import';
import type { SaveImportSuccess } from './save-import';
import * as store from './state';
import type { MixtureId, OutcomeSelection, RecordedPotion } from './state';

// The Reagent enum values must match the REAGENTS array order (index = enum value).
if (REAGENTS.length !== ReagentCount || REAGENTS[Reagent.TECHNOJUICE].id !== 'technojuice') {
  throw new Error('Reagent enum indices do not match the REAGENTS array order');
}

const rootNode = document.querySelector<HTMLElement>('#app');
if (!rootNode) {
  throw new Error('#app element not found');
}
const app: HTMLElement = rootNode;

app.innerHTML = `
  <header class="page-header">
    <h1>Potion Class Solver</h1>
  </header>

  <section class="card" aria-labelledby="save-import-title">
    <div class="card__header">
      <h2 id="save-import-title">Import save</h2>
    </div>
    <div class="card__body">
      <p class="field__caption save-import__caption">
        Paste your Cookie Clicker save here and click "Import" to pull in every mixture you have created so far.
        <br>To do so, open Cookie Clicker, open Options -> Export save.
      </p>
      <textarea class="save-import__input" data-ref="saveInput" rows="6" spellcheck="false"
        placeholder="Paste your Cookie Clicker save here…"
        aria-label="Cookie Clicker save data"></textarea>
      <div class="save-import__footer">
        <button type="button" class="btn btn--primary btn--large" data-ref="saveImportBtn">Import</button>
        <label class="save-import__option">
          <input type="checkbox" data-ref="saveUseComplete" checked>
          <span>Use complete potions</span>
        </label>
        <p class="save-import__status" data-ref="saveStatus" role="status" aria-live="polite"></p>
      </div>
    </div>
  </section>

  <section class="card" aria-labelledby="record-title">
    <div class="card__header">
      <h2 id="record-title">Manual input</h2>
      <button type="button" class="btn btn--ghost btn--small section-toggle" data-ref="recordToggle"
        aria-expanded="false" aria-controls="record-body">
        <span data-ref="recordToggleLabel">Expand</span>
        <span class="section-toggle__chevron" aria-hidden="true"></span>
      </button>
    </div>
    <div class="card__body" id="record-body" data-ref="recordBody" hidden>
      <div class="field">
        <h3 class="field__title">Reagents</h3>
        <div class="icon-grid" data-ref="reagentGrid"></div>
      </div>

      <div class="field">
        <h3 class="field__title">Mixtures</h3>
        <div class="icon-grid" data-ref="informationalGrid"></div>
      </div>

      <div class="field field--boxed">
        <div class="field__header">
          <h3 class="field__title">Potions</h3>
          <div class="field__actions">
            <span class="spoiler-warning" data-ref="potionSpoiler">Spoiler warning: will reveal all potions, including prestige potions.</span>
            <button type="button" class="btn btn--ghost btn--small" data-ref="potionToggle"
              aria-expanded="false" aria-controls="potion-grid">Unhide</button>
          </div>
        </div>
        <div class="icon-grid" id="potion-grid" data-ref="potionGrid" hidden></div>
      </div>

      <div class="brew-row">
        <div class="brew-block">
          <h3 class="field__title">Brewing</h3>
          <div class="slot-row" data-ref="brewSlots"></div>
        </div>
        <div class="brew-block">
          <h3 class="field__title">Outcome</h3>
          <div class="slot-row">
            <button type="button" class="slot slot--outcome" data-ref="outcomeSlot"></button>
          </div>
        </div>
        <div class="brew-block">
          <h3 class="field__title">Record</h3>
          <button type="button" class="btn btn--primary" data-ref="recordBtn">Record potion</button>
        </div>
      </div>
    </div>
  </section>

  <section class="card" aria-labelledby="recorded-title">
    <div class="card__header">
      <h2 id="recorded-title">Recorded potions <span class="card__count" data-ref="recordedCount"></span></h2>
      <div class="card__actions">
        <button type="button" class="btn btn--ghost btn--small" data-ref="clearBtn" hidden>Clear all</button>
        <button type="button" class="btn btn--ghost btn--small section-toggle" data-ref="recordedToggle"
          aria-expanded="false" aria-controls="recorded-body">
          <span data-ref="recordedToggleLabel">Expand</span>
          <span class="section-toggle__chevron" aria-hidden="true"></span>
        </button>
      </div>
    </div>
    <div class="card__body" id="recorded-body" data-ref="recordedBody" hidden>
      <div class="recorded">
        <ul class="recorded__list" data-ref="recordedList"></ul>
      </div>

      <div class="share">
        <div class="share__text">
          <h3 class="field__title">Save and restore</h3>
          <p class="field__caption">
            Migrate your potions catalogue with the buttons to the right.
          </p>
        </div>
        <div class="share__actions">
          <button type="button" class="btn btn--ghost" data-ref="exportBtn">Export</button>
          <button type="button" class="btn btn--ghost" data-ref="importBtn">Import</button>
        </div>
        <p class="share__status" data-ref="shareStatus" role="status" aria-live="polite"></p>
      </div>
    </div>
  </section>

  <section class="card" aria-labelledby="check-title">
    <div class="card__header">
      <h2 id="check-title">Checking</h2>
    </div>
    <button type="button" class="btn btn--primary btn--large solve-btn" data-ref="solveBtn">Solve</button>
    <p class="solve-status" data-ref="solveStatus" role="status" aria-live="polite"></p>
    <p class="solve-hint" data-ref="solveHint" role="status" aria-live="polite" hidden></p>
    <div class="preferences field--boxed" aria-labelledby="preferences-title">
      <div class="field__header">
        <h3 class="field__title" id="preferences-title">Configure reagent preference</h3>
        <button type="button" class="btn btn--ghost btn--small section-toggle" data-ref="preferencesToggle"
          aria-expanded="false" aria-controls="preferences-body">
          <span data-ref="preferencesToggleLabel">Expand</span>
          <span class="section-toggle__chevron" aria-hidden="true"></span>
        </button>
      </div>
      <div class="preferences__body" id="preferences-body" data-ref="preferencesBody" hidden>
        <p class="field__caption">
          Preferred reagents are recommended first and avoided reagents last. 
        </p>
        <p class="pref-hint">
          <span class="pref-hint__item">
            <span class="pref-hint__slab pref-hint__slab--preferred" aria-hidden="true"></span>
            <span aria-hidden="true">·</span>
            <span>Preferred</span>
          </span>
          <span class="pref-hint__item">
            <span class="pref-hint__slab pref-hint__slab--neutral" aria-hidden="true"></span>
            <span aria-hidden="true">·</span>
            <span>Neutral</span>
          </span>
          <span class="pref-hint__item">
            <span class="pref-hint__slab pref-hint__slab--avoid" aria-hidden="true"></span>
            <span aria-hidden="true">·</span>
            <span>Avoid</span>
          </span>
        </p>
        <div class="pref-grid" data-ref="prefGrid"></div>
      </div>
    </div>
    <div class="progress" data-ref="progressBlock" hidden>
      <div class="progress__header">
        <h3 class="field__title" id="progress-title">Pairing progress</h3>
        <p class="progress__value" data-ref="progressValue" aria-live="polite"></p>
      </div>
      <div class="progress__track" role="progressbar" aria-labelledby="progress-title"
        aria-valuemin="0" aria-valuemax="0" aria-valuenow="0" data-ref="progressTrack">
        <div class="progress__fill" data-ref="progressFill"></div>
      </div>
    </div>
    <div class="results" data-ref="resultsBlock" hidden>
      <h3 class="field__title">Likely solves</h3>
      <p class="field__caption">These potions will be at least Extraordinarily promising.</p>
      <p class="results__meta" data-ref="resultsMeta" aria-live="polite"></p>
      <div class="results__list results__list--guaranteed" data-ref="resultsList"></div>
    </div>
    <div class="results recommendations" data-ref="recommendationsBlock" hidden>
      <h3 class="field__title">Recommendations</h3>
      <p class="field__caption">
        Brewing these potions are most likely to reveal the most information, but are unlikely to result in solves.
      </p>
      <p class="results__meta" data-ref="recommendationsMeta" aria-live="polite"></p>
      <div class="results__list" data-ref="recommendationsList"></div>
    </div>
  </section>

  <footer class="page-footer">
    <nav class="page-footer__buttons" data-ref="infoButtons" aria-label="Project information"></nav>
  </footer>
`;

function ref<T extends HTMLElement>(name: string): T {
  const el = app.querySelector<HTMLElement>(`[data-ref="${name}"]`);
  if (!el) {
    throw new Error(`Missing element: ${name}`);
  }
  return el as T;
}

const saveInput = ref<HTMLTextAreaElement>('saveInput');
const saveImportBtn = ref<HTMLButtonElement>('saveImportBtn');
const saveUseComplete = ref<HTMLInputElement>('saveUseComplete');
const saveStatus = ref<HTMLParagraphElement>('saveStatus');
const reagentGrid = ref<HTMLDivElement>('reagentGrid');
const potionGrid = ref<HTMLDivElement>('potionGrid');
const informationalGrid = ref<HTMLDivElement>('informationalGrid');
const potionToggle = ref<HTMLButtonElement>('potionToggle');
const potionSpoiler = ref<HTMLSpanElement>('potionSpoiler');
const brewSlots = ref<HTMLDivElement>('brewSlots');
const outcomeSlot = ref<HTMLButtonElement>('outcomeSlot');
const recordBtn = ref<HTMLButtonElement>('recordBtn');
const recordToggle = ref<HTMLButtonElement>('recordToggle');
const recordToggleLabel = ref<HTMLSpanElement>('recordToggleLabel');
const recordBody = ref<HTMLDivElement>('recordBody');
const recordedToggle = ref<HTMLButtonElement>('recordedToggle');
const recordedToggleLabel = ref<HTMLSpanElement>('recordedToggleLabel');
const recordedBody = ref<HTMLDivElement>('recordedBody');
const recordedList = ref<HTMLUListElement>('recordedList');
const recordedCount = ref<HTMLSpanElement>('recordedCount');
const clearBtn = ref<HTMLButtonElement>('clearBtn');
const exportBtn = ref<HTMLButtonElement>('exportBtn');
const importBtn = ref<HTMLButtonElement>('importBtn');
const shareStatus = ref<HTMLParagraphElement>('shareStatus');
const solveBtn = ref<HTMLButtonElement>('solveBtn');
const solveStatus = ref<HTMLParagraphElement>('solveStatus');
const solveHint = ref<HTMLParagraphElement>('solveHint');
const preferencesToggle = ref<HTMLButtonElement>('preferencesToggle');
const preferencesToggleLabel = ref<HTMLSpanElement>('preferencesToggleLabel');
const preferencesBody = ref<HTMLDivElement>('preferencesBody');
const prefGrid = ref<HTMLDivElement>('prefGrid');
const progressBlock = ref<HTMLDivElement>('progressBlock');
const progressValue = ref<HTMLParagraphElement>('progressValue');
const progressTrack = ref<HTMLDivElement>('progressTrack');
const progressFill = ref<HTMLDivElement>('progressFill');
const resultsBlock = ref<HTMLDivElement>('resultsBlock');
const resultsMeta = ref<HTMLParagraphElement>('resultsMeta');
const resultsList = ref<HTMLDivElement>('resultsList');
const recommendationsBlock = ref<HTMLDivElement>('recommendationsBlock');
const recommendationsMeta = ref<HTMLParagraphElement>('recommendationsMeta');
const recommendationsList = ref<HTMLDivElement>('recommendationsList');
const infoButtons = ref<HTMLElement>('infoButtons');

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

function reagentByIndex(index: Reagent): ReagentType {
  return REAGENTS[index];
}

function potionById(id: string): PotionType | undefined {
  return POTIONS.find(potion => potion.id === id);
}

function outcomeKey(outcome: OutcomeSelection): string {
  return outcome.kind === 'potion' ? `potion:${outcome.potionId}` : `mixture:${outcome.mixtureId}`;
}

/** Selects an outcome, or clears it when that same outcome is already selected. */
function toggleOutcome(outcome: OutcomeSelection): void {
  const current = store.getState().outcome;
  store.setOutcome(current !== null && outcomeKey(current) === outcomeKey(outcome) ? null : outcome);
}

const PREFERENCE_LABEL: Record<ReagentPreference, string> = {
  preferred: 'Preferred',
  neutral: 'Neutral',
  avoid: 'Avoid',
};

// ---------------------------------------------------------------------------
// Tooltip content
// ---------------------------------------------------------------------------

/** The game's default misbrew chance when a potion doesn't specify one. */
const DEFAULT_MISBREW_CHANCE = 0.2;

/**
 * Reagent tooltip. The hint defaults to the reagent picker's "Click to add.";
 * pass null for non-interactive badges (recorded rows, result rows), which
 * should not advertise an action.
 */
function reagentTooltip(reagent: ReagentType, hint: string | null = 'Click to add.'): TooltipContent {
  return {
    icon: reagent.icon,
    name: reagent.name,
    ...(hint === null ? {} : { hint }),
    body: reagent.gather,
    quote: reagent.flavor,
  };
}

function potionTooltip(potion: PotionType): TooltipContent {
  const rows: TooltipRow[] = [
    { label: 'Effect:', value: potion.effect, valueClass: 'text-green' },
  ];
  if (potion.misbrew) {
    rows.push({ label: 'Misbrew:', value: potion.misbrew, valueClass: 'text-red' });
  }
  rows.push({ label: 'Brew time:', value: formatBrewTime(potion.brewTime) });
  const chance = potion.misbrewChance ?? (potion.misbrew ? DEFAULT_MISBREW_CHANCE : 0);
  return {
    icon: potion.icon,
    name: potion.name,
    stat: { label: 'Chance to misbrew:', value: formatPercent(chance), valueClass: 'text-red' },
    rows,
    quote: potion.desc,
    quoteHtml: true,
  };
}

type Mixture = (typeof MIXTURE_TYPES)[MixtureId];

function mixtureTooltip(mixture: Mixture): TooltipContent {
  return {
    icon: mixture.icon,
    name: mixture.name,
    body: mixture.desc,
    quote: mixture.flavor,
  };
}

function completePotionTooltip(): TooltipContent {
  return {
    icon: COMPLETE_POTION.icon,
    name: COMPLETE_POTION.name,
    body: COMPLETE_POTION.desc,
    quote: COMPLETE_POTION.flavor,
  };
}

function outcomeTooltip(outcome: OutcomeSelection): TooltipContent {
  if (outcome.kind === 'potion') {
    if (outcome.potionId === COMPLETE_POTION.id) {
      return completePotionTooltip();
    }
    const potion = potionById(outcome.potionId);
    if (potion) {
      return potionTooltip(potion);
    }
  } else {
    return mixtureTooltip(MIXTURE_TYPES[outcome.mixtureId]);
  }
  return mixtureTooltip(MIXTURE_TYPES.useless);
}

/** Short action tooltip used by the checking section's quick outcome buttons. */
function quickOutcomeTooltip(outcome: OutcomeSelection): TooltipContent {
  const full = outcomeTooltip(outcome);
  return {
    icon: full.icon,
    name: full.name,
    hint: 'Click to record this outcome.',
    body: full.body,
  };
}

function outcomeIcon(outcome: OutcomeSelection): IconSpec {
  if (outcome.kind === 'potion') {
    if (outcome.potionId === COMPLETE_POTION.id) {
      return COMPLETE_POTION.icon;
    }
    return potionById(outcome.potionId)?.icon ?? MIXTURE_TYPES.useless.icon;
  }
  return MIXTURE_TYPES[outcome.mixtureId].icon;
}

function outcomeName(outcome: OutcomeSelection): string {
  if (outcome.kind === 'potion') {
    if (outcome.potionId === COMPLETE_POTION.id) {
      return COMPLETE_POTION.name;
    }
    return potionById(outcome.potionId)?.name ?? outcome.potionId;
  }
  return MIXTURE_TYPES[outcome.mixtureId].name;
}

// ---------------------------------------------------------------------------
// Icon grids
// ---------------------------------------------------------------------------

function makeCell(options: {
  icon: IconSpec;
  getTooltip: () => TooltipContent;
  name: string;
  className?: string;
  onClick: () => void;
}): HTMLButtonElement {
  const cell = document.createElement('button');
  cell.type = 'button';
  cell.className = options.className ? `cell ${options.className}` : 'cell';
  cell.setAttribute('aria-label', options.name);
  cell.append(createIcon(options.icon));
  attachTooltip(cell, options.getTooltip);
  cell.addEventListener('click', options.onClick);
  return cell;
}

const reagentCells = new Map<Reagent, HTMLButtonElement>();
REAGENTS.forEach((reagent, index) => {
  const reagentIndex = index as Reagent;
  const cell = makeCell({
    icon: reagent.icon,
    getTooltip: () => ({
      ...reagentTooltip(reagent),
      hint: store.getState().brewing.includes(reagentIndex) ? 'Click to remove.' : 'Click to add.',
    }),
    name: reagent.name,
    onClick: () => store.toggleReagentInBrewing(reagentIndex),
  });
  reagentCells.set(reagentIndex, cell);
  reagentGrid.append(cell);
});

const potionCells = new Map<string, HTMLButtonElement>();
for (const potion of POTIONS) {
  const cell = makeCell({
    icon: potion.icon,
    getTooltip: () => potionTooltip(potion),
    name: potion.name,
    onClick: () => toggleOutcome({ kind: 'potion', potionId: potion.id }),
  });
  potionCells.set(potion.id, cell);
  potionGrid.append(cell);
}

const MIXTURE_CLASS: Record<MixtureId, string> = {
  useless: 'cell--useless',
  promising: 'cell--promising',
  very_promising: 'cell--very',
  extraordinary_promising: 'cell--extraordinary',
};

const completePotionCell = makeCell({
  icon: COMPLETE_POTION.icon,
  getTooltip: completePotionTooltip,
  name: COMPLETE_POTION.name,
  onClick: () => toggleOutcome({ kind: 'potion', potionId: COMPLETE_POTION.id }),
});
informationalGrid.append(completePotionCell);

// Best to worst: complete, extraordinary, very, promising, useless.
const MIXTURE_ORDER: readonly MixtureId[] = [
  'extraordinary_promising',
  'very_promising',
  'promising',
  'useless',
];

const mixtureCells = new Map<MixtureId, HTMLButtonElement>();
for (const mixtureId of MIXTURE_ORDER) {
  const mixture = MIXTURE_TYPES[mixtureId];
  const cell = makeCell({
    icon: mixture.icon,
    getTooltip: () => mixtureTooltip(mixture),
    name: mixture.name,
    className: MIXTURE_CLASS[mixtureId],
    onClick: () => toggleOutcome({ kind: 'mixture', mixtureId }),
  });
  mixtureCells.set(mixtureId, cell);
  informationalGrid.append(cell);
}

// ---------------------------------------------------------------------------
// Reagent preference controls
// ---------------------------------------------------------------------------

interface PreferenceControl {
  reagent: ReagentType;
  item: HTMLDivElement;
  choices: Map<ReagentPreference, HTMLButtonElement>;
}

const preferenceControls = new Map<Reagent, PreferenceControl>();

function makePreferenceItem(reagentIndex: Reagent): HTMLDivElement {
  const reagent = reagentByIndex(reagentIndex);
  const item = document.createElement('div');
  item.className = 'pref-reagent';
  item.dataset.reagent = String(reagentIndex);
  item.setAttribute('role', 'group');
  item.setAttribute('aria-label', `${reagent.name} preference`);

  const choices = document.createElement('div');
  choices.className = 'pref-reagent__choices';
  const choiceButtons = new Map<ReagentPreference, HTMLButtonElement>();
  for (const preference of REAGENT_PREFERENCES) {
    const slab = document.createElement('button');
    slab.type = 'button';
    slab.className = `pref-slab pref-slab--${preference}`;
    slab.setAttribute(
      'aria-label',
      `Set ${reagent.name} to ${PREFERENCE_LABEL[preference].toLowerCase()}`,
    );
    slab.addEventListener('click', () => store.setReagentPreference(reagentIndex, preference));
    choiceButtons.set(preference, slab);
    choices.append(slab);
  }

  const iconWrap = document.createElement('div');
  iconWrap.className = 'pref-reagent__icon';
  iconWrap.append(createIcon(reagent.icon, '', 40));
  attachTooltip(iconWrap, () => ({
    ...reagentTooltip(reagent),
    hint: `Preference: ${PREFERENCE_LABEL[store.getReagentPreference(reagentIndex)]}.`,
  }));

  item.append(choices, iconWrap);
  preferenceControls.set(reagentIndex, { reagent, item, choices: choiceButtons });
  return item;
}

// The preference list follows the solver's easy-to-hard baseline order.
for (const reagentIndex of ReagentsSortedFromEasyToHard) {
  prefGrid.append(makePreferenceItem(reagentIndex));
}

// Quick outcomes offered beside each checking result. An unknown recommendation
// can end in any mixture or a discovery; a guaranteed extraordinary triple can
// only be an extraordinary mixture or a discovery.
const COMPLETE_OUTCOME: OutcomeSelection = { kind: 'potion', potionId: COMPLETE_POTION.id };

const RECOMMENDATION_OUTCOMES: readonly OutcomeSelection[] = [
  COMPLETE_OUTCOME,
  ...MIXTURE_ORDER.map((mixtureId): OutcomeSelection => ({ kind: 'mixture', mixtureId })),
];

const EXTRAORDINARY_OUTCOMES: readonly OutcomeSelection[] = [
  COMPLETE_OUTCOME,
  { kind: 'mixture', mixtureId: 'extraordinary_promising' },
];

// The outcome slot is a persistent element: listeners are bound once and the
// content is refreshed on render.
attachTooltip(outcomeSlot, () => {
  const outcome = store.getState().outcome;
  return outcome ? outcomeTooltip(outcome) : null;
});
outcomeSlot.addEventListener('click', () => {
  if (store.getState().outcome) {
    store.setOutcome(null);
  }
});

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderBrewing(): void {
  const { brewing } = store.getState();
  brewSlots.textContent = '';
  for (let i = 0; i < store.BREWING_SLOTS; i++) {
    const reagentIndex = brewing[i];
    const slot = document.createElement('button');
    slot.type = 'button';
    if (reagentIndex === undefined) {
      slot.className = 'slot';
      slot.disabled = true;
      slot.setAttribute('aria-label', `Empty brewing slot ${i + 1}`);
      slot.textContent = '-';
    } else {
      const reagent = reagentByIndex(reagentIndex);
      slot.className = 'slot slot--filled';
      slot.setAttribute('aria-label', `Remove ${reagent.name}`);
      slot.append(createIcon(reagent.icon));
      attachTooltip(slot, () => reagentTooltip(reagent));
      slot.addEventListener('click', () => store.removeBrewingAt(i));
    }
    brewSlots.append(slot);
  }
}

function renderOutcome(): void {
  const { outcome } = store.getState();
  outcomeSlot.textContent = '';
  outcomeSlot.className = 'slot slot--outcome' + (outcome ? ' slot--filled' : '');
  outcomeSlot.disabled = !outcome;
  if (outcome) {
    outcomeSlot.setAttribute('aria-label', `Outcome: ${outcomeName(outcome)} (click to deselect)`);
    outcomeSlot.append(createIcon(outcomeIcon(outcome)));
  } else {
    outcomeSlot.setAttribute('aria-label', 'Outcome: none selected');
    outcomeSlot.textContent = '-';
  }
}

function refreshSelection(): void {
  const { brewing, outcome } = store.getState();
  for (const [reagentIndex, cell] of reagentCells) {
    const used = brewing.includes(reagentIndex);
    cell.classList.toggle('is-used', used);
    cell.setAttribute('aria-pressed', String(used));
  }
  for (const [potionId, cell] of potionCells) {
    const selected = outcome?.kind === 'potion' && outcome.potionId === potionId;
    cell.classList.toggle('is-selected', selected);
    cell.setAttribute('aria-pressed', String(selected));
  }
  for (const [mixtureId, cell] of mixtureCells) {
    const selected = outcome?.kind === 'mixture' && outcome.mixtureId === mixtureId;
    cell.classList.toggle('is-selected', selected);
    cell.setAttribute('aria-pressed', String(selected));
  }
  const completeSelected = outcome?.kind === 'potion' && outcome.potionId === COMPLETE_POTION.id;
  completePotionCell.classList.toggle('is-selected', completeSelected);
  completePotionCell.setAttribute('aria-pressed', String(completeSelected));
}

function refreshPreferences(): void {
  for (const [reagentIndex, control] of preferenceControls) {
    const preference = store.getReagentPreference(reagentIndex);
    control.item.dataset.preference = preference;
    control.item.setAttribute(
      'aria-label',
      `${control.reagent.name} preference: ${PREFERENCE_LABEL[preference]}.`,
    );
    for (const [option, slab] of control.choices) {
      slab.setAttribute('aria-pressed', String(option === preference));
    }
  }
}

function refreshRecordControls(): void {
  const { brewing, outcome, recorded } = store.getState();
  const missing = store.BREWING_SLOTS - brewing.length;
  const duplicate = brewing.length === store.BREWING_SLOTS && store.isRecorded(brewing);
  recordBtn.disabled = missing > 0 || !outcome || duplicate;
  clearBtn.hidden = recorded.length === 0;
}

function refreshShareControls(): void {
  const { recorded } = store.getState();
  exportBtn.disabled = recorded.length === 0;
  exportBtn.title = recorded.length === 0
    ? 'Record at least one potion to export'
    : 'Export recorded potions';
}

function renderRecorded(): void {
  const { recorded } = store.getState();
  recordedCount.textContent = `(${recorded.length})`;
  recordedList.textContent = '';
  if (recorded.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'recorded__empty';
    empty.textContent = 'Nothing recorded.';
    recordedList.append(empty);
    return;
  }
  for (const [index, rec] of recorded.entries()) {
    const item = document.createElement('li');
    item.className = 'recorded__item';

    const icons = document.createElement('span');
    icons.className = 'recorded__icons';
    for (const reagentIndex of rec.reagents) {
      const reagent = reagentByIndex(reagentIndex);
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.append(createIcon(reagent.icon));
      attachTooltip(badge, () => reagentTooltip(reagent, null));
      icons.append(badge);
    }

    const arrow = document.createElement('span');
    arrow.className = 'recorded__arrow';
    arrow.textContent = '→';

    const outcomeWrap = document.createElement('span');
    outcomeWrap.className = 'recorded__icons';
    const outcomeBadge = document.createElement('span');
    outcomeBadge.className = 'badge';
    outcomeBadge.append(createIcon(outcomeIcon(rec.outcome)));
    attachTooltip(outcomeBadge, () => outcomeTooltip(rec.outcome));
    outcomeWrap.append(outcomeBadge);

    const name = document.createElement('span');
    name.className = 'recorded__name';
    name.textContent = outcomeName(rec.outcome);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'recorded__remove';
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', `Remove ${outcomeName(rec.outcome)} entry`);
    removeBtn.addEventListener('click', () => store.removeRecorded(index));

    item.append(icons, arrow, outcomeWrap, name, removeBtn);
    recordedList.append(item);
  }
}

// ---------------------------------------------------------------------------
// Export / import prompts
// ---------------------------------------------------------------------------

function makeShareField(labelText: string, textarea: HTMLTextAreaElement): HTMLDivElement {
  const field = document.createElement('div');
  field.className = 'prompt__field';
  const label = document.createElement('label');
  label.className = 'prompt__label';
  label.htmlFor = textarea.id;
  label.textContent = labelText;
  field.append(label, textarea);
  return field;
}

function openExportPrompt(): void {
  const { recorded } = store.getState();
  if (recorded.length === 0) {
    return;
  }
  const code = encodeRecorded(recorded);
  const count = recorded.length;

  const textarea = document.createElement('textarea');
  textarea.id = 'share-export-code';
  textarea.className = 'prompt__textarea';
  textarea.rows = 8;
  textarea.readOnly = true;
  textarea.spellcheck = false;
  textarea.wrap = 'soft';
  textarea.value = code;
  textarea.setAttribute('aria-label', 'Base64 export code');

  openPrompt({
    title: 'Export recorded potions',
    description:
      `${count} recorded potion${count === 1 ? '' : 's'} included. ` +
      'Copy this code and keep it somewhere safe; importing it on another device replaces that device\'s recorded potions.',
    body: makeShareField('Export code', textarea),
    wide: true,
    actions: [
      {
        label: 'Copy to clipboard',
        variant: 'primary',
        autoFocus: true,
        keepOpen: true,
        onClick: prompt => {
          void copyText(code).then(copied => {
            prompt.setStatus(
              copied
                ? 'Copied to clipboard.'
                : 'Could not copy automatically due to browser restrictions. Select the code and copy it manually.',
              copied ? 'success' : 'error',
            );
          });
        },
      },
      { label: 'Close', variant: 'ghost' },
    ],
  });
}

function openImportPrompt(): void {
  const textarea = document.createElement('textarea');
  textarea.id = 'share-import-code';
  textarea.className = 'prompt__textarea';
  textarea.rows = 8;
  textarea.spellcheck = false;
  textarea.placeholder = 'Paste an export code here…';
  textarea.setAttribute('aria-label', 'Base64 export code to import');
  textarea.setAttribute('data-autofocus', '');

  openPrompt({
    title: 'Import recorded potions',
    description:
      'Paste an export code below. Importing replaces all of your currently recorded potions; this cannot be undone.',
    body: makeShareField('Export code', textarea),
    wide: true,
    actions: [
      {
        label: 'Import',
        variant: 'primary',
        keepOpen: true,
        onClick: prompt => {
          const result = decodeRecorded(textarea.value);
          if (!result.ok) {
            prompt.setStatus(result.error, 'error');
            textarea.focus();
            return;
          }
          const replaced = store.getState().recorded.length;
          store.replaceRecorded(result.recorded);
          const imported = store.getState().recorded.length;
          let message = replaced > 0
            ? `Replaced ${plural(replaced, 'recorded potion')} with ${plural(imported, 'imported potion')}`
            : `Imported ${plural(imported, 'potion')}`;
          if (result.skipped > 0) {
            message += `; ${result.skipped} duplicate or invalid ` +
              `${result.skipped === 1 ? 'entry' : 'entries'} skipped`;
          }
          prompt.close();
          shareStatus.textContent = `${message}.`;
        },
      },
      { label: 'Cancel', variant: 'ghost' },
    ],
  });
}

function refreshSolveControls(): void {
  solveBtn.disabled = solving || store.getState().recorded.length === 0;
  solveBtn.textContent = solving ? 'Solving…' : 'Solve';
  solveBtn.setAttribute('aria-busy', String(solving));
}

// ---------------------------------------------------------------------------
// Import from save
// ---------------------------------------------------------------------------

function setSaveStatus(message: string, state: 'success' | 'error' | 'neutral'): void {
  saveStatus.textContent = message;
  if (state === 'neutral') {
    delete saveStatus.dataset.state;
  } else {
    saveStatus.dataset.state = state;
  }
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Replaces the recorded list with the save's entries and reports the result. */
function applySaveImport(result: SaveImportSuccess, replaced: number): void {
  store.replaceRecorded(result.entries);
  const combinations = plural(result.tested, 'tested combination');
  let message = `Imported ${plural(result.entries.length, 'potion')} from ${combinations}`;
  if (replaced > 0) {
    message += `; replaced ${plural(replaced, 'recorded potion')}`;
  }
  if (result.unclassified > 0) {
    message += `; ${result.unclassified} could not be classified`;
  }
  setSaveStatus(`${message}.`, 'success');
  saveInput.value = '';
}

/** Warns before an import discards the potions already recorded. */
function confirmReplaceImport(result: SaveImportSuccess, recorded: number): void {
  openPrompt({
    title: 'Replace recorded potions?',
    description:
      `Your list already has ${plural(recorded, 'recorded potion')}. Importing this save clears ` +
      `${recorded === 1 ? 'it' : 'them'} and replaces ${recorded === 1 ? 'it' : 'them'} with the ` +
      `${plural(result.entries.length, 'potion')} recovered from the save. This cannot be undone.`,
    actions: [
      {
        label: 'Replace list',
        variant: 'primary',
        autoFocus: true,
        onClick: () => applySaveImport(result, recorded),
      },
      { label: 'Cancel', variant: 'ghost' },
    ],
  });
}

function runSaveImport(): void {
  const result = importFromSave(saveInput.value, {
    useCompletePotions: saveUseComplete.checked,
  });
  if (!result.ok) {
    setSaveStatus(result.error, 'error');
    saveInput.focus();
    return;
  }
  if (result.tested === 0) {
    setSaveStatus('That save has no tested combinations yet.', 'neutral');
    return;
  }
  if (result.entries.length === 0) {
    setSaveStatus('That save has no combinations this tool can classify.', 'neutral');
    return;
  }

  const { recorded } = store.getState();
  if (recorded.length > 0) {
    confirmReplaceImport(result, recorded.length);
    return;
  }
  applySaveImport(result, 0);
}

// ---------------------------------------------------------------------------
// Solving
// ---------------------------------------------------------------------------

/**
 * How many "recommended for max info" combinations the checking section shows.
 * Every recommended triple exposes three previously unknown reagent pairs, so
 * a short batch is enough to make progress without flooding the page.
 */
const RECOMMENDATION_LIMIT = 3;

interface PairingProgress {
  /** Reagent pairs whose truth value is known (yes or no). */
  solved: number;
  /** All unordered reagent pairs, i.e. every cell of the truth table. */
  total: number;
}

function pairingProgressFromResult(
  result: Pick<SolveResult, 'pairingTable' | 'truthinessObjects'>,
): PairingProgress {
  const maybe = result.truthinessObjects.maybe;
  let solved = 0;
  let total = 0;
  for (const row of result.pairingTable) {
    for (const cell of row) {
      total += 1;
      if (cell !== maybe) {
        solved += 1;
      }
    }
  }
  return { solved, total };
}

interface CheckResults {
  /** Triples guaranteed to be at least Extraordinarily promising. */
  extraordinary: Potion[];
  /** Unknown triples the player should brew next for the most information. */
  recommendations: Potion[];
  /** True when the solver had more recommendations than are displayed. */
  moreRecommendations: boolean;
  /** Truth-table coverage of the same solve. */
  progress: PairingProgress;
}

let lastResults: CheckResults | null = null;
let lastSolvedInput: Potion[] | null = null;
let solvedOnce = false;
let stale = false;
/**
 * The preferences the displayed results were produced with. Preferences no
 * longer re-solve on their own, so a difference from the current preferences
 * means the player needs to press Solve.
 */
let appliedPreferences: readonly ReagentPreference[] | null = null;
/**
 * The result list whose row is currently being recorded. The resulting state
 * change must update the recorded list but leave that result list's rows alone
 * (apart from the row that was just resolved).
 */
type ResultListKind = 'extraordinary' | 'recommendations';
let resolvingResultRow: ResultListKind | null = null;

/**
 * Every Z3-backed solve goes through this chain, including the background
 * truth-table refresh after a quick outcome. Z3's context is shared, so solves
 * must not interleave; the chain also keeps progress updates in click order.
 */
let solverChain: Promise<void> = Promise.resolve();

function runSerialized<T>(task: () => Promise<T>): Promise<T> {
  const run = solverChain.then(() => task(), () => task());
  solverChain = run.then(() => undefined, () => undefined);
  return run;
}

// ---------------------------------------------------------------------------
// Pairing progress bar
// ---------------------------------------------------------------------------

let progressSolved = 0;
let progressTotal = 0;
let progressVisible = false;
let progressAnimationTimer = 0;
let progressFloodFrame = 0;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Renders the truth-table coverage. The first successful solve floods the fill
 * in from the left; later increments use a shorter transition plus a pulse.
 */
function renderProgress(
  progress: PairingProgress,
  animate: 'flood' | 'increment' | false,
): void {
  const changed = progress.solved !== progressSolved || progress.total !== progressTotal;
  const firstReveal = !progressVisible;
  const percent = progress.total === 0 ? 0 : (progress.solved / progress.total) * 100;

  progressSolved = progress.solved;
  progressTotal = progress.total;
  progressValue.textContent = `${progress.solved} / ${progress.total}`;
  progressTrack.setAttribute('aria-valuenow', String(progress.solved));
  progressTrack.setAttribute('aria-valuemax', String(progress.total));
  progressBlock.hidden = false;
  progressVisible = true;

  window.clearTimeout(progressAnimationTimer);
  window.cancelAnimationFrame(progressFloodFrame);
  progressBlock.classList.remove('progress--flooding', 'progress--increment');
  const flood = firstReveal || animate === 'flood';
  const increment = !flood && animate === 'increment' && changed;

  if (prefersReducedMotion()) {
    progressFill.style.transition = 'none';
    progressFill.style.width = `${percent}%`;
    void progressFill.offsetWidth;
    progressFill.style.transition = '';
    return;
  }

  if (flood) {
    // Start empty, then set the target on the next frame so the width
    // transition visibly floods left-to-right.
    progressFill.style.transition = 'none';
    progressFill.style.width = '0%';
    void progressFill.offsetWidth;
    progressFill.style.transition = '';
    progressBlock.classList.add('progress--flooding');
    progressFloodFrame = requestAnimationFrame(() => {
      progressFill.style.width = `${percent}%`;
    });
    progressAnimationTimer = window.setTimeout(() => {
      progressBlock.classList.remove('progress--flooding');
    }, 700);
    return;
  }

  if (increment) {
    progressBlock.classList.add('progress--increment');
    progressAnimationTimer = window.setTimeout(() => {
      progressBlock.classList.remove('progress--increment');
    }, 650);
  }
  progressFill.style.width = `${percent}%`;
}

/**
 * Re-solves only to refresh the truth table after a quick outcome was recorded.
 * It runs behind the visible-result queue, so it can never replace or reorder
 * the recommendations; the returned number is the coverage it just added.
 */
function solvePairingProgress(input: readonly Potion[]): Promise<number> {
  const { reagentPreferences } = store.getState();
  return runSerialized(async () => {
    const solved = await solve(
      new Set(input),
      0,
      sortReagentsByPreference(reagentPreferences),
      begin(),
    );
    const progress = pairingProgressFromResult(solved);
    const delta = progress.solved - progressSolved;
    renderProgress(progress, delta > 0 ? 'increment' : false);
    return delta;
  });
}

/**
 * The solver is asynchronous (Z3's WASM API returns promises), so solves are
 * serialized: one runs at a time and a newer request replaces any queued one.
 * That keeps out-of-order completions from overwriting fresher results.
 */
interface SolveRequest {
  input: readonly Potion[];
  /** Recorded list at request time, used to decide whether results are stale. */
  recordedAtRequest: readonly RecordedPotion[];
} 

let solving = false;
let queuedSolve: SolveRequest | null = null;
let solveError: string | null = null;

function renderSolveStatus(): void {
  if (solveError !== null) {
    solveStatus.textContent = `Could not solve: ${solveError}`;
    solveStatus.dataset.state = 'error';
  } else if (solving) {
    solveStatus.textContent = 'Solving…';
    delete solveStatus.dataset.state;
  } else {
    solveStatus.textContent = '';
    delete solveStatus.dataset.state;
  }
}

/**
 * True when the visible results were produced with older preferences than the
 * current ones, so pressing Solve is required to update them.
 */
function preferencesOutdated(): boolean {
  const applied = appliedPreferences;
  if (!solvedOnce || applied === null) {
    return false;
  }
  const current = store.getState().reagentPreferences;
  return current.length !== applied.length
    || current.some((value, index) => value !== applied[index]);
}

/** Explains that the visible results are waiting for a Solve press. */
function renderSolveHint(): void {
  const needed = preferencesOutdated() && !solving;
  solveHint.hidden = !needed;
  solveHint.textContent = needed
    ? 'Preferences changed. Click Solve to update the recommendations.'
    : '';
}

/** Queues an explicit Solve and starts draining the queue if it is idle. */
function requestSolve(input: readonly Potion[]): void {
  queuedSolve = {
    input,
    recordedAtRequest: store.getState().recorded,
  };
  lastSolvedInput = [...input];
  if (!solving) {
    void drainSolveQueue();
  }
}

async function drainSolveQueue(): Promise<void> {
  if (solving) {
    return;
  }
  solving = true;
  refreshSolveControls();
  renderSolveStatus();
  renderSolveHint();
  try {
    while (queuedSolve !== null) {
      const request = queuedSolve;
      queuedSolve = null;
      solveError = null;
      try {
        // Snapshot the preferences so this solve and its staleness check agree
        // even if the player edits a preference while it runs.
        const preferences = store.getState().reagentPreferences;
        const results = await runSerialized(async () => {
          const computed = await computeResults(request.input, preferences);
          // Update the truth-table coverage as part of the serialized task so
          // a quick-resolution progress refresh can never arrive out of order.
          const delta = computed.progress.solved - progressSolved;
          renderProgress(computed.progress, delta > 0 ? 'increment' : false);
          return computed;
        });
        lastResults = results;
        solvedOnce = true;
        // Recordings or preference edits made while this solve ran make its
        // output stale; preferences edited during the solve also need another
        // press to take effect.
        const currentPreferences = store.getState().reagentPreferences;
        const preferencesChangedDuringSolve = currentPreferences.length !== preferences.length
          || currentPreferences.some((value, index) => value !== preferences[index]);
        stale = store.getState().recorded !== request.recordedAtRequest
          || preferencesChangedDuringSolve;
        // If another request was queued while this one ran, its result is the
        // one that should be rendered.
        if (queuedSolve === null) {
          appliedPreferences = preferences;
          renderResults();
        }
      } catch (error) {
        if (queuedSolve === null) {
          solveError = error instanceof Error ? error.message : String(error);
        }
      }
    }
  } finally {
    solving = false;
    renderSolveStatus();
    renderSolveHint();
    refreshSolveControls();
  }
}

function potionKey(potion: Potion): string {
  return [potion.first, potion.second, potion.third].join('-');
}

function comparePotions(a: Potion, b: Potion): number {
  return a.first - b.first || a.second - b.second || a.third - b.third;
}

/**
 * The solver emits recommendation triples in preference order rather than
 * enum order. Normalize them so keys match recorded triples (which are stored
 * ascending) and so recording sees a canonical triple.
 */
function normalizePotion(potion: Potion): Potion {
  const [first, second, third] = [potion.first, potion.second, potion.third]
    .sort((a, b) => a - b) as [Reagent, Reagent, Reagent];
  return { first, second, third, result: potion.result };
}

/** Snapshot of the recorded set mapped to the solver's input format. */
function solverInputFromRecorded(): Potion[] {
  const input: Potion[] = [];
  for (const rec of store.getState().recorded) {
    const [first, second, third] = rec.reagents;
    input.push({ first, second, third, result: store.outcomeToResult(rec.outcome) });
  }
  return input;
}

/**
 * The last Solve snapshot plus one quick outcome. Progress refreshes use this
 * rather than the full recorded list, so unrelated recordings that are still
 * waiting for a Solve keep their stale status instead of jumping the bar.
 */
function withRecordedOutcome(
  input: readonly Potion[],
  reagents: readonly [Reagent, Reagent, Reagent],
  outcome: OutcomeSelection,
): Potion[] {
  const key = reagents.join('-');
  const next = input
    .filter(option => potionKey(option) !== key)
    .map(option => ({ ...option }));
  next.push({
    first: reagents[0],
    second: reagents[1],
    third: reagents[2],
    result: store.outcomeToResult(outcome),
  });
  return next;
}

async function computeResults(
  input: readonly Potion[],
  reagentPreferences: readonly ReagentPreference[],
): Promise<CheckResults> {
  const { recorded } = store.getState();
  const recordedKeys = new Set(recorded.map(rec => rec.reagents.join('-')));
  // Recommendations are capped before the UI can drop already-recorded triples,
  // so ask for enough extra entries to still fill the visible batch. The extra
  // one lets the UI report that more recommendations exist.
  const solved = await solve(
    new Set(input),
    RECOMMENDATION_LIMIT + recordedKeys.size + 1,
    sortReagentsByPreference(reagentPreferences),
    begin(),
  );
  const recommendations = [...solved.recommendedForMaxInfo]
    .map(normalizePotion)
    .filter(option => !recordedKeys.has(potionKey(option)));
  return {
    // Recommendations keep the solver's preference-aware order; the
    // guaranteed list remains sorted by reagent index for a stable display.
    extraordinary: [...solved.extraordinary]
      .map(normalizePotion)
      .filter(option => !recordedKeys.has(potionKey(option)))
      .sort(comparePotions),
    recommendations: recommendations.slice(0, RECOMMENDATION_LIMIT),
    moreRecommendations: recommendations.length > RECOMMENDATION_LIMIT,
    progress: pairingProgressFromResult(solved),
  };
}

type OutcomeRecorder = (
  option: Potion,
  outcome: OutcomeSelection,
  row: HTMLDivElement,
) => void;

const RESOLUTION_HOLD_MS = 1500;
const RESOLUTION_FADE_MS = 170;

/** Visible result rows, ignoring a row that is currently a resolution notice. */
function countVisibleResultRows(container: HTMLElement): number {
  return container.querySelectorAll('.result-row:not(.result-row--resolved)').length;
}

function updateExtraordinaryMeta(): void {
  const suffix = stale ? 'Click on Solve to refresh.' : '';
  resultsMeta.textContent =
    `${suffix}`;
  resultsMeta.classList.toggle('results__meta--stale', solvedOnce && stale);
}

function updateRecommendationsMeta(shown: number): void {
  recommendationsMeta.classList.toggle('results__meta--stale', solvedOnce && stale);
  if (shown === 0 && lastResults?.moreRecommendations) {
    recommendationsMeta.textContent =
      'Click on Solve to load more recommendations.';
    return;
  }
  const suffix = stale ? 'Click on Solve to refresh.' : '';
  let meta = `${suffix}`;
  recommendationsMeta.textContent = meta;
}

/** Refreshes both count lines against the rows that are actually visible. */
function refreshResultMetas(): void {
  updateExtraordinaryMeta();
  updateRecommendationsMeta(countVisibleResultRows(recommendationsList));
}

/** Drops a resolved option from the in-memory result so later renders agree. */
function removeOptionFromResults(list: ResultListKind, option: Potion): void {
  if (lastResults === null) {
    return;
  }
  const key = potionKey(option);
  lastResults = list === 'recommendations'
    ? {
        ...lastResults,
        recommendations: lastResults.recommendations.filter(rec => potionKey(rec) !== key),
      }
    : {
        ...lastResults,
        extraordinary: lastResults.extraordinary.filter(rec => potionKey(rec) !== key),
      };
}

function makeResolutionText(count: number): string {
  return `+${count} extra ${count === 1 ? 'cell' : 'cells'}`;
}

/** Turns a resolved row into a same-size notice while its truth table loads. */
function showResolvingPlaceholder(row: HTMLDivElement): void {
  const height = row.getBoundingClientRect().height;
  if (height > 0) {
    row.style.minHeight = `${height}px`;
  }
  row.classList.add('result-row--resolved');
  row.removeAttribute('aria-busy');
  row.setAttribute('role', 'status');
  row.setAttribute('aria-live', 'polite');

  const spinner = document.createElement('span');
  spinner.className = 'result-row__resolution-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.className = 'result-row__resolution-label';
  text.textContent = 'Checking new pairings…';
  row.replaceChildren(spinner, text);
}

/** Shows the exact number of newly known truth-table cells. */
function showResolvedPlaceholder(row: HTMLDivElement, added: number): void {
  const check = document.createElement('span');
  check.className = 'result-row__resolution-icon';
  check.setAttribute('aria-hidden', 'true');
  check.textContent = '✓';
  const count = document.createElement('span');
  count.className = 'result-row__resolution-count';
  count.textContent = makeResolutionText(added);
  const label = document.createElement('span');
  label.className = 'result-row__resolution-label';
  label.textContent = 'solved';
  row.setAttribute('aria-label', `${makeResolutionText(added)} solved`);
  row.replaceChildren(check, count, label);
}

/**
 * Removes a row and slides the remaining result boxes into its place. The
 * temporary notice occupies the old box for ~1.5s first, so the list only
 * reorders once the number has been read.
 */
function removeRowAndReorder(row: HTMLDivElement): void {
  const parent = row.parentElement;
  if (!parent) {
    return;
  }
  const siblings = [...parent.querySelectorAll<HTMLElement>('.result-row')]
    .filter(element => element !== row);
  const positions = new Map<HTMLElement, number>();
  for (const sibling of siblings) {
    positions.set(sibling, sibling.getBoundingClientRect().top);
  }

  row.remove();

  if (prefersReducedMotion()) {
    return;
  }
  for (const sibling of siblings) {
    if (!sibling.isConnected) {
      continue;
    }
    const shift = (positions.get(sibling) ?? 0) - sibling.getBoundingClientRect().top;
    if (Math.abs(shift) < 0.5) {
      continue;
    }
    sibling.animate(
      [
        { transform: `translateY(${shift}px)` },
        { transform: 'translateY(0)' },
      ],
      { duration: 180, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
    );
  }
}

function showEmptyStateIfNeeded(list: ResultListKind): void {
  const container = list === 'recommendations' ? recommendationsList : resultsList;
  if (container.querySelector('.result-row') !== null) {
    return;
  }
  if (container.querySelector('.results__empty') !== null) {
    return;
  }
  if (list === 'recommendations') {
    renderOptions(
      recommendationsList,
      [],
      lastResults?.moreRecommendations
        ? 'Click on Solve for more recommendations.'
        : 'No further combinations to recommend with the recorded information.',
      RECOMMENDATION_OUTCOMES,
      recordRecommendationOutcome,
    );
  } else {
    renderOptions(
      resultsList,
      [],
      'No guaranteed combinations found with the recorded information.',
      EXTRAORDINARY_OUTCOMES,
      recordExtraordinaryOutcome,
    );
  }
}

function finishRowResolution(row: HTMLDivElement, list: ResultListKind, added: number): void {
  if (!row.isConnected) {
    return;
  }
  if (added <= 0) {
    removeRowAndReorder(row);
    refreshResultMetas();
    showEmptyStateIfNeeded(list);
    return;
  }

  showResolvedPlaceholder(row, added);
  window.setTimeout(() => {
    if (!row.isConnected) {
      return;
    }
    row.classList.add('result-row--leaving');
    window.setTimeout(() => {
      if (!row.isConnected) {
        return;
      }
      removeRowAndReorder(row);
      refreshResultMetas();
      showEmptyStateIfNeeded(list);
    }, RESOLUTION_FADE_MS);
  }, RESOLUTION_HOLD_MS);
}

/**
 * Quick-button behavior shared by both result lists. The resolved row becomes
 * a temporary same-size count of newly solved truth-table cells, then fades
 * out and lets the remaining boxes reorder. The shortlist itself is never
 * re-solved, so recommendations stay exactly as displayed.
 */
function resolveResultRow(
  option: Potion,
  outcome: OutcomeSelection,
  row: HTMLDivElement,
  list: ResultListKind,
): void {
  const reagents = [option.first, option.second, option.third] as [Reagent, Reagent, Reagent];
  const alreadyRecorded = store.isRecorded(reagents);
  let recorded = false;

  if (!alreadyRecorded) {
    resolvingResultRow = list;
    try {
      recorded = store.recordCombination(reagents, outcome);
    } finally {
      resolvingResultRow = null;
    }
  }

  removeOptionFromResults(list, option);
  showResolvingPlaceholder(row);
  refreshResultMetas();

  if (!recorded) {
    finishRowResolution(row, list, 0);
    return;
  }

  // The truth-table refresh runs in the background and only feeds the progress
  // bar plus this row's extra-cell count; it never reorders or re-solves the
  // recommendations that remain on screen. It builds on the last Solve
  // snapshot (not unrelated stale recordings) so the bar cannot jump for
  // information the visible results do not include yet.
  const progressInput = withRecordedOutcome(
    lastSolvedInput ?? solverInputFromRecorded(),
    reagents,
    outcome,
  );
  lastSolvedInput = [...progressInput];
  void solvePairingProgress(progressInput)
    .then(added => {
      if (row.isConnected) {
        finishRowResolution(row, list, added);
      }
    })
    .catch(() => {
      if (row.isConnected) {
        finishRowResolution(row, list, 0);
      }
    });
}

function recordExtraordinaryOutcome(
  option: Potion,
  outcome: OutcomeSelection,
  row: HTMLDivElement,
): void {
  resolveResultRow(option, outcome, row, 'extraordinary');
}

/**
 * Quick-button behavior inside the recommendations list. The resolved row is
 * removed in place while every other recommendation stays visible; no Solve
 * refresh happens, so the remaining shortlist does not change.
 */
function recordRecommendationOutcome(
  option: Potion,
  outcome: OutcomeSelection,
  row: HTMLDivElement,
): void {
  resolveResultRow(option, outcome, row, 'recommendations');
}

function makeOutcomeButton(
  outcome: OutcomeSelection,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'outcome-btn';
  if (outcome.kind === 'mixture') {
    button.classList.add(MIXTURE_CLASS[outcome.mixtureId]);
  }
  button.setAttribute('aria-label', `Record as ${outcomeName(outcome)}`);
  button.append(createIcon(outcomeIcon(outcome), '', 26));
  attachTooltip(button, () => quickOutcomeTooltip(outcome));
  button.addEventListener('click', onClick);
  return button;
}

function makeResultRow(
  option: Potion,
  quickOutcomes: readonly OutcomeSelection[],
  record: OutcomeRecorder,
): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'result-row';
  row.dataset.reagents = [option.first, option.second, option.third].join('-');

  const combo = document.createElement('div');
  combo.className = 'result-row__combo';
  [option.first, option.second, option.third].forEach((reagentIndex, position) => {
    if (position > 0) {
      const plus = document.createElement('span');
      plus.className = 'result-row__plus';
      plus.textContent = '+';
      combo.append(plus);
    }
    const reagent = reagentByIndex(reagentIndex);
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.append(createIcon(reagent.icon));
    attachTooltip(badge, () => reagentTooltip(reagent, null));
    combo.append(badge);
  });

  const actions = document.createElement('div');
  actions.className = 'result-row__actions';
  for (const outcome of quickOutcomes) {
    actions.append(makeOutcomeButton(outcome, () => record(option, outcome, row)));
  }

  row.append(combo, actions);
  return row;
}

function renderOptions(
  container: HTMLDivElement,
  options: readonly Potion[],
  emptyText: string,
  quickOutcomes: readonly OutcomeSelection[],
  record: OutcomeRecorder,
): void {
  container.textContent = '';
  if (options.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'results__empty';
    empty.textContent = emptyText;
    container.append(empty);
    return;
  }
  for (const option of options) {
    container.append(makeResultRow(option, quickOutcomes, record));
  }
}

function renderResults(): void {
  resultsBlock.hidden = !solvedOnce;
  recommendationsBlock.hidden = !solvedOnce;
  resultsMeta.classList.toggle('results__meta--stale', solvedOnce && stale);
  recommendationsMeta.classList.toggle('results__meta--stale', solvedOnce && stale);
  if (!solvedOnce) {
    resultsMeta.textContent = '';
    recommendationsMeta.textContent = '';
    resultsList.textContent = '';
    recommendationsList.textContent = '';
    return;
  }

  // Hide anything recorded since the last Solve (for example by a quick
  // outcome button) so the same combination cannot be recorded twice.
  const recordedKeys = new Set(
    store.getState().recorded.map(rec => rec.reagents.join('-')),
  );
  const results = (lastResults?.extraordinary ?? [])
    .filter(option => !recordedKeys.has(potionKey(option)));
  const recommendations = (lastResults?.recommendations ?? [])
    .filter(option => !recordedKeys.has(potionKey(option)));
  updateExtraordinaryMeta();
  renderOptions(
    resultsList,
    results,
    '',
    EXTRAORDINARY_OUTCOMES,
    recordExtraordinaryOutcome,
  );

  updateRecommendationsMeta(recommendations.length);
  renderOptions(
    recommendationsList,
    recommendations,
    lastResults?.moreRecommendations
      ? 'Click on Solve to get more recommendations.'
      : 'No further combinations to recommend with the recorded information.',
    RECOMMENDATION_OUTCOMES,
    recordRecommendationOutcome,
  );
}

// ---------------------------------------------------------------------------
// Project information
// ---------------------------------------------------------------------------

function openInfoPrompt(section: InfoSection): void {
  openPrompt({
    title: section.title,
    body: renderMarkdown(section.markdown),
    wide: true,
    actions: [{ label: 'Close', variant: 'ghost', autoFocus: true }],
  });
}

// One footer button per level-2 section in src/info.md, in file order.
for (const section of INFO_SECTIONS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--ghost info-btn';
  button.textContent = section.title;
  button.setAttribute('aria-haspopup', 'dialog');
  button.addEventListener('click', () => openInfoPrompt(section));
  infoButtons.append(button);
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

recordBtn.addEventListener('click', () => store.recordCurrent());
clearBtn.addEventListener('click', () => store.clearRecorded());
exportBtn.addEventListener('click', openExportPrompt);
importBtn.addEventListener('click', openImportPrompt);
saveImportBtn.addEventListener('click', runSaveImport);
solveBtn.addEventListener('click', () => {
  requestSolve(solverInputFromRecorded());
});

function wireSectionToggle(
  button: HTMLButtonElement,
  body: HTMLElement,
  label: HTMLElement,
): void {
  button.addEventListener('click', () => {
    const expanded = button.getAttribute('aria-expanded') !== 'false';
    button.setAttribute('aria-expanded', String(!expanded));
    body.hidden = expanded;
    label.textContent = expanded ? 'Expand' : 'Collapse';
    hideTooltip();
  });
}

wireSectionToggle(recordToggle, recordBody, recordToggleLabel);
wireSectionToggle(recordedToggle, recordedBody, recordedToggleLabel);
wireSectionToggle(preferencesToggle, preferencesBody, preferencesToggleLabel);

function setPotionsExpanded(expanded: boolean): void {
  potionToggle.setAttribute('aria-expanded', String(expanded));
  potionGrid.hidden = !expanded;
  potionSpoiler.hidden = expanded;
  potionToggle.textContent = expanded ? 'Hide' : 'Unhide';
}

potionToggle.addEventListener('click', () => {
  const expanded = potionToggle.getAttribute('aria-expanded') === 'true';
  setPotionsExpanded(!expanded);
  hideTooltip();
});

setPotionsExpanded(false);

function onStateChange(): void {
  hideTooltip();
  // Quick-button resolution updates the recorded state in place: that row is
  // turned into a temporary count notice, so the result lists must not be
  // rebuilt underneath it. Recommendation resolution stays fresh; a
  // guaranteed-row resolution keeps the normal stale/refresh behavior.
  const resolvedList = resolvingResultRow;
  resolvingResultRow = null;
  // Any relevant state change (recorded list or preferences) makes the visible
  // output stale; quick-resolving a recommendation row is the one exception.
  if (lastResults !== null && resolvedList !== 'recommendations') {
    stale = true;
  }
  refreshSelection();
  refreshPreferences();
  renderBrewing();
  renderOutcome();
  refreshRecordControls();
  refreshShareControls();
  renderRecorded();
  refreshSolveControls();
  renderSolveHint();
  if (solvedOnce || lastSolvedInput !== null) {
    if (resolvedList === null) {
      renderResults();
    }
  }
}

store.subscribe(onStateChange);

// Initial render
refreshSelection();
refreshPreferences();
renderBrewing();
renderOutcome();
refreshRecordControls();
refreshShareControls();
renderRecorded();
refreshSolveControls();
renderSolveStatus();
renderSolveHint();
renderResults();
