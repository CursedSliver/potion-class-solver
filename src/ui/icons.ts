import iconsUrl from '../../assets/icons.png';
import customUrl from '../../assets/updatedSpriteSheet.png';
import gardenUrl from '../../assets/gardenPlants.png';

export type SpriteSheetId = 'main' | 'custom' | 'garden';

/** [column, row, sheet] — 0-indexed, top-left origin, 48px tiles. */
export type IconSpec = [number, number, SpriteSheetId];

interface SheetInfo {
  url: string;
  /** Natural sheet width in px (tiles are 48px, so height follows proportionally). */
  width: number;
}

const SHEETS: Record<SpriteSheetId, SheetInfo> = {
  main: { url: iconsUrl, width: 1728 },
  custom: { url: customUrl, width: 1200 },
  garden: { url: gardenUrl, width: 240 },
};

export const ICON_TILE = 48;

/**
 * Creates a sprite icon element. The background is scaled so one tile renders
 * at exactly `size` px, keeping pixel art crisp.
 */
export function createIcon(icon: IconSpec, className = '', size: number = ICON_TILE): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className ? `icon ${className}` : 'icon';
  const [col, row, sheetId] = icon;
  const sheet = SHEETS[sheetId];
  const scale = size / ICON_TILE;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.backgroundImage = `url("${sheet.url}")`;
  el.style.backgroundSize = `${Math.round(sheet.width * scale)}px auto`;
  el.style.backgroundPosition = `-${col * size}px -${row * size}px`;
  return el;
}
