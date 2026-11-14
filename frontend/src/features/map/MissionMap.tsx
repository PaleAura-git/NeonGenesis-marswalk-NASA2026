import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Mission } from '../../types/mission'
import type { StopSettings } from '../../types/planning'
import { CoordinateGrid } from './CoordinateGrid'
import { createGridLabels, type FreeArea } from './GridLabels'
import { MapControls } from './MapControls'
import { missionBounds, toMapPosition } from './coordinates'
import { terrainOverlay } from './terrainOverlay'
import './map.css'

const layerKinds = [
  { kind: 'imagery', label: 'Imagery' },
  { kind: 'slope', label: 'Slope' },
  { kind: 'terrain-classification', label: 'Terrain classification' },
] as const

const HOME_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/></svg>'
const SVG_NS = 'http://www.w3.org/2000/svg'

interface Props {
  mission: Mission
  stopSettings: Record<string, StopSettings>
  selectedId: string | null
  inspectionRequest: number
  onSelect: (id: string) => void
}

/** Part of the map container not covered by panels or controls, in container pixels. */
function freeArea(container: HTMLElement): FreeArea {
  const rect = container.getBoundingClientRect()
  const area = { left: 0, top: 0, right: rect.width, bottom: rect.height }
  const shell = container.closest<HTMLElement>('.app-shell')
  if (shell) {
    // Always leave room for the open inspector and the control stack, so opening or collapsing the panel
    // never leaves the mission under it.
    const style = getComputedStyle(shell)
    const px = (name: string) => parseFloat(style.getPropertyValue(name)) || 0
    area.right = rect.width - (px('--ws-right-open') + px('--ws-controls-w') + px('--ws-gap') * 3)
  }
  shell?.querySelectorAll<HTMLElement>('[data-map-edge]').forEach(element => {
    if (getComputedStyle(element).visibility === 'hidden') return
    const panel = element.getBoundingClientRect()
    if (panel.width === 0 || panel.bottom <= rect.top || panel.top >= rect.bottom || panel.right <= rect.left || panel.left >= rect.right) return
    const edge = element.dataset.mapEdge
    if (edge === 'left') area.left = Math.max(area.left, panel.right - rect.left)
    else if (edge === 'right') area.right = Math.min(area.right, panel.left - rect.left)
    else if (edge === 'top') area.top = Math.max(area.top, panel.bottom - rect.top)
    else if (edge === 'bottom') area.bottom = Math.min(area.bottom, panel.top - rect.top)
  })
  return area
}

function viewportPadding(container: HTMLElement, extra: [number, number]) {
  const rect = container.getBoundingClientRect()
  const area = freeArea(container)
  return {
    paddingTopLeft: L.point(area.left + 20 + extra[0], area.top + 20 + extra[1]),
    paddingBottomRight: L.point(rect.width - area.right + 20 + extra[0], rect.height - area.bottom + 20 + extra[1]),
  }
}

/** Dashed rounded outline of the mission area, drawn in metres so it scales with the map. */
function missionAreaOutline(widthMeters: number, heightMeters: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${widthMeters} ${heightMeters}`)
  svg.setAttribute('preserveAspectRatio', 'none')
  const rect = document.createElementNS(SVG_NS, 'rect')
  const radius = Math.min(widthMeters, heightMeters) * 0.03
  rect.setAttribute('x', '0'); rect.setAttribute('y', '0')
  rect.setAttribute('width', String(widthMeters)); rect.setAttribute('height', String(heightMeters))
  rect.setAttribute('rx', String(radius)); rect.setAttribute('ry', String(radius))
  rect.setAttribute('class', 'ws-mission-area-outline')
  rect.setAttribute('vector-effect', 'non-scaling-stroke')
  svg.append(rect)
  return svg
}

/** Soft radial darkening over the terrain image, centred on the mission area. */
function terrainVignette(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 100 100')
  svg.setAttribute('preserveAspectRatio', 'none')
  svg.innerHTML = '<defs><radialGradient id="ws-terrain-vignette" cx="50%" cy="50%" r="62%">'
    + '<stop offset="35%" stop-color="#0e0907" stop-opacity="0"/><stop offset="75%" stop-color="#0e0907" stop-opacity=".45"/>'
    + '<stop offset="100%" stop-color="#0e0907" stop-opacity=".9"/></radialGradient></defs>'
    + '<rect width="100" height="100" fill="url(#ws-terrain-vignette)"/>'
  return svg
}

const formatKilometres = (meters: number) => (meters / 1000).toFixed(meters % 100 === 0 ? 1 : 2)

export function MissionMap({ mission, stopSettings, selectedId, inspectionRequest, onSelect }: Props) {
  const rootRef = useRef<HTMLElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scaleHostRef = useRef<HTMLDivElement>(null)
  const readoutRef = useRef<HTMLSpanElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef(new Map<string, L.Marker>())
  const selectedRef = useRef<string | null>(null)
  const resetRef = useRef<() => void>(() => {})
  const revealRef = useRef<() => void>(() => {})
  const [enabledLayers, setEnabledLayers] = useState<string[]>([])
  const [failedLayers, setFailedLayers] = useState<string[]>([])
  const [showTerrain, setShowTerrain] = useState(true)
  const [terrainFailed, setTerrainFailed] = useState(false)
  const [showGrid, setShowGrid] = useState(false)

  const [[minY, minX], [maxY, maxX]] = missionBounds(mission)
  const areaLabel = `Mission area · ${formatKilometres(maxX - minX)} × ${formatKilometres(maxY - minY)} km`

  useEffect(() => {
    const container = containerRef.current
    const scaleHost = scaleHostRef.current
    const readout = readoutRef.current
    if (!container || !scaleHost || !readout) return

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
    map.createPane('terrain').style.zIndex = '150'
    map.setView(L.latLngBounds(missionBounds(mission)).getCenter(), 0)
    map.attributionControl.setPrefix('Leaflet')
    const bounds = L.latLngBounds(missionBounds(mission))

    // Mission area: dashed rounded outline plus a mono label at its top-left corner.
    const [[south, west], [north, east]] = missionBounds(mission)
    L.svgOverlay(missionAreaOutline(east - west, north - south), bounds, { interactive: false, className: 'ws-mission-area' }).addTo(map)
    const areaMarker = L.marker([north, west], {
      icon: L.divIcon({ className: 'ws-area-label', html: `<span>${areaLabel}</span>`, iconSize: [0, 0], iconAnchor: [-12, -12] }),
      interactive: false, keyboard: false,
    }).addTo(map)
    // Hide the area label when the area is drawn too small for it to clear the markers.
    const fitAreaLabel = () => {
      const width = map.latLngToContainerPoint([north, east]).x - map.latLngToContainerPoint([north, west]).x
      areaMarker.getElement()?.classList.toggle('is-hidden', width < 300)
    }
    map.on('zoomend', fitAreaLabel)

    const markers = new Map<string, L.Marker>()
    const locations = [mission.base, ...mission.stops]
    locations.forEach(location => {
      const isBase = location.id === mission.base.id
      const stopIndex = mission.stops.findIndex(stop => stop.id === location.id)
      const markerContent = document.createElement('span')
      markerContent.className = isBase ? 'ws-marker ws-marker--base' : 'ws-marker ws-marker--stop'
      // Static SVG keeps the home marker independent of fonts and external images.
      if (isBase) markerContent.innerHTML = HOME_SVG
      else markerContent.textContent = String(stopIndex + 1)
      const marker = L.marker(toMapPosition(location.position), {
        icon: L.divIcon({ className: 'mission-marker', html: markerContent, iconSize: [44, 44], iconAnchor: [22, 22] }),
        title: `Inspect ${location.name}${isBase ? ', provisional base' : ', synthetic science stop'}`,
        keyboard: true,
        autoPanOnFocus: false,
        bubblingMouseEvents: false,
        riseOnHover: true,
      }).addTo(map)
      const label = document.createElement('span')
      label.textContent = location.name
      marker.bindTooltip(label, isBase
        ? { permanent: true, direction: 'bottom', offset: [0, 14], className: 'mission-label mission-label--base' }
        : { permanent: true, direction: 'right', offset: [12, 0], className: 'mission-label' })
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

    // Scale bar from Leaflet's own measurement; CRS.Simple distances are the synthetic metres.
    const scale = L.control.scale({ imperial: false, maxWidth: 110, position: 'bottomleft' }).addTo(map)
    scaleHost.append(scale.getContainer()!)

    const showPosition = (event: L.LeafletMouseEvent) => {
      readout.textContent = `x ${Math.round(event.latlng.lng)} m · y ${Math.round(event.latlng.lat)} m`
    }
    const clearPosition = () => { readout.textContent = 'x — · y —' }
    map.on('mousemove', showPosition)
    map.on('mouseout', clearPosition)

    const reset = () => {
      // Leave room for permanent labels around the dataset extent.
      map.fitBounds(bounds, { ...viewportPadding(container, [40, 24]), animate: false, maxZoom: 1 })
    }
    const reveal = () => {
      const marker = selectedRef.current ? markers.get(selectedRef.current) : undefined
      if (!marker) return
      map.panInside(marker.getLatLng(), { ...viewportPadding(container, [90, 30]), animate: false })
    }
    resetRef.current = reset
    revealRef.current = reveal
    reset()
    fitAreaLabel()

    let frame = 0
    const refresh = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        map.invalidateSize({ pan: false })
        reveal()
        // Panels may have moved without the map resizing; layers that depend on the free area listen for this.
        map.fire('ws:layout')
      })
    }
    const shell = container.closest('.app-shell')
    const observer = new ResizeObserver(refresh)
    observer.observe(container)
    shell?.querySelectorAll('[data-map-edge]').forEach(element => observer.observe(element))
    window.addEventListener('resize', refresh)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', refresh)
      markers.forEach(marker => marker.off())
      scale.remove()
      map.remove()
      mapRef.current = null
      markersRef.current.clear()
      resetRef.current = () => {}
      revealRef.current = () => {}
    }
  }, [mission, onSelect, areaLabel])

  useEffect(() => {
    selectedRef.current = selectedId
    markersRef.current.forEach((marker, id) => {
      const selected = id === selectedId
      marker.getElement()?.classList.toggle('is-selected', selected)
      marker.getElement()?.setAttribute('aria-pressed', String(selected))
      marker.getTooltip()?.getElement()?.classList.toggle('is-selected', selected)
      marker.setZIndexOffset(selected ? 1000 : 0)
    })
    revealRef.current()
  }, [selectedId, inspectionRequest, mission])

  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const excluded = id !== mission.base.id && !stopSettings[id]?.included
      const element = marker.getElement()
      element?.classList.toggle('is-excluded', excluded)
      ;['1', '2', '3'].forEach(priority => element?.classList.toggle(`priority-${priority}`, stopSettings[id]?.priority === priority))
      const location = id === mission.base.id ? mission.base : mission.stops.find(stop => stop.id === id)
      element?.setAttribute('aria-label', `Inspect ${location?.name}. ${excluded ? 'Excluded from expedition' : 'Included in expedition'}. Synthetic position.`)
      marker.getTooltip()?.getElement()?.classList.toggle('is-excluded', excluded)
    })
  }, [stopSettings, mission])

  // Illustrative terrain under everything else, with a soft vignette above it.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !showTerrain) return
    const { min, max } = terrainOverlay.bounds
    const imageBounds = L.latLngBounds([toMapPosition(min), toMapPosition(max)])
    const image = L.imageOverlay(terrainOverlay.url, imageBounds, { pane: 'terrain', interactive: false, className: 'ws-terrain' })
    const vignette = L.svgOverlay(terrainVignette(), imageBounds, { pane: 'terrain', interactive: false })
    // The vignette belongs to the image: without it, its edge would show as a rectangle on the plain background.
    image.on('load', () => {
      setTerrainFailed(false)
      if (!map.hasLayer(vignette)) vignette.addTo(map)
    })
    image.on('error', () => {
      setTerrainFailed(true)
      image.setOpacity(0)
      vignette.remove()
    })
    image.addTo(map)
    return () => { image.off(); image.remove(); vignette.remove() }
  }, [mission, showTerrain])

  // Optional coordinate grid: lines in a tile layer, one set of labels in the free map area.
  useEffect(() => {
    const map = mapRef.current
    const root = rootRef.current
    const container = containerRef.current
    if (!map || !root || !container || !showGrid) return
    const grid = new CoordinateGrid({ tileSize: 256, minZoom: -6, maxZoom: 3, pane: 'terrain' }).addTo(map)
    grid.setZIndex(5)
    const labels = createGridLabels(map, root, () => freeArea(container))
    return () => { grid.remove(); labels.remove() }
  }, [mission, showGrid])

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

  const layerMenu = <>
    <p className="ws-label">Base map</p>
    <label className="ws-check"><input type="checkbox" checked={showTerrain} onChange={() => { setTerrainFailed(false); setShowTerrain(value => !value) }} />
      Illustrative terrain{terrainFailed && <span className="ws-check-note">Image unavailable</span>}</label>
    <label className="ws-check"><input type="checkbox" checked={showGrid} onChange={() => setShowGrid(value => !value)} />Coordinate grid<span className="ws-check-note">Synthetic metres</span></label>
    {layerKinds.map(({ kind, label }) => {
      const assets = mission.layers.filter(layer => layer.kind === kind)
      return <fieldset key={kind}><legend className="ws-label">{label}</legend>
        {assets.length === 0 ? <label className="ws-check is-unavailable"><input type="checkbox" disabled />Unavailable — no registered asset</label> : assets.map(layer => (
          <label key={layer.id} className="ws-check"><input type="checkbox" checked={enabledLayers.includes(layer.id)} onChange={() => toggleLayer(layer.id)} />{layer.illustrative ? 'Illustrative terrain' : label}<span className="ws-check-note">{layer.attribution}</span></label>
        ))}
      </fieldset>
    })}
  </>

  const notes = <>
    <h2 className="ws-label">Coordinate & data notes</h2>
    <p>{mission.notice}</p>
    <p>Positions use synthetic xMeters / yMeters. No mapping to imagery has been established.</p>
    <p>Unverified placeholder: {mission.unverifiedGeographicReference.latitudeDegrees}&deg; N, {mission.unverifiedGeographicReference.longitudeDegrees}&deg; E. Exact placement and datum pending.</p>
    <p>Synthetic positions & observation durations. Geographic placement, terrain, and route calculations pending.</p>
  </>

  const terrainNote = showTerrain && !terrainFailed ? terrainOverlay.label : 'Terrain image unavailable'

  return (
    <section ref={rootRef} className="mission-map" aria-label="Synthetic local-metre expedition map">
      <div ref={containerRef} className="leaflet-workspace" role="region" aria-label="Interactive map. Arrow keys pan. Plus and minus zoom." />
      <MapControls onZoomIn={() => mapRef.current?.zoomIn()} onZoomOut={() => mapRef.current?.zoomOut()} onReset={() => resetRef.current()}
        layers={layerMenu} notes={notes} />
      <div className="ws-map-foot">
        {failedLayers.length > 0 && <div className="ws-map-alerts">
          {failedLayers.map(id => <p role="alert" key={id}>Could not load {mission.layers.find(layer => layer.id === id)?.kind} layer. Markers remain available. Toggle the layer to retry.</p>)}
        </div>}
        <div ref={scaleHostRef} className="ws-scale-host" />
        <span ref={readoutRef} className="ws-readout" aria-hidden="true">x — · y —</span>
        <span className="ws-pill ws-terrain-pill">{terrainNote}</span>
      </div>
    </section>
  )
}
