import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Mission } from '../../types/mission'
import type { StopSettings } from '../../types/planning'
import { Button } from '../../components/ui/Button'
import { CoordinateGrid } from './CoordinateGrid'
import { missionBounds, toMapPosition } from './coordinates'
import './map.css'

const layerKinds = [
  { kind: 'imagery', label: 'Imagery' },
  { kind: 'slope', label: 'Slope' },
  { kind: 'terrain-classification', label: 'Terrain classification' },
] as const

interface Props {
  mission: Mission
  stopSettings: Record<string, StopSettings>
  selectedId: string | null
  inspectionRequest: number
  onSelect: (id: string) => void
}

interface Viewport {
  paddingTopLeft: L.Point
  paddingBottomRight: L.Point
}

function visibleViewport(container: HTMLElement): Viewport {
  const rect = container.getBoundingClientRect()
  const workspace = container.closest('.workspace')
  let left = 24
  let right = 24
  let top = 24
  let bottom = 40

  workspace?.querySelectorAll('.left-slot, .right-slot, .information-dock, .data-notice, .map-tools').forEach(element => {
    const panel = element.getBoundingClientRect()
    if (panel.bottom <= rect.top || panel.top >= rect.bottom || panel.right <= rect.left || panel.left >= rect.right) return
    if (element.matches('.left-slot, .right-slot')) {
      if (panel.left + panel.width / 2 < rect.left + rect.width / 2) left = Math.max(left, panel.right - rect.left + 20)
      else right = Math.max(right, rect.right - panel.left + 20)
    } else if (element.matches('.map-tools')) {
      top = Math.max(top, panel.bottom - rect.top + 20)
    } else {
      bottom = Math.max(bottom, rect.bottom - panel.top + 20)
    }
  })

  return {
    paddingTopLeft: L.point(left, top),
    paddingBottomRight: L.point(right, bottom),
  }
}

export function MissionMap({ mission, stopSettings, selectedId, inspectionRequest, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef(new Map<string, L.Marker>())
  const selectedRef = useRef<string | null>(null)
  const resetRef = useRef<() => void>(() => {})
  const revealRef = useRef<() => void>(() => {})
  const [enabledLayers, setEnabledLayers] = useState<string[]>([])
  const [failedLayers, setFailedLayers] = useState<string[]>([])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = L.map(container, {
      crs: L.CRS.Simple,
      zoomControl: false,
      minZoom: -6,
      maxZoom: 3,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      keyboard: true,
      touchZoom: true,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
      inertia: false,
    })
    mapRef.current = map
    map.setView(L.latLngBounds(missionBounds(mission)).getCenter(), 0)
    map.attributionControl.setPrefix('Leaflet')
    new CoordinateGrid({ tileSize: 256, minZoom: -6, maxZoom: 3 }).addTo(map)
    const bounds = L.latLngBounds(missionBounds(mission))
    L.rectangle(bounds, { color: '#b98a5d', weight: 1, dashArray: '5 7', fill: false, interactive: false }).addTo(map)

    const markers = new Map<string, L.Marker>()
    const locations = [mission.base, ...mission.stops]
    locations.forEach((location, index) => {
      const isBase = location.id === mission.base.id
      const markerContent = document.createElement('span')
      markerContent.className = isBase ? 'marker-dot marker-home' : 'marker-dot'
      if (isBase) {
        // Static SVG keeps the home marker independent of fonts and external images.
        markerContent.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/></svg>'
      }
      const marker = L.marker(toMapPosition(location.position), {
        icon: L.divIcon({ className: 'mission-marker', html: markerContent, iconSize: [32, 32], iconAnchor: [16, 16] }),
        title: `Inspect ${location.name}${isBase ? ', provisional base' : ', synthetic science stop'}`,
        keyboard: true,
        autoPanOnFocus: false,
        bubblingMouseEvents: false,
        riseOnHover: true,
      }).addTo(map)
      const label = document.createElement('span')
      label.textContent = location.name
      marker.bindTooltip(label, { permanent: true, direction: index % 2 === 0 ? 'bottom' : 'top', offset: [0, index % 2 === 0 ? 16 : -16], className: 'mission-label' })
      marker.on('click', () => onSelect(location.id))
      const element = marker.getElement()
      element?.setAttribute('aria-label', marker.options.title ?? location.name)
      element?.setAttribute('aria-pressed', 'false')
      element?.addEventListener('keydown', event => {
        if (event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
          onSelect(location.id)
        }
      })
      markers.set(location.id, marker)
    })
    markersRef.current = markers

    const reset = () => {
      const padding = visibleViewport(container)
      // Leave room for permanent labels around the dataset extent.
      map.fitBounds(bounds, {
        paddingTopLeft: padding.paddingTopLeft.add([45, 30]),
        paddingBottomRight: padding.paddingBottomRight.add([45, 30]),
        animate: false,
        maxZoom: 1,
      })
    }
    const reveal = () => {
      const marker = selectedRef.current ? markers.get(selectedRef.current) : undefined
      if (!marker) return
      const padding = visibleViewport(container)
      map.panInside(marker.getLatLng(), {
        paddingTopLeft: padding.paddingTopLeft.add([65, 55]),
        paddingBottomRight: padding.paddingBottomRight.add([65, 55]),
        animate: false,
      })
    }
    resetRef.current = reset
    revealRef.current = reveal
    reset()

    let frame = 0
    const refresh = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        map.invalidateSize({ pan: false })
        reveal()
      })
    }
    const workspace = container.closest('.workspace')
    const observer = new ResizeObserver(refresh)
    observer.observe(container)
    workspace?.querySelectorAll('.left-slot, .right-slot, .information-dock, .map-tools').forEach(element => observer.observe(element))
    workspace?.addEventListener('toggle', refresh, true)
    window.addEventListener('resize', refresh)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      workspace?.removeEventListener('toggle', refresh, true)
      window.removeEventListener('resize', refresh)
      markers.forEach(marker => marker.off())
      map.remove()
      mapRef.current = null
      markersRef.current.clear()
      resetRef.current = () => {}
      revealRef.current = () => {}
    }
  }, [mission, onSelect])

  useEffect(() => {
    selectedRef.current = selectedId
    markersRef.current.forEach((marker, id) => {
      marker.getElement()?.classList.toggle('is-selected', id === selectedId)
      marker.getElement()?.setAttribute('aria-pressed', String(id === selectedId))
      marker.setZIndexOffset(id === selectedId ? 1000 : 0)
    })
    revealRef.current()
  }, [selectedId, inspectionRequest, mission])

  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const excluded = id !== mission.base.id && !stopSettings[id]?.included
      marker.getElement()?.classList.toggle('is-excluded', excluded)
      const location = id === mission.base.id ? mission.base : mission.stops.find(stop => stop.id === id)
      marker.getElement()?.setAttribute('aria-label', `Inspect ${location?.name}. ${excluded ? 'Excluded from expedition' : 'Included in expedition'}. Synthetic position.`)
      marker.getTooltip()?.getElement()?.classList.toggle('is-excluded', excluded)
    })
  }, [stopSettings, mission])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const overlays = mission.layers.filter(layer => enabledLayers.includes(layer.id)).map(layer => {
      const overlay = L.imageOverlay(layer.url, [toMapPosition(layer.bounds.min), toMapPosition(layer.bounds.max)], {
        opacity: layer.kind === 'imagery' ? 1 : 0.65,
        interactive: false,
      })
      overlay.on('error', () => {
        setFailedLayers(previous => previous.includes(layer.id) ? previous : [...previous, layer.id])
        overlay.setOpacity(0)
      })
      overlay.addTo(map)
      return overlay
    })
    return () => overlays.forEach(overlay => { overlay.off(); overlay.remove() })
  }, [mission, enabledLayers])

  function toggleLayer(id: string) {
    setFailedLayers(previous => previous.filter(failedId => failedId !== id))
    setEnabledLayers(previous => previous.includes(id) ? previous.filter(layerId => layerId !== id) : [...previous, id])
  }

  return (
    <section className="mission-map" aria-label="Synthetic local-metre expedition map">
      <div ref={containerRef} className="leaflet-workspace" role="region" aria-label="Interactive map. Arrow keys pan. Plus and minus zoom." />
      <div className="map-tools">
        <div className="map-buttons" role="group" aria-label="Map view controls">
          <Button variant="secondary" aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()}>+</Button>
          <Button variant="secondary" aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()}>−</Button>
          <Button variant="secondary" onClick={() => resetRef.current()}>Reset view</Button>
        </div>
        <details className="layer-menu panel">
          <summary>Layers</summary>
          <div className="layer-options">
            {layerKinds.map(({ kind, label }) => {
              const assets = mission.layers.filter(layer => layer.kind === kind)
              return <fieldset key={kind}><legend>{label}</legend>
                {assets.length === 0 ? <label className="unavailable-layer"><input type="checkbox" disabled />Unavailable — no registered asset</label> : assets.map(layer => (
                  <label key={layer.id}><input type="checkbox" checked={enabledLayers.includes(layer.id)} onChange={() => toggleLayer(layer.id)} />{layer.illustrative ? 'Illustrative terrain' : label}<span className="layer-attribution">{layer.attribution}</span></label>
                ))}
              </fieldset>
            })}
          </div>
        </details>
      </div>
      <div className="map-status">
        <p>Synthetic local grid · metres · north ↑</p>
        {mission.layers.length === 0 && <p>Terrain image unavailable</p>}
        {mission.layers.filter(layer => enabledLayers.includes(layer.id) && layer.illustrative).map(layer => <p key={layer.id}>Illustrative terrain · {layer.attribution}</p>)}
        {failedLayers.map(id => <p role="alert" key={id}>Could not load {mission.layers.find(layer => layer.id === id)?.kind} layer. Markers remain available. Toggle the layer to retry.</p>)}
      </div>
    </section>
  )
}
