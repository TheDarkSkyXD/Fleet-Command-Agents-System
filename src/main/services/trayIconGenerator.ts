import { nativeImage } from 'electron';

/**
 * Tray icon status types for Fleet Command
 */
export type TrayIconStatus = 'idle' | 'active' | 'warning' | 'error';

/**
 * Status colors for the tray icon indicator dot
 */
const STATUS_COLORS: Record<TrayIconStatus, { r: number; g: number; b: number }> = {
  idle: { r: 100, g: 116, b: 139 }, // slate-500 (gray)
  active: { r: 34, g: 197, b: 94 }, // green-500
  warning: { r: 245, g: 158, b: 11 }, // amber-500
  error: { r: 239, g: 68, b: 68 }, // red-500
};

/**
 * Generates a 16x16 or 32x32 tray icon with a status indicator.
 * Creates a Fleet Command "FC" icon with a colored status dot.
 *
 * The icon is a dark rounded square with "FC" letters and a small
 * colored circle in the bottom-right corner indicating status.
 */
export function generateTrayIcon(status: TrayIconStatus = 'idle', size = 16): Electron.NativeImage {
  // We'll create a raw RGBA buffer for the icon
  const scale = size === 32 ? 2 : 1;
  const s = 16 * scale; // actual pixel size
  const buffer = Buffer.alloc(s * s * 4, 0); // RGBA

  const setPixel = (x: number, y: number, r: number, g: number, b: number, a = 255) => {
    if (x < 0 || x >= s || y < 0 || y >= s) return;
    const offset = (y * s + x) * 4;
    buffer[offset] = r;
    buffer[offset + 1] = g;
    buffer[offset + 2] = b;
    buffer[offset + 3] = a;
  };

  const fillCircle = (
    cx: number,
    cy: number,
    radius: number,
    r: number,
    g: number,
    b: number,
    a = 255,
  ) => {
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (dist <= radius) {
          setPixel(x, y, r, g, b, a);
        }
      }
    }
  };

  const fillRect = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    r: number,
    g: number,
    b: number,
    a = 255,
  ) => {
    for (let y = y1; y < y2; y++) {
      for (let x = x1; x < x2; x++) {
        setPixel(x, y, r, g, b, a);
      }
    }
  };

  // Draw rounded rectangle background (dark blue/slate)
  const bgR = 30;
  const bgG = 41;
  const bgB = 59; // slate-800
  const cornerR = 2 * scale;

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      // Check if inside rounded rect
      let inside = true;
      // Top-left corner
      if (x < cornerR && y < cornerR) {
        inside = Math.sqrt((x - cornerR) ** 2 + (y - cornerR) ** 2) <= cornerR;
      }
      // Top-right corner
      if (x >= s - cornerR && y < cornerR) {
        inside = Math.sqrt((x - (s - cornerR - 1)) ** 2 + (y - cornerR) ** 2) <= cornerR;
      }
      // Bottom-left corner
      if (x < cornerR && y >= s - cornerR) {
        inside = Math.sqrt((x - cornerR) ** 2 + (y - (s - cornerR - 1)) ** 2) <= cornerR;
      }
      // Bottom-right corner
      if (x >= s - cornerR && y >= s - cornerR) {
        inside = Math.sqrt((x - (s - cornerR - 1)) ** 2 + (y - (s - cornerR - 1)) ** 2) <= cornerR;
      }
      if (inside) {
        setPixel(x, y, bgR, bgG, bgB, 255);
      }
    }
  }

  // Draw "F" letter (simplified pixel art)
  const letterColor = { r: 148, g: 163, b: 184 }; // slate-400 (light)
  const lc = letterColor;

  if (scale === 1) {
    // 16x16: Simple "F" and "C" pixel art
    // "F" at positions x=2..5, y=3..12
    fillRect(2, 3, 4, 12, lc.r, lc.g, lc.b); // vertical stroke
    fillRect(4, 3, 7, 5, lc.r, lc.g, lc.b); // top horizontal
    fillRect(4, 6, 6, 8, lc.r, lc.g, lc.b); // middle horizontal

    // "C" at positions x=8..13, y=3..12
    fillRect(9, 3, 13, 5, lc.r, lc.g, lc.b); // top horizontal
    fillRect(8, 4, 10, 11, lc.r, lc.g, lc.b); // vertical stroke
    fillRect(9, 10, 13, 12, lc.r, lc.g, lc.b); // bottom horizontal
  } else {
    // 32x32: Larger "F" and "C"
    // "F"
    fillRect(4, 6, 8, 24, lc.r, lc.g, lc.b); // vertical
    fillRect(8, 6, 14, 10, lc.r, lc.g, lc.b); // top horizontal
    fillRect(8, 13, 12, 17, lc.r, lc.g, lc.b); // middle horizontal

    // "C"
    fillRect(18, 6, 26, 10, lc.r, lc.g, lc.b); // top horizontal
    fillRect(16, 8, 20, 22, lc.r, lc.g, lc.b); // vertical
    fillRect(18, 20, 26, 24, lc.r, lc.g, lc.b); // bottom horizontal
  }

  // Draw status indicator dot (bottom-right corner)
  const statusColor = STATUS_COLORS[status];
  const dotRadius = 2.5 * scale;
  const dotX = s - 3 * scale;
  const dotY = s - 3 * scale;

  // White outline for status dot
  fillCircle(dotX, dotY, dotRadius + 0.8 * scale, 30, 41, 59); // bg-colored outline
  // Status dot
  fillCircle(dotX, dotY, dotRadius, statusColor.r, statusColor.g, statusColor.b);

  return nativeImage.createFromBuffer(buffer, {
    width: s,
    height: s,
  });
}

/**
 * Generate the default tray icon (idle state)
 */
export function generateDefaultTrayIcon(): Electron.NativeImage {
  return generateTrayIcon('idle', 16);
}
