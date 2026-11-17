import { createIcon } from './icons';
import type { IconSpec } from './icons';

export interface TooltipStat {
  label: string;
  value: string;
  valueClass?: string;
}

export interface TooltipRow {
  label: string;
  value: string;
  valueClass?: string;
  isHtml?: boolean;
}

export interface TooltipContent {
  icon: IconSpec;
  name: string;
  stat?: TooltipStat;
  /** Short italic call-to-action shown directly under the name. */
  hint?: string;
  rows?: TooltipRow[];
  body?: string;
  bodyHtml?: boolean;
  quote?: string;
  quoteHtml?: boolean;
}

const TOOLTIP_GAP = 10;
const VIEWPORT_MARGIN = 8;

let tooltipEl: HTMLElement | null = null;
let currentAnchor: HTMLElement | null = null;

function ensureTooltip(): HTMLElement {
  if (tooltipEl) {
    return tooltipEl;
  }
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'tooltip';
  tooltipEl.setAttribute('role', 'tooltip');
  tooltipEl.style.display = 'none';
  document.body.append(tooltipEl);
  return tooltipEl;
}

function makeDivider(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'tooltip__divider';
  return el;
}

function setRichText(el: HTMLElement, text: string, isHtml: boolean): void {
  if (isHtml) {
    el.innerHTML = text;
  } else {
    el.textContent = text;
  }
}

function renderTooltip(content: TooltipContent): void {
  const el = ensureTooltip();
  el.textContent = '';

  const header = document.createElement('div');
  header.className = 'tooltip__header';
  header.append(createIcon(content.icon, 'tooltip__icon'));

  const titles = document.createElement('div');
  titles.className = 'tooltip__titles';
  const name = document.createElement('div');
  name.className = 'tooltip__name';
  name.textContent = content.name;
  titles.append(name);

  if (content.stat) {
    const stat = document.createElement('div');
    stat.className = 'tooltip__stat';
    const label = document.createElement('span');
    label.className = 'tooltip__stat-label';
    label.textContent = content.stat.label;
    const value = document.createElement('span');
    if (content.stat.valueClass) {
      value.className = content.stat.valueClass;
    }
    value.textContent = content.stat.value;
    stat.append(label, value);
    titles.append(stat);
  }

  if (content.hint) {
    const hint = document.createElement('div');
    hint.className = 'tooltip__hint';
    hint.textContent = content.hint;
    titles.append(hint);
  }

  header.append(titles);
  el.append(header);

  (content.rows ?? []).forEach((row, index) => {
    if (index === 0) {
      el.append(makeDivider());
    }
    const rowEl = document.createElement('div');
    rowEl.className = 'tooltip__row';
    const label = document.createElement('span');
    label.className = 'tooltip__row-label';
    label.textContent = row.label;
    const value = document.createElement('span');
    if (row.valueClass) {
      value.className = row.valueClass;
    }
    setRichText(value, row.value, row.isHtml ?? false);
    rowEl.append(label, value);
    el.append(rowEl);
    if (index < (content.rows?.length ?? 0) - 1) {
      el.append(makeDivider());
    }
  });

  if (content.body) {
    el.append(makeDivider());
    const body = document.createElement('div');
    body.className = 'tooltip__body';
    setRichText(body, content.body, content.bodyHtml ?? false);
    el.append(body);
  }

  if (content.quote) {
    const quote = document.createElement('div');
    quote.className = 'tooltip__quote';
    setRichText(quote, `\u201C${content.quote}\u201D`, content.quoteHtml ?? false);
    el.append(quote);
  }
}

function positionTooltip(): void {
  if (!tooltipEl || !currentAnchor) {
    return;
  }
  const anchorRect = currentAnchor.getBoundingClientRect();
  const tipRect = tooltipEl.getBoundingClientRect();
  let top = anchorRect.top - tipRect.height - TOOLTIP_GAP;
  if (top < VIEWPORT_MARGIN) {
    top = anchorRect.bottom + TOOLTIP_GAP;
  }
  let left = anchorRect.left + anchorRect.width / 2 - tipRect.width / 2;
  left = Math.min(Math.max(VIEWPORT_MARGIN, left), window.innerWidth - tipRect.width - VIEWPORT_MARGIN);
  tooltipEl.style.top = `${Math.round(top)}px`;
  tooltipEl.style.left = `${Math.round(left)}px`;
}

function handleReposition(): void {
  if (currentAnchor && !currentAnchor.isConnected) {
    hideTooltip();
    return;
  }
  positionTooltip();
}

export function showTooltip(anchor: HTMLElement, content: TooltipContent | null): void {
  if (!content) {
    hideTooltip();
    return;
  }
  renderTooltip(content);
  currentAnchor = anchor;
  const el = ensureTooltip();
  el.style.display = 'block';
  positionTooltip();
  document.addEventListener('scroll', handleReposition, true);
  window.addEventListener('resize', hideTooltip);
}

export function hideTooltip(): void {
  if (!tooltipEl) {
    return;
  }
  tooltipEl.style.display = 'none';
  currentAnchor = null;
  document.removeEventListener('scroll', handleReposition, true);
  window.removeEventListener('resize', hideTooltip);
}

/**
 * Anchors a tooltip to `anchor` (not the mouse). `getContent` is evaluated on
 * every show so the content can react to state changes.
 */
export function attachTooltip(anchor: HTMLElement, getContent: () => TooltipContent | null): void {
  anchor.addEventListener('mouseenter', () => showTooltip(anchor, getContent()));
  anchor.addEventListener('mouseleave', hideTooltip);
  anchor.addEventListener('focus', () => showTooltip(anchor, getContent()));
  anchor.addEventListener('blur', hideTooltip);
}
