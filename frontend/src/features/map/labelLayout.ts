export interface LabelEntry {
  /** The visible label element (a Leaflet tooltip or the mission-area label). */
  label: HTMLElement
  /** The marker the label belongs to, if any; other markers count as obstacles. */
  marker?: HTMLElement
  /** A label placed right of its marker may move to the left side before it is hidden. */
  flippable?: boolean
}

const PAD = 3

type Box = { left: number; top: number; right: number; bottom: number }
const box = (rect: DOMRect, pad = 0): Box => ({ left: rect.left - pad, top: rect.top - pad, right: rect.right + pad, bottom: rect.bottom + pad })
const shift = (b: Box, dx: number): Box => ({ ...b, left: b.left + dx, right: b.right + dx })
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/**
 * Keeps labels from overlapping each other or other markers. Entries are placed in order, so earlier ones win:
 * pass the selected stop first. Labels must also fit inside `visible` (viewport pixels) when given. A blocked label first tries the other side of its marker; if that is blocked too
 * it gets "is-collapsed" (hidden, numbered circle stays), and hover or focus can still show it.
 * Labels keep their layout while hidden (visibility only), so they can always be measured.
 */
export function layoutLabels(entries: LabelEntry[], visible?: { left: number; top: number; right: number; bottom: number }) {
  entries.forEach(entry => { entry.label.style.marginLeft = '' })
  const markers = entries.flatMap(entry => entry.marker ? [{ marker: entry.marker, box: box(entry.marker.getBoundingClientRect()) }] : [])
  const placed: Box[] = []
  // A label must also stay inside the visible map area, never under a panel.
  const inside = (candidate: Box) => !visible || (candidate.left >= visible.left && candidate.right <= visible.right && candidate.top >= visible.top && candidate.bottom <= visible.bottom)
  const free = (candidate: Box, own?: HTMLElement) => inside(candidate) && !placed.some(other => overlaps(candidate, other))
    && !markers.some(item => item.marker !== own && overlaps(candidate, item.box))

  entries.forEach(entry => {
    const rect = entry.label.getBoundingClientRect()
    if (rect.width === 0) return
    let candidate = box(rect, PAD)
    let ok = free(candidate, entry.marker)
    if (!ok && entry.flippable && entry.marker) {
      // Mirror the label to the left of the marker, keeping the same gap.
      const mark = entry.marker.getBoundingClientRect()
      const dx = (mark.left - (rect.left - mark.right) - rect.width) - rect.left
      const flipped = shift(candidate, dx)
      if (free(flipped, entry.marker)) {
        entry.label.style.marginLeft = `${Math.round(dx)}px`
        candidate = flipped
        ok = true
      }
    }
    entry.label.classList.toggle('is-collapsed', !ok)
    if (ok) placed.push(candidate)
  })
}
