import L from 'leaflet'
import { toLatLon, toLocalMetres } from './geoFrame'

export interface FreeArea { left: number; top: number; right: number; bottom: number }

const STEPS = [25, 50, 100, 200, 250, 500, 1000, 2000, 5000]
const MIN_SPACING_PX = 80
const LABEL_WIDTH = 64
const LABEL_HEIGHT = 18

/**
 * Optional grid in local metres from Three Forks Base. Lines are drawn on a canvas in a map pane below the
 * markers; one set of labels runs along the top and left of the map area not covered by panels.
 */
export function createMetreGrid(map: L.Map, labelHost: HTMLElement, freeArea: () => FreeArea) {
  const pane = map.getPane('grid') ?? map.createPane('grid')
  pane.style.zIndex = '380'
  pane.style.pointerEvents = 'none'
  const canvas = L.DomUtil.create('canvas', 'ws-grid-canvas', pane)
  const labels = document.createElement('div')
  labels.className = 'ws-grid-labels'
  labels.setAttribute('aria-hidden', 'true')
  labelHost.append(labels)

  const label = (text: string, x: number, y: number, axis: 'x' | 'y') => {
    const element = document.createElement('span')
    element.className = `ws-grid-label ws-grid-label--${axis}`
    element.textContent = text
    element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
    return element
  }

  const draw = () => {
    const size = map.getSize()
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(size.x * ratio)
    canvas.height = Math.round(size.y * ratio)
    canvas.style.width = `${size.x}px`
    canvas.style.height = `${size.y}px`
    // Keep the canvas fixed over the viewport while the map pane moves underneath.
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]))
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, size.x, size.y)
    context.strokeStyle = 'rgba(243, 233, 220, 0.16)'
    context.lineWidth = 1

    const topLeft = map.containerPointToLatLng([0, 0])
    const bottomRight = map.containerPointToLatLng([size.x, size.y])
    const min = toLocalMetres(bottomRight.lat, topLeft.lng)
    const max = toLocalMetres(topLeft.lat, bottomRight.lng)
    const pxPerMetre = (map.latLngToContainerPoint(toLatLon({ xMeters: 1000, yMeters: 0 })).x - map.latLngToContainerPoint(toLatLon({ xMeters: 0, yMeters: 0 })).x) / 1000
    const step = STEPS.find(value => value * pxPerMetre >= MIN_SPACING_PX) ?? STEPS[STEPS.length - 1]
    const area = freeArea()
    const placed: HTMLElement[] = []

    for (let x = Math.ceil(min.xMeters / step) * step; x <= max.xMeters; x += step) {
      const px = Math.round(map.latLngToContainerPoint(toLatLon({ xMeters: x, yMeters: 0 })).x) + 0.5
      context.beginPath(); context.moveTo(px, 0); context.lineTo(px, size.y); context.stroke()
      if (px > area.left + LABEL_WIDTH && px < area.right - LABEL_WIDTH / 2) placed.push(label(`x ${x} m`, px + 4, area.top + 4, 'x'))
    }
    for (let y = Math.floor(max.yMeters / step) * step; y >= min.yMeters; y -= step) {
      const py = Math.round(map.latLngToContainerPoint(toLatLon({ xMeters: 0, yMeters: y })).y) + 0.5
      context.beginPath(); context.moveTo(0, py); context.lineTo(size.x, py); context.stroke()
      if (py > area.top + LABEL_HEIGHT * 1.5 && py < area.bottom - LABEL_HEIGHT) placed.push(label(`y ${y} m`, area.left + 4, py + 3, 'y'))
    }
    labels.replaceChildren(...placed)
  }

  map.on('move zoom resize ws:layout', draw)
  draw()
  return {
    remove: () => {
      map.off('move zoom resize ws:layout', draw)
      canvas.remove()
      labels.remove()
    },
  }
}
