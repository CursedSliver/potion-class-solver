import { hideTooltip } from './tooltip';

/**
 * A small prompt system: one modal dialog at a time, with a header, optional
 * body content, inline status line, and action buttons. Prompts are configured
 * with plain options so new dialogs can reuse the same behavior (focus trap,
 * Escape/backdrop dismissal, scroll locking) without duplicating markup.
 */

export type PromptStatusTone = 'info' | 'error' | 'success';

export interface PromptAction {
  label: string;
  /** `primary` uses the accent button style; the default is a ghost button. */
  variant?: 'primary' | 'ghost';
  /** Keep the prompt open after the click (the callback calls `close()` itself). */
  keepOpen?: boolean;
  /** Focus this action when the prompt opens. */
  autoFocus?: boolean;
  onClick?: (prompt: PromptHandle) => void;
}

export interface PromptOptions {
  title: string;
  description?: string;
  /** Body content, inserted as-is. Mark an element with `data-autofocus` to focus it. */
  body?: Node | readonly Node[];
  /** Wider variant for code blocks and textareas. */
  wide?: boolean;
  actions?: readonly PromptAction[];
  onClose?: () => void;
}

export interface PromptHandle {
  /** The dialog element (not the backdrop). */
  readonly root: HTMLElement;
  readonly body: HTMLElement;
  setStatus: (message: string | null, tone?: PromptStatusTone) => void;
  close: () => void;
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

let activePrompt: PromptHandle | null = null;
let nextPromptId = 0;

export function openPrompt(options: PromptOptions): PromptHandle {
  activePrompt?.close();

  const promptId = `prompt-${++nextPromptId}`;
  const titleId = `${promptId}-title`;
  const descriptionId = `${promptId}-description`;

  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const app = document.querySelector<HTMLElement>('#app');
  const appWasInert = app?.hasAttribute('inert') ?? false;

  const overlay = document.createElement('div');
  overlay.className = 'prompt-overlay';

  const dialog = document.createElement('div');
  dialog.className = options.wide ? 'prompt prompt--wide' : 'prompt';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', titleId);

  const header = document.createElement('div');
  header.className = 'prompt__header';
  const title = document.createElement('h2');
  title.className = 'prompt__title';
  title.id = titleId;
  title.textContent = options.title;
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'prompt__close';
  closeButton.setAttribute('aria-label', 'Close prompt');
  closeButton.textContent = '\u00D7';
  header.append(title, closeButton);
  dialog.append(header);

  if (options.description) {
    const description = document.createElement('p');
    description.className = 'prompt__description';
    description.id = descriptionId;
    description.textContent = options.description;
    dialog.append(description);
    dialog.setAttribute('aria-describedby', descriptionId);
  }

  const body = document.createElement('div');
  body.className = 'prompt__body';
  if (options.body !== undefined) {
    const nodes: Node[] = Array.isArray(options.body) ? [...options.body] : [options.body as Node];
    body.append(...nodes);
  }
  dialog.append(body);

  const status = document.createElement('p');
  status.className = 'prompt__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;
  dialog.append(status);

  const footer = document.createElement('div');
  footer.className = 'prompt__actions';
  const actionButtons: HTMLButtonElement[] = [];
  for (const action of options.actions ?? []) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn ${action.variant === 'primary' ? 'btn--primary' : 'btn--ghost'}`;
    button.textContent = action.label;
    if (action.autoFocus) {
      button.setAttribute('data-autofocus', '');
    }
    button.addEventListener('click', () => {
      action.onClick?.(handle);
      if (!action.keepOpen) {
        close();
      }
    });
    actionButtons.push(button);
    footer.append(button);
  }
  if (actionButtons.length > 0) {
    dialog.append(footer);
  }

  overlay.append(dialog);
  document.body.append(overlay);

  let closed = false;

  function setStatus(message: string | null, tone: PromptStatusTone = 'info'): void {
    if (closed) {
      return;
    }
    if (!message) {
      status.hidden = true;
      status.textContent = '';
      status.className = 'prompt__status';
      return;
    }
    status.hidden = false;
    status.textContent = message;
    status.className = `prompt__status prompt__status--${tone}`;
  }

  function close(): void {
    if (closed) {
      return;
    }
    closed = true;
    document.removeEventListener('keydown', onKeyDown, true);
    overlay.remove();
    document.body.classList.remove('is-prompt-open');
    if (app && !appWasInert) {
      app.removeAttribute('inert');
    }
    if (activePrompt === handle) {
      activePrompt = null;
    }
    options.onClose?.();
    if (previousFocus?.isConnected) {
      previousFocus.focus({ preventScroll: true });
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const focusable = getFocusable(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const current = document.activeElement;
    if (event.shiftKey) {
      if (current === first || !dialog.contains(current)) {
        event.preventDefault();
        last.focus();
      }
    } else if (current === last || !dialog.contains(current)) {
      event.preventDefault();
      first.focus();
    }
  }

  const handle: PromptHandle = {
    root: dialog,
    body,
    setStatus,
    close,
  };

  closeButton.addEventListener('click', close);
  overlay.addEventListener('mousedown', event => {
    if (event.target === overlay) {
      close();
    }
  });
  document.addEventListener('keydown', onKeyDown, true);

  if (app && !appWasInert) {
    app.setAttribute('inert', '');
  }
  hideTooltip();
  document.body.classList.add('is-prompt-open');
  activePrompt = handle;

  const autofocus =
    body.querySelector<HTMLElement>('[data-autofocus]') ??
    actionButtons.find(button => button.hasAttribute('data-autofocus')) ??
    actionButtons[0] ??
    closeButton;
  autofocus.focus({ preventScroll: true });

  return handle;
}

function getFocusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    element => element.offsetParent !== null || element === document.activeElement,
  );
}
