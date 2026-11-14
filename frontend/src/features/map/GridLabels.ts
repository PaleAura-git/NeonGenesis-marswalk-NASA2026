import L from 'leaflet'
import { gridStepMeters } from './CoordinateGrid'

export interface FreeArea { left: number; top: number; right: number; bottom: number }

const LABEL_WIDTH = 64
const LABEL_HEIGHT = 18
const MAX_LABELS = 60

/**
 * One set of grid labels for the current view: x values along the top edge and y values along the left
 * edge of the part of the map not covered by panels. Labels never repeat and never sit behind a panel.
 */
export function createGridLabels(map: L.Map, host: HTMLElement, freeArea: () => FreeArea) {
  const layer = document.createElement('div')
  layer.className = 'ws-grid-labels'
  layer.setAttribute('aria-hidden', 'true')
  host.append(layer)

  const label = (text: string, x: number, y: number, axis: 'x' | 'y') => {
    const element = document.createElement('span')
    element.className = `ws-grid-label ws-grid-label--${axis}`
    element.textContent = text
    element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
    return element
  }

  const update = () => {
    const area = freeArea()
    const step = gridStepMeters(map.getZoom())
    const topLeft = map.containerPointToLatLng([area.left, area.top])
    const bottomRight = map.containerPointToLatLng([area.right, area.bottom])
    const labels: HTMLElement[] = []

    // x lines, labelled along the top edge, clear of the y-label column.
    for (let x = Math.ceil(topLeft.lng / step) * step; x <= bottomRight.lng && labels.length < MAX_LABELS; x += step) {
      const point = map.latLngToContainerPoint([0, x])
      if (point.x < area.left + LABEL_WIDTH || point.x > area.right - LABEL_WIDTH / 2) continue
      labels.push(label(`x ${x} m`, point.x + 4, area.top + 4, 'x'))
    }
    // y lines, labelled along the left edge, below the x-label row.
    for (let y = Math.floor(topLeft.lat / step) * step; y >= bottomRight.lat && labels.length < MAX_LABELS; y -= step) {
      const point = map.latLngToContainerPoint([y, 0])
      if (point.y < area.top + LABEL_HEIGHT * 1.5 || point.y > area.bottom - LABEL_HEIGHT) continue
      labels.push(label(`y ${y} m`, area.left + 4, point.y + 3, 'y'))
    }
    layer.replaceChildren(...labels)
  }

  map.on('move zoom resize ws:layout', update)
  update()
  return {
    update,
    remove: () => {
      map.off('move zoom resize ws:layout', update)
      layer.remove()
    },
  }
}
