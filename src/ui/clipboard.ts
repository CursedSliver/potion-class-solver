/**
 * Copies text to the clipboard. The async Clipboard API is used when it is
 * available (secure contexts); otherwise a hidden, readonly textarea and the
 * legacy execCommand path keep copy working on plain-HTTP hosts.
 */
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path.
    }
  }

  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let helper: HTMLTextAreaElement | null = null;
  try {
    helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', '');
    helper.setAttribute('aria-hidden', 'true');
    helper.style.position = 'fixed';
    helper.style.top = '0';
    helper.style.left = '-9999px';
    helper.style.opacity = '0';
    document.body.append(helper);
    helper.select();
    helper.setSelectionRange(0, helper.value.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    helper?.remove();
    if (previousFocus?.isConnected) {
      previousFocus.focus({ preventScroll: true });
    }
  }
}
