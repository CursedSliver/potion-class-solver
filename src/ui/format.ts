/** Formats a fraction (0–1) as a percentage string, e.g. 0.12 -> "12%". */
export function formatPercent(fraction: number): string {
  const pct = Number((fraction * 100).toFixed(2));
  return `${pct}%`;
}

/** Formats seconds as a human duration, e.g. 900 -> "15 minutes", 5400 -> "1.5 hours". */
export function formatBrewTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
  }
  if (seconds < 3600) {
    const minutes = Number((seconds / 60).toFixed(1));
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  const hours = Number((seconds / 3600).toFixed(2));
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}
