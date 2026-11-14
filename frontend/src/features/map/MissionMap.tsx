import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Mission } from '../../types/mission'
import type { StopSettings } from '../../types/planning'
import { MapControls } from './MapControls'
import { createMetreGrid, type FreeArea } from './MetreGrid'
import { missionAreaMetres, missionBounds, toMapPosition } from './coordinates'
import { origin, researchBriefPositions, toLatLon, toLocalMetres } from './geoFrame'
import { layoutLabels, type LabelEntry } from './labelLayout'
import { MarsCRS, marsTrek } from './marsTrek'
import { terrainOverlay } from './terrainOverlay'
import './map.css'

const layerKinds = [
  { kind: 'imagery', label: 'Imagery' },
  { kind: 'slope', label: 'Slope' },
  { kind: 'terrain-classification', label: 'Terrain classification' },
] as const

const HOME_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/></svg>'
const SVG_NS = 'http://www.w3.org/2000/svg'
// Fall back to the illustrative terrain once this many tiles fail before any loads.
const TILE_FAILURES_BEFORE_FALLBACK = 3

type Imagery = 'nasa' | 'illustrative'
type NasaStatus = 'loading' | 'ok' | 'failed'

interface Props {
  /** Changes whenever the panel layout around the map changes (stage, inspector, setup drawer). */
  layoutKey: string
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
  // The panels actually showing: left panel, inspector or its collapsed tab, top bar, bottom strip or dock,
  // and the map controls. Hidden drawers are skipped.
  const shell = container.closest<HTMLElement>('.app-shell')
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
  const radius = Math.min(widthMeters, heightMeters) * 0.04
  rect.setAttribute('x', '0'); rect.setAttribute('y', '0')
  rect.setAttribute('width', String(widthMeters)); rect.setAttribute('height', String(heightMeters))
  rect.setAttribute('rx', String(radius)); rect.setAttribute('ry', String(radius))
  rect.setAttribute('class', 'ws-mission-area-outline')
  rect.setAttribute('vector-effect', 'non-scaling-stroke')
  svg.append(rect)
  return svg
}

const formatKilometres = (meters: number) => (meters / 1000).toFixed(meters % 100 === 0 ? 1 : 2)

export function MissionMap({ layoutKey, mission, stopSettings, selectedId, inspectionRequest, onSelect }: Props) {
  const rootRef = useRef<HTMLElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scaleHostRef = useRef<HTMLDivElement>(null)
  const readoutRef = useRef<HTMLSpanElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef(new Map<string, L.Marker>())
  const selectedRef = useRef<string | null>(null)
  const resetRef = useRef<() => void>(() => {})
  // Set once the user pans or zooms; automatic refits stop until Reset view.
  const userMovedRef = useRef(false)
  const autoFitRef = useRef<() => void>(() => {})
  const revealRef = useRef<() => void>(() => {})
  const labelsRef = useRef<() => void>(() => {})
  const [enabledLayers, setEnabledLayers] = useState<string[]>([])
  const [failedLayers, setFailedLayers] = useState<string[]>([])
  const [imagery, setImagery] = useState<Imagery>('nasa')
  const [nasaStatus, setNasaStatus] = useState<NasaStatus>(() => typeof navigator !== 'undefined' && navigator.onLine === false ? 'failed' : 'loading')
  const [terrainFailed, setTerrainFailed] = useState(false)
  const [showGrid, setShowGrid] = useState(false)
  const [detailZoom, setDetailZoom] = useState(true)

  const area = missionAreaMetres(mission)
  const areaLabel = `Mission area · ${formatKilometres(area.max.xMeters - area.min.xMeters)} × ${formatKilometres(area.max.yMeters - area.min.yMeters)} km`
  const showNasa = imagery === 'nasa' && nasaStatus !== 'failed'

  useEffect(() => {
    const container = containerRef.current
    const scaleHost = scaleHostRef.current
    const readout = readoutRef.current
    if (!container || !scaleHost || !readout) return

    if (import.meta.env.DEV) {
      [mission.base, ...mission.stops].forEach(location => {
        const brief = researchBriefPositions[location.id]
        if (brief && (Math.abs(brief.xMeters - location.position.xMeters) > 1 || Math.abs(brief.yMeters - location.position.yMeters) > 1)) {
          console.warn(`Mission position for ${location.id} differs from geoFrame.ts researchBriefPositions.`)
        }
      })
    }

    const limit = marsTrek.panLimitMetres
    const map = L.map(container, {
      crs: MarsCRS,
      zoomControl: false,
      minZoom: marsTrek.minZoom,
      maxZoom: marsTrek.maxZoom,
      maxBounds: L.latLngBounds(toLatLon({ xMeters: -limit, yMeters: -limit }), toLatLon({ xMeters: limit, yMeters: limit })),
      maxBoundsViscosity: 0.85,
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
    map.createPane('imagery').style.zIndex = '200'
    map.createPane('terrain').style.zIndex = '150'
    map.setView([origin.latitude, origin.longitude], 14)
    map.attributionControl.setPrefix('Leaflet')

    // Soft vignette over the imagery and under the markers. It stays fixed to the viewport while the map moves.
    const vignettePane = map.createPane('vignette')
    vignettePane.style.zIndex = '390'
    vignettePane.style.pointerEvents = 'none'
    const vignette = L.DomUtil.create('div', 'ws-map-vignette', vignettePane)
    const placeVignette = () => {
      const size = map.getSize()
      vignette.style.width = `${size.x}px`
      vignette.style.height = `${size.y}px`
      L.DomUtil.setPosition(vignette, map.containerPointToLayerPoint([0, 0]))
    }
    map.on('move zoom resize', placeVignette)
    placeVignette()

    const bounds = L.latLngBounds(missionBounds(mission))
    const metres = missionAreaMetres(mission)
    L.svgOverlay(missionAreaOutline(metres.max.xMeters - metres.min.xMeters, metres.max.yMeters - metres.min.yMeters), bounds,
      { interactive: false, className: 'ws-mission-area' }).addTo(map)
    const areaMarker = L.marker(toMapPosition({ xMeters: metres.min.xMeters, yMeters: metres.max.yMeters }), {
      icon: L.divIcon({ className: 'ws-area-label', html: `<span>${areaLabel}</span>`, iconSize: [0, 0], iconAnchor: [-6, 28] }),
      interactive: false, keyboard: false,
    }).addTo(map)

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
        title: `Inspect ${location.name}${isBase ? ', base' : ', science stop'}. Provisional position.`,
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
      // A label hidden to avoid overlap still shows while its marker is hovered or focused.
      const force = (on: boolean) => () => marker.getTooltip()?.getElement()?.classList.toggle('is-forced', on)
      element?.addEventListener('mouseenter', force(true))
      element?.addEventListener('mouseleave', force(false))
      element?.addEventListener('focus', force(true))
      element?.addEventListener('blur', force(false))
      markers.set(location.id, marker)
    })
    markersRef.current = markers

    // Labels: the selected stop first, then the base and stops in list order, then the mission-area label.
    const placeLabels = () => {
      const order = [...markers.keys()].sort((a, b) => Number(b === selectedRef.current) - Number(a === selectedRef.current))
      const entries: LabelEntry[] = order.flatMap(id => {
        const marker = markers.get(id)
        const label = marker?.getTooltip()?.getElement()
        const markElement = marker?.getElement()?.querySelector<HTMLElement>('.ws-marker') ?? undefined
        return label ? [{ label, marker: markElement, flippable: id !== mission.base.id }] : []
      })
      const areaElement = areaMarker.getElement()?.querySelector<HTMLElement>('span')
      if (areaElement) entries.push({ label: areaElement })
      const rect = container.getBoundingClientRect()
      const area = freeArea(container)
      layoutLabels(entries, { left: rect.left + area.left, top: rect.top + area.top, right: rect.left + area.right, bottom: rect.top + area.bottom })
    }
    labelsRef.current = placeLabels
    map.on('zoomend moveend resize ws:layout', placeLabels)

    // Scale bar from Leaflet's measurement on the Mars sphere.
    const scale = L.control.scale({ imperial: false, maxWidth: 110, position: 'bottomleft' }).addTo(map)
    scaleHost.append(scale.getContainer()!)

    const showPosition = (event: L.LeafletMouseEvent) => {
      const local = toLocalMetres(event.latlng.lat, event.latlng.lng)
      readout.textContent = `x ${Math.round(local.xMeters)} m · y ${Math.round(local.yMeters)} m`
    }
    const clearPosition = () => { readout.textContent = 'x — · y —' }
    const trackZoom = () => setDetailZoom(map.getZoom() >= marsTrek.detail.minZoom)
    map.on('mousemove', showPosition)
    map.on('mouseout', clearPosition)
    map.on('zoomend', trackZoom)

    // Moves made by the app itself are not user moves.
    let programmatic = false
    const programmaticMove = (move: () => void) => {
      programmatic = true
      try { move() } finally { programmatic = false }
    }
    map.on('movestart zoomstart', () => { if (!programmatic) userMovedRef.current = true })

    // The one framing function for every stage: base, all stops and the mission-area boundary (the bounds
    // already contain all of them plus a margin), inside the part of the map not covered by panels.
    // Extra horizontal room keeps stop labels clear of the panels.
    const fitMission = () => programmaticMove(() => {
      map.fitBounds(bounds, { ...viewportPadding(container, [40, 24]), animate: false, maxZoom: 16 })
    })
    const reveal = () => {
      const marker = selectedRef.current ? markers.get(selectedRef.current) : undefined
      if (!marker) return
      programmaticMove(() => map.panInside(marker.getLatLng(), { ...viewportPadding(container, [90, 30]), animate: false }))
    }
    // Refit after layout changes unless the user has taken over the view; then only keep the selection visible.
    const autoFit = () => {
      if (userMovedRef.current) reveal()
      else fitMission()
    }
    resetRef.current = () => {
      userMovedRef.current = false
      fitMission()
    }
    revealRef.current = reveal
    autoFitRef.current = autoFit
    fitMission()
    trackZoom()
    placeLabels()

    let frame = 0
    const refresh = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        programmaticMove(() => map.invalidateSize({ pan: false }))
        autoFit()
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
      autoFitRef.current = () => {}
      labelsRef.current = () => {}
    }
  }, [mission, onSelect, areaLabel])

  useEffect(() => {
    const frame = requestAnimationFrame(() => autoFitRef.current())
    return () => cancelAnimationFrame(frame)
  }, [layoutKey])

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
    labelsRef.current()
  }, [selectedId, inspectionRequest, mission])

  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const excluded = id !== mission.base.id && !stopSettings[id]?.included
      const element = marker.getElement()
      element?.classList.toggle('is-excluded', excluded)
      ;['1', '2', '3'].forEach(priority => element?.classList.toggle(`priority-${priority}`, stopSettings[id]?.priority === priority))
      const location = id === mission.base.id ? mission.base : mission.stops.find(stop => stop.id === id)
      element?.setAttribute('aria-label', `Inspect ${location?.name}. ${excluded ? 'Excluded from expedition' : 'Included in expedition'}. Provisional position.`)
      marker.getTooltip()?.getElement()?.classList.toggle('is-excluded', excluded)
    })
  }, [stopSettings, mission])

  // NASA Mars Trek imagery: Jezero CTX for context at every zoom, HiRISE on top from zoom 13.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !showNasa) return
    let loads = 0
    let failures = 0
    const onLoad = () => {
      loads += 1
      if (loads === 1) setNasaStatus('ok')
    }
    const onError = () => {
      failures += 1
      if (loads === 0 && failures >= TILE_FAILURES_BEFORE_FALLBACK) setNasaStatus('failed')
    }
    const common = { pane: 'imagery', className: 'ws-nasa-tiles', maxZoom: marsTrek.maxZoom, noWrap: true, attribution: marsTrek.attribution }
    const context = L.tileLayer(marsTrek.context.url, { ...common, maxNativeZoom: marsTrek.context.maxNativeZoom, bounds: marsTrek.context.bounds })
    const detail = L.tileLayer(marsTrek.detail.url, { ...common, minZoom: marsTrek.detail.minZoom, maxNativeZoom: marsTrek.detail.maxNativeZoom, bounds: marsTrek.detail.bounds })
    ;[context, detail].forEach(layer => {
      layer.on('tileload', onLoad)
      layer.on('tileerror', onError)
      layer.addTo(map)
    })
    const onOffline = () => { if (loads === 0) setNasaStatus('failed') }
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('offline', onOffline)
      // remove() before off(): Leaflet drops the layer's attribution from a 'remove' listener that off() would clear.
      ;[context, detail].forEach(layer => { layer.remove(); layer.off() })
    }
  }, [mission, showNasa])

  // Retry NASA imagery automatically when the browser comes back online.
  useEffect(() => {
    if (nasaStatus !== 'failed') return
    const onOnline = () => setNasaStatus('loading')
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [nasaStatus])

  // Illustrative terrain: the offline fallback, or the user's choice in Layers.
  useEffect(() => {
    const map = mapRef.current
    if (!map || showNasa) return
    const { min, max } = terrainOverlay.bounds
    const image = L.imageOverlay(terrainOverlay.url, L.latLngBounds([toMapPosition(min), toMapPosition(max)]), { pane: 'terrain', interactive: false, className: 'ws-terrain' })
    image.on('load', () => setTerrainFailed(false))
    image.on('error', () => { setTerrainFailed(true); image.setOpacity(0) })
    image.addTo(map)
    return () => { image.remove(); image.off() }
  }, [mission, showNasa])

  // Optional grid in local metres.
  useEffect(() => {
    const map = mapRef.current
    const root = rootRef.current
    const container = containerRef.current
    if (!map || !root || !container || !showGrid) return
    const grid = createMetreGrid(map, root, () => freeArea(container))
    return () => grid.remove()
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
    return () => overlays.forEach(overlay => { overlay.remove(); overlay.off() })
  }, [mission, enabledLayers])

  function toggleLayer(id: string) {
    setFailedLayers(previous => previous.filter(failedId => failedId !== id))
    setEnabledLayers(previous => previous.includes(id) ? previous.filter(layerId => layerId !== id) : [...previous, id])
  }
  function chooseImagery(next: Imagery) {
    setImagery(next)
    if (next === 'nasa') setNasaStatus('loading')
    else setTerrainFailed(false)
  }

  const layerMenu = <>
    <fieldset>
      <legend className="ws-label">Base map</legend>
      <label className="ws-check"><input type="radio" name="base-map" checked={imagery === 'nasa'} onChange={() => chooseImagery('nasa')} />
        NASA imagery<span className="ws-check-note">{nasaStatus === 'failed' && imagery === 'nasa' ? 'Unavailable · showing illustrative terrain' : 'HiRISE 25 cm + CTX 6 m · Mars Trek'}</span></label>
      <label className="ws-check"><input type="radio" name="base-map" checked={imagery === 'illustrative'} onChange={() => chooseImagery('illustrative')} />
        Illustrative terrain{terrainFailed && <span className="ws-check-note">Image unavailable</span>}</label>
    </fieldset>
    <fieldset>
      <legend className="ws-label">Overlays</legend>
      <label className="ws-check"><input type="checkbox" checked={showGrid} onChange={() => setShowGrid(value => !value)} />Coordinate grid<span className="ws-check-note">Metres from Three Forks Base</span></label>
    </fieldset>
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
    <p>Positions are local metres east (x) and north (y) of Three Forks Base at {origin.latitude}&deg; N, {origin.longitude}&deg; E, placed on Mars with a local tangent plane on the Mars 2000 sphere. Positions are provisional, from the rover position file and HiRISE.</p>
    <p>Imagery: NASA Mars Trek, HiRISE 25 cm orthomosaic and CTX 6 m mosaic of Jezero, colourised for display. {marsTrek.attribution}.</p>
    <p>Observation durations are synthetic. Route calculations pending.</p>
  </>

  const imageryNote = showNasa
    ? `NASA ${detailZoom ? 'HiRISE' : 'CTX'} · colourised for display`
    : terrainFailed ? 'Terrain image unavailable'
      : imagery === 'nasa' ? 'Offline · illustrative terrain' : 'Illustrative terrain'

  return (
    <section ref={rootRef} className={showNasa ? 'mission-map has-nasa-imagery' : 'mission-map'} aria-label="Expedition map of Jezero Crater">
      <div ref={containerRef} className="leaflet-workspace" role="region" aria-label="Interactive map. Arrow keys pan. Plus and minus zoom." />
      <MapControls onZoomIn={() => mapRef.current?.zoomIn()} onZoomOut={() => mapRef.current?.zoomOut()} onReset={() => resetRef.current()}
        layers={layerMenu} notes={notes} />
      <div className="ws-map-foot">
        {failedLayers.length > 0 && <div className="ws-map-alerts">
          {failedLayers.map(id => <p role="alert" key={id}>Could not load {mission.layers.find(layer => layer.id === id)?.kind} layer. Markers remain available. Toggle the layer to retry.</p>)}
        </div>}
        <div ref={scaleHostRef} className="ws-scale-host" />
        <span ref={readoutRef} className="ws-readout" aria-hidden="true">x — · y —</span>
        <span className="ws-pill ws-terrain-pill" role="status">{imageryNote}</span>
      </div>
    </section>
  )
}
