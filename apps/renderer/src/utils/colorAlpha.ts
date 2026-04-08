/**
 * Apply an alpha value to a CSS color string.
 * Avoids using the CSS `opacity` property which creates a compositing layer
 * in Chromium — expensive for headless screenshot rendering.
 *
 * Supports: hex (#rgb, #rrggbb, #rrggbbaa), rgb(), rgba(), named colors (white/black).
 * For unrecognised formats, falls back to wrapping with opacity via rgba(0,0,0,alpha).
 */
export function colorWithAlpha(color: string, alpha: number): string {
  const c = color.trim().toLowerCase()

  // Named colors
  if (c === 'white') return `rgba(255,255,255,${alpha})`
  if (c === 'black') return `rgba(0,0,0,${alpha})`

  // Already rgba — replace the alpha
  const rgbaMatch = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/)
  if (rgbaMatch) {
    return `rgba(${rgbaMatch[1]},${rgbaMatch[2]},${rgbaMatch[3]},${alpha})`
  }

  // Hex: #rgb, #rrggbb, #rrggbbaa
  if (c.startsWith('#')) {
    let r: number, g: number, b: number
    if (c.length === 4) {
      r = parseInt(c[1] + c[1], 16)
      g = parseInt(c[2] + c[2], 16)
      b = parseInt(c[3] + c[3], 16)
    } else {
      r = parseInt(c.slice(1, 3), 16)
      g = parseInt(c.slice(3, 5), 16)
      b = parseInt(c.slice(5, 7), 16)
    }
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      return `rgba(${r},${g},${b},${alpha})`
    }
  }

  // Fallback: can't parse, return original (opacity won't be applied)
  return color
}
