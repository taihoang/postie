import type { TextureId } from './types';

/** Curated solid colors (B-6). */
export const SWATCHES: { name: string; color: string }[] = [
  { name: 'White', color: '#FFFFFF' },
  { name: 'Off-white', color: '#F7F4EE' },
  { name: 'Cream', color: '#F3E9D2' },
  { name: 'Sand', color: '#E4D5B7' },
  { name: 'Blush', color: '#F2D4D0' },
  { name: 'Peach', color: '#F7C9A9' },
  { name: 'Sage', color: '#C9D5B9' },
  { name: 'Mint', color: '#CFE8DC' },
  { name: 'Sky', color: '#CFE2F3' },
  { name: 'Lavender', color: '#DCD3EE' },
  { name: 'Charcoal', color: '#2F2F33' },
  { name: 'Black', color: '#000000' },
];

/** Two-stop gradient presets (B-7). Angle in degrees, 0 = left → right. */
export const GRADIENTS: { name: string; from: string; to: string; angle: number }[] = [
  { name: 'Peach', from: '#FFD3A5', to: '#FD6585', angle: 135 },
  { name: 'Sunrise', from: '#FFF1C1', to: '#FFB199', angle: 90 },
  { name: 'Lagoon', from: '#A1C4FD', to: '#C2E9FB', angle: 120 },
  { name: 'Mint', from: '#D4FC79', to: '#96E6A1', angle: 135 },
  { name: 'Lilac', from: '#E0C3FC', to: '#8EC5FC', angle: 45 },
  { name: 'Dune', from: '#F6E7D7', to: '#D9B99B', angle: 90 },
  { name: 'Rose', from: '#FBD3E9', to: '#BB377D', angle: 160 },
  { name: 'Dusk', from: '#2C3E50', to: '#FD746C', angle: 90 },
  { name: 'Ocean', from: '#2E3192', to: '#1BFFFF', angle: 135 },
  { name: 'Mono', from: '#FFFFFF', to: '#D7D7D7', angle: 90 },
];

/** Procedural, original textures drawn by shaders, so nothing is licensed (B-8, A-10). */
export const TEXTURES: { id: TextureId; name: string }[] = [
  { id: 'paper', name: 'Paper grain' },
  { id: 'linen', name: 'Linen' },
  { id: 'dots', name: 'Soft dots' },
  { id: 'grid', name: 'Thin grid' },
  { id: 'terrazzo', name: 'Terrazzo' },
  { id: 'film', name: 'Film grain' },
];

export function normalizeHex(input: string): string | null {
  let s = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return `#${s.toUpperCase()}`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = normalizeHex(hex) ?? '#FFFFFF';
  return {
    r: parseInt(n.slice(1, 3), 16),
    g: parseInt(n.slice(3, 5), 16),
    b: parseInt(n.slice(5, 7), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

/** h in [0, 360), s and v in [0, 1]. */
export function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const { r, g, b } = hexToRgb(hex);
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rr) h = 60 * (((gg - bb) / d) % 6);
    else if (max === gg) h = 60 * ((bb - rr) / d + 2);
    else h = 60 * ((rr - gg) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/** Relative luminance, used to pick legible overlay colors. */
export function isDark(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

/** Gradient endpoints across a W×H area for an angle (0° = left → right, 90° = top → bottom). */
export function gradientPoints(
  W: number,
  H: number,
  angle: number,
): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  // Half-length of the projection of the rectangle onto the gradient direction.
  const half = (Math.abs(dx) * W + Math.abs(dy) * H) / 2;
  const cx = W / 2;
  const cy = H / 2;
  return {
    start: { x: cx - dx * half, y: cy - dy * half },
    end: { x: cx + dx * half, y: cy + dy * half },
  };
}
